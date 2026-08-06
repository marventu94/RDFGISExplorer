import {
  Component,
  OnInit,
  OnDestroy,
  ElementRef,
  ViewChild,
  HostListener,
  HostBinding,
  NgZone,
  ChangeDetectorRef,
  effect,
  inject,
} from '@angular/core';
import { SelectionService } from '@core/services/selection.service';
import { combineLatest, Subject, takeUntil } from 'rxjs';
import { debounceTime, filter } from 'rxjs/operators';
import cytoscape from 'cytoscape';
import cola from 'cytoscape-cola';
import dagre from 'cytoscape-dagre';
import type { QueryResult, NormalizedNode, Selection } from '@shared/models';
import { DashboardViewStateService } from '@core/services/dashboard-view-state.service';
import { CoverageChipComponent } from '@shared/components/coverage-chip/coverage-chip.component';
import { createGraphStyle } from './graph-style';
import { chooseGraphLayout, LAYOUT_CONFIGS } from './graph-layouts';
import { buildGraphElements, type BuiltGraph } from './graph-elements';
import { EntityColorService } from '@core/services/entity-color.service';
import { LimitsService } from '@core/services/limits.service';

cytoscape.use(cola);
cytoscape.use(dagre);

type GraphLayout = 'cola' | 'dagre' | 'grid';
type GraphDetailLevel = 'summary' | 'exploration' | 'detail';
type QueryState = 'no-query' | 'no-edges' | 'filtered-zero' | 'normal';

/** Cuánto se separa un nodo nuevo del vecino que se usa para ubicarlo. */
const NEW_NODE_OFFSET = 40;
/** Ventana en la que se ignoran los eventos de viewport propios (animaciones). */
const SUPPRESS_VIEWPORT_MS = 800;

@Component({
  selector: 'app-graph-view',
  standalone: true,
  imports: [CoverageChipComponent],
  templateUrl: './graph-view.component.html',
  styleUrls: ['./graph-view.component.scss'],
})
export class GraphViewComponent implements OnInit, OnDestroy {
  @ViewChild('cyContainer', { static: true }) container!: ElementRef<HTMLDivElement>;

  cy?: cytoscape.Core;
  currentLayout: GraphLayout = 'cola';
  detailLevel: GraphDetailLevel = 'exploration';
  private expandedSuperEdgeIds = new Set<string>();
  readonly detailLevels = [
    { value: 'summary' as const, label: 'Resumen' },
    { value: 'exploration' as const, label: 'Exploración' },
    { value: 'detail' as const, label: 'Detalle' },
  ];
  readonly layoutOptions = [
    { value: 'cola' as const, label: 'cola' },
    { value: 'dagre' as const, label: 'dagre' },
    { value: 'grid' as const, label: 'grid' },
  ];

  queryState: QueryState = 'no-query';
  /** Texto del chip de cobertura; vacío cuando el grafo muestra todo sin recortes. */
  coverageLabel = '';
  originalNodeCount = 0;
  filteredNodeCount = 0;
  activeFilterCount = 0;

  @HostBinding('class.is-active-view') isActiveView = false;

  tooltipText = '';
  tooltipVisible = false;
  tooltipX = 0;
  tooltipY = 0;

  private destroy$ = new Subject<void>();
  /** Índice uri → nodo, para resolver el tap sin recorrer el array. */
  private nodeIndex = new Map<string, NormalizedNode>();
  private resizeObserver?: ResizeObserver;
  private suppressViewportEmit = false;
  private suppressTimer?: ReturnType<typeof setTimeout>;
  private readonly viewportChange$ = new Subject<void>();
  private markActiveListener?: () => void;
  /** Firma del conjunto de elementos dibujado; si no cambia, no se re-corre layout. */
  private lastTopologyKey: string | null = null;
  private shouldFitAfterLayout = false;
  private pendingCamera?: { pan: { x: number; y: number }; zoom: number };
  /** Simulación de cola encendida mientras dura un arrastre. */
  private liveLayout?: cytoscape.Layouts;
  /** Nodos bloqueados durante el arrastre para que la física no los toque. */
  private lockedForDrag?: cytoscape.NodeCollection;
  /** Evita que el grab que re-emitimos para cola vuelva a entrar a nuestro handler. */
  private reentrantGrab = false;
  /** Nodos que el usuario acomodó a mano; el layout deja de ubicarlos. */
  private readonly manualPositions = new Map<string, { x: number; y: number }>();

  /**
   * Cap de nodos dibujados (red de seguridad). Viene de /api/config
   * (limits.graphMaxNodes) vía LimitsService; queda como campo mutable para
   * que los specs lo pisen por reflection.
   */
  MAX_NODES = 300;

  /** Último resultado visible dibujado; lo usa el rebuild por cambio de límite. */
  private lastVisibleResult: QueryResult | null = null;
  private lastLotState: { lotCount: number; currentLot: number } = { lotCount: 1, currentLot: 1 };

  private readonly viewState = inject(DashboardViewStateService);
  private readonly colorService = inject(EntityColorService);
  private readonly limitsService = inject(LimitsService);

  constructor(
    private selectionService: SelectionService,
    private ngZone: NgZone,
    private cdr: ChangeDetectorRef,
  ) {
    // Cuando llega la config se aplica el cap configurado (en tests el
    // LimitsService queda con defaults y el spec pisa MAX_NODES después).
    effect(() => {
      const maxNodes = this.limitsService.limits().graphMaxNodes;
      const changed = maxNodes !== this.MAX_NODES;
      this.MAX_NODES = maxNodes;
      // El cap nuevo solo aplicaba a la próxima emisión; si ya hay grafo
      // dibujado se reconstruye una sola vez con los mismos datos. Sin cambio
      // de valor (primer run incluido) no se toca nada.
      if (changed) this.rebuildGraphForLimitChange();
    });
  }

  ngOnInit(): void {
    const storedGraphState = this.viewState.graphState();
    this.detailLevel = storedGraphState?.detailLevel ?? 'exploration';
    this.expandedSuperEdgeIds = new Set(storedGraphState?.expandedSuperEdgeIds ?? []);
    this.initResizeObserver();
    this.bindContainerListeners();

    combineLatest([
      this.selectionService.queryResult$,
      this.selectionService.visibleQueryResult$,
      this.selectionService.activeFilters$,
      this.selectionService.lotState$,
    ])
      .pipe(takeUntil(this.destroy$))
      .subscribe(([original, visible, filters, lotState]) => {
        this.activeFilterCount = filters.length;
        this.coverageLabel = '';
        this.indexNodes(original, visible);

        if (!visible || visible.nodes.length === 0) {
          if (!original || original.nodes.length === 0) {
            this.queryState = 'no-query';
          } else if (filters.length > 0) {
            this.queryState = 'filtered-zero';
            this.originalNodeCount = original.nodes.length;
          } else {
            this.queryState = 'no-query';
          }
          this.destroyGraph();
          this.cdr.markForCheck();
          return;
        }

        this.filteredNodeCount = visible.nodes.length;
        this.originalNodeCount = original?.nodes.length ?? visible.nodes.length;
        this.queryState = visible.edges.length === 0 ? 'no-edges' : 'normal';
        this.lastVisibleResult = visible;
        this.lastLotState = { lotCount: lotState.lotCount, currentLot: lotState.currentLot };

        const built = this.buildElements(visible);
        this.coverageLabel = this.buildCoverageLabel(built, visible, lotState.lotCount, lotState.currentLot);
        this.syncGraph(built);
        this.cdr.markForCheck();
      });

    this.selectionService.selectedNode$
      .pipe(
        takeUntil(this.destroy$),
        filter((sel: Selection) => sel.source !== 'graph'),
      )
      .subscribe((sel: Selection) => {
        if (!this.cy) return;
        if (!sel.node) {
          // Un clear externo (p. ej. desde otra vista) también limpia el
          // resalte; antes solo se actuaba cuando había nodo y las clases
          // is-selected/is-dimmed quedaban pintadas.
          this.clearFocusClasses();
          return;
        }
        this.panToNode(sel.node.uri);
        this.applyFocusContext(sel.node.uri);
      });

    this.viewportChange$
      .pipe(takeUntil(this.destroy$), debounceTime(500))
      .subscribe(() => {
        this.emitFocusFromViewport();
        this.persistGraphState();
      });

    this.selectionService.activeView$.pipe(takeUntil(this.destroy$)).subscribe((v) => {
      this.isActiveView = v === 'graph';
      this.cdr.markForCheck();
    });

    this.selectionService.focus$
      .pipe(
        takeUntil(this.destroy$),
        filter(
          (f) =>
            f.source !== null &&
            f.source !== 'graph' &&
            this.selectionService.getActiveView() !== 'graph',
        ),
      )
      .subscribe((f) => {
        // Foco externo vacío (otra vista dejó de tener nada en viewport):
        // se limpia el dimming en vez de dejarlo congelado.
        if (f.uris.size === 0) {
          this.clearFocusClasses();
          return;
        }
        this.applyExternalFocus(f.uris);
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    this.resizeObserver?.disconnect();
    // La simulación de cola corre en un loop de rAF: sin esto seguiría viva.
    this.liveLayout?.stop();
    this.liveLayout = undefined;
    if (this.suppressTimer) clearTimeout(this.suppressTimer);
    const container = this.container?.nativeElement;
    if (container && this.markActiveListener) {
      container.removeEventListener('pointerdown', this.markActiveListener);
      container.removeEventListener('wheel', this.markActiveListener);
      this.markActiveListener = undefined;
    }
    this.cy?.destroy();
  }

  @HostListener('window:resize')
  onWindowResize(): void {
    this.cy?.resize();
  }

  setLayout(layout: GraphLayout): void {
    this.currentLayout = layout;
    // Cambiar de layout es pedir explícitamente que se reordene todo, así que se
    // descarta el acomodo manual (si no, esos nodos quedarían clavados).
    this.manualPositions.clear();
    this.persistGraphState();
    if (!this.cy) return;
    // Cambio de layout pedido por el usuario: acá sí corresponde re-encuadrar.
    this.shouldFitAfterLayout = true;
    this.cy.layout(this.getLayoutOptions(layout)).run();
  }

  fit(): void {
    this.cy?.fit(undefined, 50);
  }

  resetZoom(): void {
    if (!this.cy) return;
    this.cy.zoom(1);
    this.cy.center();
  }

  // ---------------------------------------------------------------------------
  // Ciclo de vida del grafo
  // ---------------------------------------------------------------------------

  /**
   * Actualiza el grafo en su lugar. La clave está en no reconstruir la instancia:
   * `visibleQueryResult$` y `lotState$` dependen de `_selectedNode$` (pinning del
   * lote), así que cada click re-emitía y antes eso destruía cytoscape y re-corría
   * el layout completo — de ahí que los nodos se reacomodaran y se perdiera la
   * cámara en cada click.
   */
  private syncGraph(built: BuiltGraph): void {
    const key = this.topologyKey(built.elements);

    if (!this.cy) {
      this.createGraph(built.elements);
      this.lastTopologyKey = key;
      return;
    }

    if (key === this.lastTopologyKey) {
      // Caso dominante: el conjunto de elementos no cambió (p. ej. un click en un
      // nodo ya visible). Solo se refrescan los datos; ni layout ni cámara.
      this.updateElementData(built.elements);
      return;
    }

    this.patchGraph(built.elements);
    this.lastTopologyKey = key;
  }

  private createGraph(elements: cytoscape.ElementDefinition[]): void {
    const stored = this.viewState.graphState();
    const defaultLayout: GraphLayout = elements.some((e) => 'source' in (e.data ?? {}))
      ? chooseGraphLayout(this.lastVisibleResult ?? { nodes: [], edges: [] })
      : 'grid';
    const storedLayout = stored?.layout;
    this.currentLayout = storedLayout && storedLayout in LAYOUT_CONFIGS
      ? (storedLayout as GraphLayout)
      : defaultLayout;
    this.detailLevel = stored?.detailLevel ?? 'exploration';
    this.expandedSuperEdgeIds = new Set(stored?.expandedSuperEdgeIds ?? []);

    this.cy = cytoscape({
      container: this.container.nativeElement,
      elements,
       style: createGraphStyle(this.colorService, () => false, () => this.detailLevel),
      // Antes acá iba `defaultLayout` mientras currentLayout venía del estado
      // guardado: el dropdown decía una cosa y el grafo dibujaba otra.
      layout: this.getLayoutOptions(this.currentLayout),
      // No pasar wheelSensitivity: el default ya es 1 y Cytoscape >= 3.31
      // normaliza el scroll por deltaMode (fix para Firefox/Linux integrado).
      // Definir la opción, incluso en 1.0, solo dispara el warning de consola.
      minZoom: 0.05,
      maxZoom: 5,
    });

    this.manualPositions.clear();
    for (const [uri, pos] of Object.entries(stored?.manualPositions ?? {})) {
      this.manualPositions.set(uri, pos);
    }

    // Si hay cámara guardada se restaura en vez de encuadrar, así volver al slot
    // no pierde el zoom.
    if (stored?.pan && typeof stored.zoom === 'number') {
      this.pendingCamera = { pan: stored.pan, zoom: stored.zoom };
      this.shouldFitAfterLayout = false;
    } else {
      this.shouldFitAfterLayout = true;
    }

    this.cy.on('layoutstop', () => this.onLayoutStop());
    this.bindGraphEvents();
  }

  private onLayoutStop(): void {
    if (!this.cy) return;
    // El acomodo manual gana sobre lo que haya decidido el layout.
    this.applyManualPositions();
    if (this.pendingCamera) {
      const camera = this.pendingCamera;
      this.pendingCamera = undefined;
      this.suppressViewport();
      this.cy.zoom(camera.zoom);
      this.cy.pan(camera.pan);
      return;
    }
    if (this.shouldFitAfterLayout) {
      this.shouldFitAfterLayout = false;
      this.suppressViewport();
      this.cy.fit(undefined, 50);
    }
  }

  private destroyGraph(): void {
    this.liveLayout?.stop();
    this.liveLayout = undefined;
    this.lockedForDrag?.unlock();
    this.lockedForDrag = undefined;
    this.cy?.destroy();
    this.cy = undefined;
    this.lastTopologyKey = null;
    this.pendingCamera = undefined;
  }

  /** Firma estable del conjunto de elementos: si no cambia, la topología es la misma. */
  private topologyKey(elements: cytoscape.ElementDefinition[]): string {
    const ids = elements.map((e) => String((e.data as { id?: unknown })?.id ?? ''));
    ids.sort();
    return ids.join('\u0000');
  }

  private updateElementData(elements: cytoscape.ElementDefinition[]): void {
    const cy = this.cy;
    if (!cy) return;
    cy.batch(() => {
      for (const def of elements) {
        const data = def.data as { id?: unknown } | undefined;
        if (!data?.id) continue;
        const ele = cy.getElementById(String(data.id));
        if (!ele.empty()) ele.data(data);
      }
    });
  }

  /** Agrega/quita/actualiza elementos y coloca solo los nuevos, sin mover el resto. */
  private patchGraph(elements: cytoscape.ElementDefinition[]): void {
    const cy = this.cy;
    if (!cy) return;

    const next = new Map<string, cytoscape.ElementDefinition>();
    for (const def of elements) {
      const data = def.data as { id?: unknown } | undefined;
      if (data?.id) next.set(String(data.id), def);
    }

    const addedIds = new Set<string>();

    cy.batch(() => {
      cy.elements()
        .filter((ele) => !next.has(ele.id()))
        .remove();

      // `elements` viene con los nodos antes que las aristas y el Map preserva
      // ese orden, así que ninguna arista se agrega antes que sus extremos.
      const toAdd: cytoscape.ElementDefinition[] = [];
      next.forEach((def, id) => {
        const existing = cy.getElementById(id);
        if (existing.empty()) {
          toAdd.push(def);
          addedIds.add(id);
        } else {
          existing.data(def.data);
        }
      });
      if (toAdd.length > 0) cy.add(toAdd);
    });

    if (addedIds.size === 0) return;

    // Un nodo que vuelve y ya tenía acomodo manual va directo a su lugar; solo
    // los realmente nuevos pasan por el layout.
    const fresh = new Set<string>();
    for (const id of addedIds) {
      const manual = this.manualPositions.get(id);
      if (!manual) {
        fresh.add(id);
        continue;
      }
      const node = cy.getElementById(id);
      if (!node.empty()) node.position(manual);
    }

    if (fresh.size === 0) return;

    this.placeNewNodes(fresh);
    this.runIncrementalLayout(fresh);
  }

  /** Siembra los nodos nuevos junto a un vecino ya ubicado, para que no salgan de (0,0). */
  private placeNewNodes(addedIds: Set<string>): void {
    const cy = this.cy;
    if (!cy) return;
    for (const id of addedIds) {
      const node = cy.getElementById(id);
      if (node.empty() || !node.isNode()) continue;
      const anchors = node
        .neighborhood()
        .nodes()
        .filter((n) => !addedIds.has(n.id()));
      if (anchors.empty()) continue;
      // first() se tipa como SingularElementArgument, que no expone position().
      const p = (anchors.first() as cytoscape.NodeSingular).position();
      node.position({ x: p.x + NEW_NODE_OFFSET, y: p.y + NEW_NODE_OFFSET });
    }
  }

  /**
   * Corre el layout dejando bloqueados los nodos que ya estaban, así solo se
   * ubican los nuevos y el grafo no se reacomoda. cola respeta `node.locked()`.
   */
  private runIncrementalLayout(addedIds: Set<string>): void {
    const cy = this.cy;
    if (!cy) return;

    const preexisting = cy.nodes().filter((n) => !addedIds.has(n.id()));
    preexisting.lock();

    const base = this.getLayoutOptions(this.currentLayout) as unknown as Record<string, unknown>;
    const options = {
      ...base,
      // centerGraph movería también a los bloqueados.
      centerGraph: false,
      fit: false,
    } as unknown as cytoscape.LayoutOptions;

    const layout = cy.layout(options);
    layout.one('layoutstop', () => preexisting.unlock());
    layout.run();
  }

  private initResizeObserver(): void {
    if (typeof ResizeObserver === 'undefined') return;
    this.resizeObserver = new ResizeObserver(() => {
      this.cy?.resize();
    });
    const containerEl = this.container?.nativeElement;
    if (containerEl) {
      this.resizeObserver.observe(containerEl);
    }
  }

  /**
   * Una sola vez por componente. Antes vivían en `bindGraphEvents()`, que corría
   * en cada render sobre el mismo elemento con una closure nueva: se acumulaba un
   * par de listeners por render y nunca se removían.
   */
  private bindContainerListeners(): void {
    const container = this.container?.nativeElement;
    if (!container) return;
    const markActive = () => this.selectionService.markActiveView('graph');
    this.markActiveListener = markActive;
    container.addEventListener('pointerdown', markActive);
    container.addEventListener('wheel', markActive, { passive: true });
  }

  // ---------------------------------------------------------------------------
  // Construcción de elementos y chip
  // ---------------------------------------------------------------------------

  private indexNodes(original: QueryResult | null, visible: QueryResult | null): void {
    this.nodeIndex.clear();
    for (const node of original?.nodes ?? []) this.nodeIndex.set(node.uri, node);
    // Los nodos intermedios que agrega query-topology pueden estar solo en el
    // visible; sin esto el tap sobre ellos no seleccionaba nada.
    for (const node of visible?.nodes ?? []) {
      if (!this.nodeIndex.has(node.uri)) this.nodeIndex.set(node.uri, node);
    }
  }

  /**
   * Wrapper fino sobre `buildGraphElements` (pura, en graph-elements.ts): le
   * inyecta el cap vigente y el nodo seleccionado como pinned, para que lo
   * seleccionado nunca quede fuera del dibujo aunque tenga grado bajo.
   */
  private buildElements(result: QueryResult): BuiltGraph {
    const selected = this.selectionService.getSelectedNodeSnapshot().node;
    return buildGraphElements(result, {
      maxNodes: this.MAX_NODES,
      pinnedUris: selected ? [selected.uri] : [],
      expandedSuperEdgeIds: [...this.expandedSuperEdgeIds],
    });
  }

  setDetailLevel(level: GraphDetailLevel): void {
    this.detailLevel = level;
    this.persistGraphState();
    this.cy?.style().update();
    this.cdr.markForCheck();
  }

  /**
   * Aplica un cambio runtime de `limits.graphMaxNodes` (la config llega async):
   * destruye la instancia y la recrea con los mismos datos, porque el recorte
   * top-N cambia con el cap nuevo y un patch incremental no alcanza. No-op si
   * no hay grafo dibujado.
   */
  private rebuildGraphForLimitChange(): void {
    if (!this.cy || !this.lastVisibleResult) return;
    const visible = this.lastVisibleResult;
    const built = this.buildElements(visible);
    this.coverageLabel = this.buildCoverageLabel(
      built,
      visible,
      this.lastLotState.lotCount,
      this.lastLotState.currentLot,
    );
    this.destroyGraph();
    this.syncGraph(built);
    this.cdr.markForCheck();
  }

  /**
   * Lote y truncado son dos recortes independientes y apilados (los lotes paginan
   * filas, el grafo corta nodos), así que se informan juntos: antes un `else if`
   * hacía desaparecer el aviso de lote justo cuando además había truncado.
   */
  private buildCoverageLabel(
    built: BuiltGraph,
    visible: QueryResult,
    lotCount: number,
    currentLot: number,
  ): string {
    const parts: string[] = [];

    if (lotCount > 1) {
      parts.push(`Lote ${currentLot} de ${lotCount} · ${visible.bindings.length} filas`);
    }

    if (built.totalNodes > built.drawnNodes) {
      const prioritized =
        built.inclusionReasons.selected + built.inclusionReasons['query-entity'];
      parts.push(
        `${built.drawnNodes} de ${built.totalNodes} nodos visibles` +
          (prioritized ? ` · ${prioritized} priorizados por la query` : ''),
      );
      if (built.edgesHiddenByTruncation > 0) {
        const n = built.edgesHiddenByTruncation;
        parts.push(`${n} arista${n === 1 ? '' : 's'} oculta${n === 1 ? '' : 's'}`);
      }
    }

    return parts.join(' · ');
  }

  // ---------------------------------------------------------------------------
  // Interacción
  // ---------------------------------------------------------------------------

  private bindGraphEvents(): void {
    if (!this.cy) return;

    this.cy.on('tap', 'node', (evt) => {
      const nodeUri = evt.target.id() as string;
      const nodeData = this.nodeIndex.get(nodeUri);
      if (nodeData) {
        this.ngZone.run(() => {
          this.selectionService.select(nodeData, 'graph');
        });
      }
      this.applyFocusContext(nodeUri);
    });

    this.cy.on('tap', 'edge', (evt) => {
      const edge = evt.target;
      const id = (edge.data('superEdgeId') as string | undefined) ??
        (edge.data('aggregate') ? edge.id() : undefined);
      if (!id) return;
      if (this.expandedSuperEdgeIds.has(id)) this.expandedSuperEdgeIds.delete(id);
      else this.expandedSuperEdgeIds.add(id);
      this.persistGraphState();
      if (this.lastVisibleResult) this.syncGraph(this.buildElements(this.lastVisibleResult));
    });

    this.cy.on('tap', (evt) => {
      if (
        evt.target === this.cy &&
        (evt.originalEvent?.target as HTMLElement)?.tagName === 'CANVAS'
      ) {
        this.ngZone.run(() => {
          this.selectionService.clearSelection();
        });
        this.applyFocusContext(null);
      }
    });

    this.cy.on('mouseover', 'node', (evt) => {
      this.showTooltip(this.describeNode(evt.target));
    });

    this.cy.on('mouseover', 'edge', (evt) => {
      const edge = evt.target;
      const multiplicity = (edge.data('multiplicity') as number) ?? 1;
      const predicates = (edge.data('predicates') as string[] | undefined) ?? [];
      if (multiplicity > 1) {
        this.showTooltip(
          `${multiplicity} relaciones: ${predicates.join(', ')} · click para expandir`,
        );
        return;
      }
      this.showTooltip(
        (edge.data('predicateLabel') as string) || (edge.data('predicate') as string) || '',
      );
    });

    this.cy.on('mousemove', 'node, edge', (evt) => {
      if (!this.tooltipVisible) return;
      const originalEvent = evt.originalEvent as MouseEvent | undefined;
      if (!originalEvent) return;
      this.ngZone.run(() => {
        this.tooltipX = originalEvent.clientX + 12;
        this.tooltipY = originalEvent.clientY + 12;
        this.cdr.markForCheck();
      });
    });

    this.cy.on('mouseout', 'node, edge', () => {
      this.ngZone.run(() => {
        this.tooltipVisible = false;
        this.cdr.markForCheck();
      });
    });

    // Arrastre suave: la simulación de cola se enciende mientras movés un nodo, y
    // el resto se acomoda por física. Con Shift se mueve solo el nodo agarrado.
    this.cy.on('grab', 'node', (evt) => {
      if (this.reentrantGrab) return;
      const solo = !!(evt.originalEvent as MouseEvent | undefined)?.shiftKey;
      this.startLiveDrag(evt.target as cytoscape.NodeSingular, solo);
    });

    this.cy.on('free', 'node', (evt) => {
      this.endLiveDrag(evt.target as cytoscape.NodeSingular);
    });

    this.cy.on('viewport', () => {
      if (this.suppressViewportEmit) return;
      // No ngZone.run ni markActiveView aquí: el listener wheel/pointerdown del
      // container ya marca activo. Mantener este handler liviano para no
      // disparar change detection en cada tick de scroll.
      this.ngZone.runOutsideAngular(() => this.viewportChange$.next());
    });
  }

  /**
   * Enciende la simulación de cola mientras dura el arrastre. cola escribe las
   * posiciones simuladas salteando el nodo agarrado (`if (!node.grabbed())`), así
   * que ese va exacto donde lo sueltes y solo los vecinos se acomodan, elásticos.
   *
   * Solo aplica con `cola`: dagre/grid son layouts estructurales y una
   * relajación por física les desarmaría el orden.
   */
  private startLiveDrag(node: cytoscape.NodeSingular, solo: boolean): void {
    const cy = this.cy;
    if (!cy || solo || this.liveLayout || this.currentLayout !== 'cola') return;

    // Lo que el usuario ya acomodó queda clavado: la física no lo mueve.
    this.lockedForDrag = cy
      .nodes()
      .filter((n) => n.id() !== node.id() && this.manualPositions.has(n.id()));
    this.lockedForDrag.lock();

    const base = this.getLayoutOptions('cola') as unknown as Record<string, unknown>;
    this.liveLayout = cy.layout({
      ...base,
      // Sin esto la simulación se corta a los maxSimulationTime ms; acá la
      // apagamos nosotros al soltar.
      infinite: true,
      fit: false,
      randomize: false,
      centerGraph: false,
    } as unknown as cytoscape.LayoutOptions);
    this.liveLayout.run();

    // cola registra sus handlers de 'grab free position' dentro de run(), así que
    // el grab que disparó esto ya pasó. Se re-emite para que marque el nodo como
    // fijo en la simulación en vez de tratarlo como partícula libre.
    this.reentrantGrab = true;
    node.emit('grab');
    this.reentrantGrab = false;
  }

  private endLiveDrag(node: cytoscape.NodeSingular): void {
    // La posición donde soltaste es tuya. Los vecinos los acomodó la física, así
    // que no cuentan como acomodo manual y un layout futuro puede reubicarlos.
    this.rememberManualPosition(node);

    if (this.liveLayout) {
      this.liveLayout.stop();
      this.liveLayout = undefined;
    }
    this.lockedForDrag?.unlock();
    this.lockedForDrag = undefined;

    this.persistGraphState();
  }

  private rememberManualPosition(node: cytoscape.NodeSingular): void {
    const p = node.position();
    this.manualPositions.set(node.id(), { x: p.x, y: p.y });
  }

  /** Reafirma el acomodo manual después de cada layout, para que no lo pise. */
  private applyManualPositions(): void {
    const cy = this.cy;
    if (!cy || this.manualPositions.size === 0) return;
    cy.batch(() => {
      this.manualPositions.forEach((pos, uri) => {
        const node = cy.getElementById(uri);
        if (!node.empty()) node.position(pos);
      });
    });
  }

  private showTooltip(text: string): void {
    this.ngZone.run(() => {
      this.tooltipText = text;
      this.tooltipVisible = !!text;
      this.cdr.markForCheck();
    });
  }

  /** Explica en el hover por qué un nodo se ve chico o con menos aristas de las que tiene. */
  private describeNode(node: cytoscape.NodeSingular): string {
    const label = (node.data('label') as string) || node.id();
    const drawn = (node.data('degree') as number) ?? 0;
    const total = (node.data('totalDegree') as number) ?? drawn;
    const connections =
      total === drawn ? `${total} conexiones` : `${total} conexiones (${drawn} dibujadas)`;
    const variable = node.data('queryVariable') as string;
    return variable ? `${label} · ${variable} · ${connections}` : `${label} · ${connections}`;
  }

  private applyFocusContext(focusUri: string | null): void {
    if (!this.cy) return;
    this.clearFocusClasses();
    if (!focusUri) return;

    const focus = this.cy.getElementById(focusUri);
    if (focus.empty()) return;

    const neighbors = focus.closedNeighborhood();
    this.cy.elements().difference(neighbors).addClass('is-dimmed');
    focus.addClass('is-selected');
  }

  private clearFocusClasses(): void {
    this.cy?.elements().removeClass('is-dimmed is-selected is-focus-edge');
  }

  private applyExternalFocus(uris: ReadonlySet<string>): void {
    if (!this.cy) return;
    const matched = this.cy.nodes().filter((n) => uris.has(n.id()));
    if (matched.empty()) {
      this.clearFocusClasses();
      return;
    }

    this.clearFocusClasses();
    this.cy.elements().difference(matched).addClass('is-dimmed');
    matched.connectedEdges().removeClass('is-dimmed').addClass('is-focus-edge');

    if (this.allInsideViewport(matched)) return;

    this.suppressViewport();
    this.cy.animate({
      fit: { eles: matched, padding: 60 },
      duration: 600,
    });
  }

  private emitFocusFromViewport(): void {
    if (!this.cy) return;
    const uris: string[] = [];
    this.cy.nodes().forEach((n) => {
      if (this.intersectsViewport(n)) uris.push(n.id());
    });
    if (uris.length === 0) return;
    this.selectionService.markActiveView('graph');
    this.selectionService.setFocus(uris, 'graph');
  }

  private panToNode(uri: string): void {
    if (!this.cy) return;
    const node = this.cy.getElementById(uri);
    if (node.empty()) return;
    if (this.allInsideViewport(node)) return;

    this.suppressViewport();
    this.cy.animate({
      center: { eles: node },
      duration: 600,
    });
  }

  /** Usa la bounding box: con el centro, un nodo grande a medias dentro no contaba. */
  private intersectsViewport(node: cytoscape.NodeSingular): boolean {
    if (!this.cy) return false;
    const e = this.cy.extent();
    const bb = node.boundingBox();
    return bb.x2 >= e.x1 && bb.x1 <= e.x2 && bb.y2 >= e.y1 && bb.y1 <= e.y2;
  }

  private allInsideViewport(nodes: cytoscape.NodeCollection): boolean {
    if (!this.cy) return false;
    const e = this.cy.extent();
    let inside = true;
    nodes.forEach((n) => {
      const bb = n.boundingBox();
      if (bb.x1 < e.x1 || bb.x2 > e.x2 || bb.y1 < e.y1 || bb.y2 > e.y2) inside = false;
    });
    return inside;
  }

  /**
   * Ignora los eventos de viewport que dispara el propio componente. El timer se
   * reemplaza en cada llamada: con animaciones solapadas, antes quedaba corriendo
   * el timer viejo y la ventana se cerraba antes de tiempo.
   */
  private suppressViewport(ms = SUPPRESS_VIEWPORT_MS): void {
    this.suppressViewportEmit = true;
    if (this.suppressTimer) clearTimeout(this.suppressTimer);
    this.suppressTimer = setTimeout(() => {
      this.suppressViewportEmit = false;
      this.suppressTimer = undefined;
    }, ms);
  }

  /** Único escritor de graphState: cámara y acomodo manual viajan juntos. */
  private persistGraphState(): void {
    if (!this.cy) return;
    const pan = this.cy.pan();
    const manual: Record<string, { x: number; y: number }> = {};
    this.manualPositions.forEach((p, uri) => {
      manual[uri] = p;
    });
    this.viewState.graphState.set({
      layout: this.currentLayout,
      pan: { x: pan.x, y: pan.y },
      zoom: this.cy.zoom(),
      ...(Object.keys(manual).length > 0 ? { manualPositions: manual } : {}),
      detailLevel: this.detailLevel,
      ...(this.expandedSuperEdgeIds.size > 0
        ? { expandedSuperEdgeIds: [...this.expandedSuperEdgeIds] }
        : {}),
    });
  }

  private getLayoutOptions(layout: GraphLayout): cytoscape.LayoutOptions {
    return LAYOUT_CONFIGS[layout]?.options ?? LAYOUT_CONFIGS['cola'].options;
  }
}
