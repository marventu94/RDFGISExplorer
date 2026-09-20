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
import { SelectionService, type LotState } from '@core/services/selection.service';
import { DashboardLoadProgressService } from '@core/services/dashboard-load-progress.service';
import { combineLatest, Subject, takeUntil } from 'rxjs';
import { debounceTime, filter } from 'rxjs/operators';
import cytoscape from 'cytoscape';
import cola from 'cytoscape-cola';
import dagre from 'cytoscape-dagre';
import type { QueryResult, NormalizedNode, Selection, Filter } from '@shared/models';
import { DashboardViewStateService } from '@core/services/dashboard-view-state.service';
import { CoverageChipComponent } from '@shared/components/coverage-chip/coverage-chip.component';
import { createGraphStyle } from './graph-style';
import {
  chooseGraphLayout,
  GRAPH_LAYOUT_OPTIONS,
  LAYOUT_CONFIGS,
  layoutOptionsFor,
  type GraphDetailLevel,
  type GraphLayout,
  type GraphLayoutOption,
} from './graph-layouts';
import { buildGraphElements, type BuiltGraph } from './graph-elements';
import {
  applyCoordinatedFocus,
  collapseBranch,
  createExplorationState,
  enterEntityMode,
  exitToResult,
  expandBranch,
  explorationBreadcrumb,
  explorationSubgraph,
  goBack,
  goToRoot,
  isExplorationActive,
  notifySelection,
  promoteActiveToRoot,
  resetExploration,
  setActiveNode,
  setExplorationBudget,
  togglePin,
  type EntityModeTrigger,
  type ExplorationContext,
  type ExplorationState,
} from './entity-exploration';
import { DEFAULT_SUBGRAPH_BUDGET, type EntitySubgraph } from './entity-subgraph';
import {
  activeBranchItems,
  buildEntityModeElements,
  entityBreadcrumb,
  entityLabelResolver,
  entityMetricsLabel,
  entityWarningsLabel,
  otherBranchItems,
  shortenUri,
  type EntityBranchItem,
  type EntityCrumb,
} from './entity-mode-elements';
import { entityModeStyleRules } from './entity-mode-style';
import {
  EntitySummaryClipboardService,
  type EntitySummaryRequest,
} from './entity-summary-clipboard.service';
import { EntityColorService } from '@core/services/entity-color.service';
import { LimitsService } from '@core/services/limits.service';

cytoscape.use(cola);
cytoscape.use(dagre);

type QueryState = 'no-query' | 'no-edges' | 'filtered-zero' | 'normal';

/** Cuánto se separa un nodo nuevo del vecino que se usa para ubicarlo. */
const NEW_NODE_OFFSET = 40;
/** Ventana en la que se ignoran los eventos de viewport propios (animaciones). */
const SUPPRESS_VIEWPORT_MS = 800;

/** Margen del encuadre de la vista coordinada, en la línea del que usa el mapa. */
const FOCUS_PADDING = 40;
/**
 * Piso de zoom del encuadre coordinado. Un nodo chico mide 20px, así que por
 * debajo de esto los nodos son puntos y las etiquetas (11px) no se leen:
 * preferimos mostrar menos nodos pero legibles. Subilo para acercar más.
 */
const FOCUS_MIN_ZOOM = 0.8;

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
  currentLayout: GraphLayout = 'dagre';
  detailLevel: GraphDetailLevel = 'summary';
  private expandedSuperEdgeIds = new Set<string>();
  private expandedMotifIds = new Set<string>();
  readonly detailLevels = [
    { value: 'summary' as const, label: 'Resumen' },
    { value: 'exploration' as const, label: 'Entidades' },
    { value: 'detail' as const, label: 'Entidades + relaciones' },
  ];
  get availableLayoutOptions(): readonly GraphLayoutOption[] {
    if (this.queryState === 'no-edges' || this.currentLayout === 'grid') {
      return GRAPH_LAYOUT_OPTIONS;
    }
    return GRAPH_LAYOUT_OPTIONS.filter((option) => option.value !== 'grid');
  }

  queryState: QueryState = 'no-query';
  /** Texto del chip de cobertura; vacío cuando el grafo muestra todo sin recortes. */
  coverageLabel = '';
  originalNodeCount = 0;
  filteredNodeCount = 0;
  activeFilterCount = 0;

  private activeView = false;

  /** El indicador coordinado no debe asomar por debajo del overlay de carga. */
  @HostBinding('class.is-active-view')
  get isActiveView(): boolean {
    return this.activeView && !this.loadProgress.active();
  }

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
  /** Resultado completo: el modo entidad lo usa cuando la raíz no está en el lote. */
  private lastOriginalResult: QueryResult | null = null;
  private lastLotState: { lotCount: number; currentLot: number } = { lotCount: 1, currentLot: 1 };

  // ---------------------------------------------------------------------------
  // Modo entidad (etapa 5). Todo este estado es TRANSITORIO: no se persiste en
  // el dashboard (§9 del plan), así que `persistGraphState()` no lo escribe y
  // volver al resultado lo descarta entero.
  // ---------------------------------------------------------------------------

  /** Estado puro de exploración (etapa 4). El componente sólo lo reemplaza. */
  explorationState: ExplorationState = createExplorationState();
  /** Subgrafo vigente; `null` en modo resultado. */
  entitySubgraph: EntitySubgraph | null = null;
  /** Último rechazo o aviso para el usuario; se anuncia con aria-live. */
  explorationMessage = '';
  /** Texto expuesto para copia manual cuando el navegador bloquea el portapapeles. */
  copyFallbackText = '';
  /** Selección explícita vigente, sea cual sea la vista que la originó. */
  private selectedUri: string | null = null;
  private selectedLabel = '';
  /**
   * Foto de la vista de resultado tomada al entrar al modo entidad: volver
   * restaura cámara, layout, nivel y acomodo manual exactamente como estaban.
   */
  private resultViewSnapshot: {
    layout: GraphLayout;
    detailLevel: GraphDetailLevel;
    camera?: { pan: { x: number; y: number }; zoom: number };
    manualPositions: Map<string, { x: number; y: number }>;
  } | null = null;
  /** Cámara a restaurar en el próximo `createGraph`, por encima de la guardada. */
  private restoreCamera?: { pan: { x: number; y: number }; zoom: number };
  /** Acomodo manual a restaurar en el próximo `createGraph`. */
  private restoreManualPositions?: Map<string, { x: number; y: number }>;

  private readonly viewState = inject(DashboardViewStateService);
  private readonly colorService = inject(EntityColorService);
  private readonly limitsService = inject(LimitsService);
  private readonly loadProgress = inject(DashboardLoadProgressService);
  private readonly summaryClipboard = inject(EntitySummaryClipboardService);
  /** Entidad → id del nodo resumen que la agrupa en el lienzo actual. */
  private readonly aggregateByMember = new Map<string, string>();
  /** Nodo dibujado que representa la selección vigente (puede ser un resumen). */
  private selectedDrawnUri: string | null = null;

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
      // El presupuesto local nunca puede pedir más nodos que el cap del lienzo.
      this.explorationState = setExplorationBudget(this.explorationState, {
        maxNodes: Math.min(DEFAULT_SUBGRAPH_BUDGET.maxNodes, maxNodes),
      });
      // El cap nuevo solo aplicaba a la próxima emisión; si ya hay grafo
      // dibujado se reconstruye una sola vez con los mismos datos. Sin cambio
      // de valor (primer run incluido) no se toca nada.
      if (changed) this.rebuildGraphForLimitChange();
    });
  }

  ngOnInit(): void {
    const storedGraphState = this.viewState.graphState();
    this.detailLevel = storedGraphState?.detailLevel ?? 'summary';
    this.expandedSuperEdgeIds = new Set(storedGraphState?.expandedSuperEdgeIds ?? []);
    this.expandedMotifIds = new Set(storedGraphState?.expandedMotifIds ?? []);
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
        this.applyResult(original, visible, filters, lotState);
        // Cartel de carga: los elementos ya están en Cytoscape (el layout puede
        // seguir acomodándolos, pero el grafo ya se ve).
        if (visible) this.loadProgress.reportViewRendered('graph');
      });

    // Selección explícita, venga de donde venga: habilita `Ver estructura` y,
    // dentro del modo entidad, mueve el nodo activo SIN reemplazar la raíz.
    this.selectionService.selectedNode$
      .pipe(takeUntil(this.destroy$))
      .subscribe((sel: Selection) => {
        this.selectedUri = sel.node?.uri ?? null;
        this.selectedLabel = sel.node?.label ?? '';
        if (sel.node && this.isEntityMode) {
          const context = this.explorationContext();
          if (context) {
            const next = notifySelection(context, this.explorationState, sel.node.uri);
            if (next.lastRejection) {
              // Que la selección no pertenezca a la estructura no es un error:
              // el panel ofrece explorarla como nueva raíz y la raíz vigente no
              // se reemplaza sola (§9 del plan).
              this.explorationState = next;
              this.explorationMessage = '';
            } else {
              this.applyExploration(next);
            }
          }
        }
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
          this.selectedDrawnUri = null;
          this.clearFocusClasses();
          return;
        }
        const uri = this.resolveDrawnUri(sel);
        // Se recuerda para poder re-marcarlo cuando llegue un foco coordinado.
        this.selectedDrawnUri = uri;
        if (!uri) {
          this.clearFocusClasses();
          return;
        }
        this.panToNode(uri);
        this.applyFocusContext(uri);
      });

    this.viewportChange$
      .pipe(takeUntil(this.destroy$), debounceTime(500))
      .subscribe(() => {
        this.emitFocusFromViewport();
        this.persistGraphState();
      });

    this.selectionService.activeView$.pipe(takeUntil(this.destroy$)).subscribe((v) => {
      this.activeView = v === 'graph';
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
        if (this.isEntityMode) {
          // §8 del plan: el foco masivo del viewport de otra vista es inerte
          // para la exploración (no entra al modo, no cambia la raíz, no
          // expande) y tampoco reencuadra el subgrafo que el usuario está
          // leyendo. La función pura deja la decisión documentada.
          this.explorationState = applyCoordinatedFocus(this.explorationState, [...f.uris]);
          return;
        }
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
  private syncGraph(elements: cytoscape.ElementDefinition[]): void {
    this.indexAggregates(elements);
    const key = this.topologyKey(elements);

    if (!this.cy) {
      this.createGraph(elements);
      this.lastTopologyKey = key;
      return;
    }

    if (key === this.lastTopologyKey) {
      // Caso dominante: el conjunto de elementos no cambió (p. ej. un click en un
      // nodo ya visible). Solo se refrescan los datos; ni layout ni cámara.
      this.updateElementData(elements);
      return;
    }

    this.patchGraph(elements);
    this.lastTopologyKey = key;
  }

  private createGraph(elements: cytoscape.ElementDefinition[]): void {
    // El modo entidad es transitorio: ni lee el estado guardado del tablero ni
    // deja que su layout/nivel lo pisen. Siempre arranca en Jerárquico (§9).
    const entityMode = this.isEntityMode;
    const stored = entityMode ? null : this.viewState.graphState();
    const defaultLayout: GraphLayout = entityMode
      ? 'dagre'
      : elements.some((e) => 'source' in (e.data ?? {}))
        ? chooseGraphLayout(this.lastVisibleResult ?? { nodes: [], edges: [] })
        : 'grid';
    const storedLayout = stored?.layout;
    this.currentLayout = storedLayout && storedLayout in LAYOUT_CONFIGS
      ? (storedLayout as GraphLayout)
      : defaultLayout;
    if (!entityMode) {
      this.detailLevel = stored?.detailLevel ?? 'summary';
      this.expandedSuperEdgeIds = new Set(stored?.expandedSuperEdgeIds ?? []);
      this.expandedMotifIds = new Set(stored?.expandedMotifIds ?? []);
    }

    this.cy = cytoscape({
      container: this.container.nativeElement,
      elements,
      style: [
        ...createGraphStyle(
          this.colorService,
          () => document.documentElement.dataset['theme'] === 'dark',
          () => this.detailLevel,
        ),
        // Reglas del modo entidad: seleccionan por clases `.entity-*`, que solo
        // existen cuando dibuja el subgrafo explorado.
        ...entityModeStyleRules(() => document.documentElement.dataset['theme'] === 'dark'),
      ],
      // Antes acá iba `defaultLayout` mientras currentLayout venía del estado
      // guardado: el dropdown decía una cosa y el grafo dibujaba otra.
      // El layout real se ejecuta después de registrar `layoutstop`: con
      // `animate: false` puede terminar sincrónicamente durante el constructor
      // y se perdería el fit/restaurado de cámara.
      layout: { name: 'preset' },
      // No pasar wheelSensitivity: el default ya es 1 y Cytoscape >= 3.31
      // normaliza el scroll por deltaMode (fix para Firefox/Linux integrado).
      // Definir la opción, incluso en 1.0, solo dispara el warning de consola.
      minZoom: 0.05,
      maxZoom: 5,
    });

    this.manualPositions.clear();
    const restoredPositions = this.restoreManualPositions;
    this.restoreManualPositions = undefined;
    if (restoredPositions) {
      restoredPositions.forEach((pos, uri) => this.manualPositions.set(uri, pos));
    } else {
      for (const [uri, pos] of Object.entries(stored?.manualPositions ?? {})) {
        this.manualPositions.set(uri, pos);
      }
    }

    // Si hay cámara guardada se restaura en vez de encuadrar, así volver al slot
    // no pierde el zoom. La cámara de `restoreCamera` (volver del modo entidad)
    // gana: es la que el usuario tenía hace un instante.
    const camera =
      this.restoreCamera ??
      (stored?.pan && typeof stored.zoom === 'number'
        ? { pan: stored.pan, zoom: stored.zoom }
        : undefined);
    this.restoreCamera = undefined;
    if (camera) {
      this.pendingCamera = camera;
      this.shouldFitAfterLayout = false;
    } else {
      this.shouldFitAfterLayout = true;
    }

    this.cy.on('layoutstop', () => this.onLayoutStop());
    this.bindGraphEvents();
    // Calcular primero la geometría final evita que los componentes pequeños
    // queden visualmente superpuestos al animar desde la posición (0,0).
    this.cy.layout(this.getInitialLayoutOptions(this.currentLayout)).run();
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

  /**
   * Índice entidad → nodo resumen que la representa.
   *
   * Los niveles de detalle colapsan componentes repetidos en un nodo sintético
   * (`component-motif:…`) que NO es una entidad del resultado: lleva en
   * `memberNodeIds` las que agrupa. Sin este índice, una selección hecha en
   * otra vista sobre una entidad colapsada no encontraba nada que resaltar.
   */
  private indexAggregates(elements: cytoscape.ElementDefinition[]): void {
    this.aggregateByMember.clear();
    for (const element of elements) {
      const data = element.data as {
        id?: string;
        aggregate?: boolean;
        memberNodeIds?: string[];
      };
      if (!data?.aggregate || !data.id || !data.memberNodeIds) continue;
      for (const member of data.memberNodeIds) {
        if (!this.aggregateByMember.has(member)) this.aggregateByMember.set(member, data.id);
      }
    }
  }

  /**
   * Qué nodo dibujado le corresponde a una selección hecha en otra vista.
   *
   * El grafo no dibuja todo: el lote recorta por cantidad de nodos y los
   * niveles de detalle agrupan en motivos. Se busca, en este orden:
   *   1. la entidad seleccionada, si está dibujada;
   *   2. el nodo resumen que la contiene ("está acá adentro");
   *   3. otra entidad de su misma fila que sí esté dibujada;
   *   4. el resumen que contenga a alguna de esas.
   * Mostrar el grupo que la contiene es más fiel que saltar a un pariente.
   */
  private resolveDrawnUri(sel: Selection): string | null {
    if (!this.cy || !sel.node) return null;

    const drawn = (id: string | undefined): string | null =>
      id && this.cy!.getElementById(id).nonempty() ? id : null;

    const exact = drawn(sel.node.uri) ?? drawn(this.aggregateByMember.get(sel.node.uri));
    if (exact) return exact;

    const related = [...(sel.relatedUris ?? [])];
    for (const uri of related) {
      const hit = drawn(uri);
      if (hit) return hit;
    }
    for (const uri of related) {
      const hit = drawn(this.aggregateByMember.get(uri));
      if (hit) return hit;
    }
    return null;
  }

  /** Vuelca en Cytoscape el lote visible, con su chip de cobertura. */
  private applyResult(
    original: QueryResult | null,
    visible: QueryResult | null,
    filters: Filter[],
    lotState: LotState,
  ): void {
    this.activeFilterCount = filters.length;
    this.coverageLabel = '';
    this.indexNodes(original, visible);

    if (!visible || visible.nodes.length === 0) {
      // Sin nada que dibujar no hay estructura que explorar: el modo entidad se
      // descarta en silencio y la vista vuelve a su estado global.
      if (this.isEntityMode) this.discardEntityMode();
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
    this.lastOriginalResult = original;
    this.lastLotState = { lotCount: lotState.lotCount, currentLot: lotState.currentLot };

    if (this.isEntityMode) {
      // Filtros y lotes siguen mandando sobre los datos; la exploración se
      // recalcula sobre el nuevo resultado visible sin perder raíz ni ramas.
      this.syncEntityMode();
      this.cdr.markForCheck();
      return;
    }

    const built = this.buildElements(visible);
    this.coverageLabel = this.buildCoverageLabel(
      built,
      visible,
      lotState.lotCount,
      lotState.currentLot,
    );
    this.syncGraph(built.elements);
    this.cdr.markForCheck();
  }

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
      detailLevel: this.detailLevel,
      expandedMotifIds: [...this.expandedMotifIds],
    });
  }

  setDetailLevel(level: GraphDetailLevel): void {
    if (level === this.detailLevel) return;
    this.detailLevel = level;
    this.persistGraphState();
    if (this.isEntityMode) {
      // El nivel cambia el espacio que ocupan las etiquetas, así que el
      // subgrafo se vuelve a dibujar con el layout recalculado.
      this.destroyGraph();
      this.syncEntityMode();
    } else if (this.cy && this.lastVisibleResult) {
      const visible = this.lastVisibleResult;
      this.destroyGraph();
      this.syncGraph(this.buildElements(visible).elements);
    } else {
      this.cy?.style().update();
    }
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
    if (this.isEntityMode) {
      this.destroyGraph();
      this.syncEntityMode();
      this.cdr.markForCheck();
      return;
    }
    const visible = this.lastVisibleResult;
    const built = this.buildElements(visible);
    this.coverageLabel = this.buildCoverageLabel(
      built,
      visible,
      this.lastLotState.lotCount,
      this.lastLotState.currentLot,
    );
    this.destroyGraph();
    this.syncGraph(built.elements);
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

    if (built.motifCount > 0) {
      const motifWord = built.motifCount === 1 ? 'motivo repetido' : 'motivos repetidos';
      parts.push(
        `${built.abstractedNodes} nodos representados en ${built.motifCount} ${motifWord}`,
      );
    }

    const explicitDrawnNodes = built.drawnNodes - built.aggregateNodes;
    const representedOriginalNodes = built.abstractedNodes + explicitDrawnNodes;
    if (built.totalNodes > representedOriginalNodes) {
      const prioritized =
        built.inclusionReasons.selected + built.inclusionReasons['query-entity'];
      const coverageNoun = built.motifCount > 0 ? 'representados' : 'visibles';
      parts.push(
        `${representedOriginalNodes} de ${built.totalNodes} nodos ${coverageNoun}` +
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
      } else if (this.isEntityMode) {
        // Nodo estructural que no llegó al índice (p. ej. viene del resultado
        // completo): igual puede inspeccionarse, sin emitir selección a las
        // otras vistas.
        const context = this.explorationContext();
        if (context) {
          this.ngZone.run(() => {
            this.applyExploration(setActiveNode(context, this.explorationState, nodeUri));
          });
        }
      }
      // La suscripción a selectedNode$ descarta lo propio (source 'graph'), así
      // que el nodo marcado se recuerda acá para que un foco coordinado
      // posterior no se lo lleve puesto.
      this.selectedDrawnUri = nodeUri;
      this.applyFocusContext(nodeUri);
    });

    this.cy.on('tap', 'edge', (evt) => {
      const edge = evt.target;
      const motifId = edge.data('motifId') as string | undefined;
      if (motifId) {
        if (this.expandedMotifIds.has(motifId)) this.expandedMotifIds.delete(motifId);
        else this.expandedMotifIds.add(motifId);
        this.persistGraphState();
        if (this.lastVisibleResult) {
          const visible = this.lastVisibleResult;
          const built = this.buildElements(visible);
          this.coverageLabel = this.buildCoverageLabel(
            built,
            visible,
            this.lastLotState.lotCount,
            this.lastLotState.currentLot,
          );
          this.destroyGraph();
          this.syncGraph(built.elements);
          this.cdr.markForCheck();
        }
        return;
      }
      const id = (edge.data('superEdgeId') as string | undefined) ??
        (edge.data('aggregate') ? edge.id() : undefined);
      if (!id) return;
      if (this.expandedSuperEdgeIds.has(id)) this.expandedSuperEdgeIds.delete(id);
      else this.expandedSuperEdgeIds.add(id);
      this.persistGraphState();
      if (this.lastVisibleResult) {
        this.syncGraph(this.buildElements(this.lastVisibleResult).elements);
      }
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
      const motifId = edge.data('motifId') as string | undefined;
      if (motifId && edge.data('aggregateKind') === 'repeated-component-edge') {
        const componentCount = (edge.data('componentCount') as number) ?? multiplicity;
        this.showTooltip(
          `${componentCount} componentes con el mismo patrón · ${multiplicity} relaciones · click para expandir`,
        );
        return;
      }
      if (motifId) {
        this.showTooltip(
          `${(edge.data('predicateLabel') as string) || (edge.data('predicate') as string)} · click para contraer el motivo`,
        );
        return;
      }
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
    this.cy?.elements().removeClass('is-dimmed is-muted is-selected is-focus-edge');
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

    // El foco coordinado no puede borrar la selección: se vuelve a marcar y el
    // resto del foco baja de opacidad. Antes `clearFocusClasses` se la llevaba
    // puesta y, con decenas de nodos enfocados, el seleccionado se perdía.
    const selected = this.selectedDrawnUri ? this.cy.getElementById(this.selectedDrawnUri) : null;
    if (selected?.nonempty()) {
      matched.difference(selected).addClass('is-muted');
      selected.removeClass('is-muted is-dimmed').addClass('is-selected');
    }

    if (this.allInsideViewport(matched)) return;

    this.suppressViewport();
    this.frameFocus(matched);
  }

  /**
   * Encuadra los nodos enfocados por la vista coordinada, pero sin alejarse
   * tanto que dejen de leerse.
   *
   * Con `fit` a secas el grafo quedaba inservible: el foco que mandan el mapa y
   * la timeline es todo lo que entra en SU viewport (decenas de entidades más
   * sus vecinos), y encuadrarlas a todas dejaba los nodos como puntos sin
   * etiqueta. Ahora el encuadre tiene un piso de zoom: si entrar todos exige
   * alejarse por debajo de ese piso, se prioriza que se lea y quedan nodos
   * fuera de pantalla.
   */
  private frameFocus(nodes: cytoscape.NodeCollection): void {
    const cy = this.cy;
    if (!cy) return;

    const bb = nodes.boundingBox();
    const width = cy.width();
    const height = cy.height();
    const usableWidth = Math.max(1, width - 2 * FOCUS_PADDING);
    const usableHeight = Math.max(1, height - 2 * FOCUS_PADDING);

    // Mismo cálculo que hace `fit`, para no cambiar el encuadre cuando ya alcanza.
    const fitZoom = Math.min(usableWidth / Math.max(bb.w, 1), usableHeight / Math.max(bb.h, 1));
    const zoom = Math.min(Math.max(fitZoom, FOCUS_MIN_ZOOM), cy.maxZoom());

    const centerX = (bb.x1 + bb.x2) / 2;
    const centerY = (bb.y1 + bb.y2) / 2;

    cy.animate({
      zoom,
      // rendered = modelo * zoom + pan: así el centro del foco queda centrado.
      pan: { x: width / 2 - centerX * zoom, y: height / 2 - centerY * zoom },
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
    // §9 del plan: raíz, historial y selección de la exploración son estado
    // transitorio. Tampoco se guardan su cámara ni su layout, para que volver
    // al resultado encuentre el tablero tal como estaba.
    if (this.isEntityMode) return;
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
      ...(this.expandedMotifIds.size > 0
        ? { expandedMotifIds: [...this.expandedMotifIds] }
        : {}),
    });
  }

  // ---------------------------------------------------------------------------
  // Modo entidad (etapa 5): glue entre el modelo puro y la vista
  // ---------------------------------------------------------------------------

  /** `true` mientras hay una entidad en exploración con raíz resuelta. */
  get isEntityMode(): boolean {
    return isExplorationActive(this.explorationState);
  }

  /** Valor del selector `Resultado completo / Entidad seleccionada`. */
  get explorationMode(): 'result' | 'entity' {
    return this.isEntityMode ? 'entity' : 'result';
  }

  /**
   * La entrada es explícita: hace falta una selección y un grafo dibujado.
   * Recorrer filas o marcadores no alcanza para cambiar de modo (§9).
   */
  get canEnterEntityMode(): boolean {
    return !this.isEntityMode && !!this.selectedUri && !!this.lastVisibleResult;
  }

  get selectedEntityLabel(): string {
    return this.selectedLabel || this.selectedUri || '';
  }

  /** Etiquetas del panel, recalculadas con cada subgrafo (ver `refreshEntityViewModel`). */
  entityRootLabel = '';
  entityRootShortUri = '';
  entityActiveLabel = '';
  entityActiveShortUri = '';
  entityActivePinned = false;
  entityMetrics = '';
  entityWarnings = '';
  entityCrumbs: EntityCrumb[] = [];
  entityBranches: EntityBranchItem[] = [];
  entityOtherBranches: EntityBranchItem[] = [];

  get entityRootUri(): string {
    return this.explorationState.rootUri ?? '';
  }

  get entityActiveUri(): string {
    return this.explorationState.activeUri ?? '';
  }

  get canPromoteActive(): boolean {
    return this.isEntityMode && !!this.entityActiveUri && this.entityActiveUri !== this.entityRootUri;
  }

  get canGoToRoot(): boolean {
    return this.canPromoteActive;
  }

  get canGoBack(): boolean {
    return this.isEntityMode && this.explorationState.history.length > 0;
  }

  get canResetExploration(): boolean {
    const state = this.explorationState;
    return (
      this.isEntityMode &&
      (state.expandedBranchIds.length > 0 ||
        state.collapsedBranchIds.length > 0 ||
        state.pinnedUris.length > 0 ||
        state.activeUri !== state.rootUri)
    );
  }

  /**
   * Selección que no pertenece a la estructura explorada. La raíz NO se
   * reemplaza sola: la UI ofrece explorarla y el usuario decide.
   */
  get entityRootCandidate(): { uri: string; label: string } | null {
    if (!this.isEntityMode || !this.selectedUri) return null;
    if (this.selectedUri === this.entityRootUri) return null;
    const inside = this.entitySubgraph?.nodes.some((node) => node.uri === this.selectedUri);
    return inside ? null : { uri: this.selectedUri, label: this.selectedEntityLabel };
  }

  /** `Ver estructura`: única entrada al modo entidad desde la interfaz. */
  showStructure(trigger: EntityModeTrigger = 'user-action'): void {
    if (!this.selectedUri) return;
    this.enterEntity(this.selectedUri, trigger);
  }

  /** Explora la selección que llegó de otra vista como nueva raíz (acción explícita). */
  exploreSelectedAsRoot(): void {
    const candidate = this.entityRootCandidate;
    if (candidate) this.enterEntity(candidate.uri, 'user-action');
  }

  setExplorationMode(mode: string): void {
    if (mode === 'entity') this.showStructure();
    else this.exitEntityMode();
  }

  /** `Volver al resultado`: restaura cámara, layout y nivel globales. */
  exitEntityMode(): void {
    if (!this.isEntityMode) return;
    this.leaveEntityMode('');
  }

  expandBranchById(branchId: string): void {
    const context = this.explorationContext();
    if (!context) return;
    this.applyExploration(expandBranch(context, this.explorationState, branchId));
  }

  collapseBranchById(branchId: string): void {
    const context = this.explorationContext();
    if (!context) return;
    this.applyExploration(collapseBranch(context, this.explorationState, branchId));
  }

  toggleBranch(item: EntityBranchItem): void {
    if (item.expanded) this.collapseBranchById(item.id);
    else this.expandBranchById(item.id);
  }

  /** Activa un nodo desde el panel (sin pasar por el lienzo). */
  activateNode(uri: string): void {
    const context = this.explorationContext();
    if (!context) return;
    this.applyExploration(setActiveNode(context, this.explorationState, uri));
  }

  togglePinActive(): void {
    const context = this.explorationContext();
    const uri = this.entityActiveUri;
    if (!context || !uri) return;
    this.applyExploration(togglePin(context, this.explorationState, uri));
  }

  promoteActive(): void {
    this.applyExploration(promoteActiveToRoot(this.explorationState));
  }

  backToRoot(): void {
    this.applyExploration(goToRoot(this.explorationState));
  }

  stepBack(): void {
    this.applyExploration(goBack(this.explorationState));
  }

  resetEntityExploration(): void {
    this.applyExploration(resetExploration(this.explorationState));
  }

  async copyCurrentEntityView(): Promise<void> {
    await this.copyEntitySummary('view');
  }

  async copyFullEntityStructure(): Promise<void> {
    await this.copyEntitySummary('structure');
  }

  dismissCopyFallback(): void {
    this.copyFallbackText = '';
  }

  /**
   * Vuelve a una raíz anterior del breadcrumb deshaciendo pasos del historial.
   * Se compone con la operación pura `goBack` en vez de inventar una nueva:
   * el historial sigue siendo la única fuente de verdad del recorrido.
   */
  goToCrumb(uri: string): void {
    if (!this.isEntityMode || uri === this.entityRootUri) return;
    let state = this.explorationState;
    let guard = state.history.length;
    while (guard-- > 0 && state.rootUri !== uri) {
      const previous = goBack(state);
      if (previous.lastRejection) break;
      state = previous;
    }
    this.applyExploration(state.rootUri === uri ? state : this.explorationState);
  }

  /**
   * Atajos de teclado del modo entidad. La interacción no depende del puntero:
   * los controles del panel son botones reales y estos atajos cubren el lienzo.
   */
  @HostListener('keydown', ['$event'])
  onEntityKeydown(event: KeyboardEvent): void {
    if (!this.isEntityMode) return;
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    const tag = (event.target as HTMLElement | null)?.tagName;
    if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;

    const handled = (): void => {
      event.preventDefault();
      event.stopPropagation();
    };

    switch (event.key) {
      case 'Escape':
        handled();
        this.exitEntityMode();
        return;
      case 'Backspace':
        handled();
        this.stepBack();
        return;
      case 'Home':
        handled();
        this.backToRoot();
        return;
      case 'Delete':
        handled();
        this.resetEntityExploration();
        return;
      case 'f':
      case 'F':
        handled();
        this.togglePinActive();
        return;
      case 'r':
      case 'R':
        handled();
        this.promoteActive();
        return;
      case '+':
      case 'ArrowRight': {
        const next = this.entityBranches.find((branch) => branch.canExpand);
        if (!next) return;
        handled();
        this.expandBranchById(next.id);
        return;
      }
      case '-':
      case 'ArrowLeft': {
        const last = [...this.entityBranches].reverse().find((branch) => branch.canCollapse);
        if (!last) return;
        handled();
        this.collapseBranchById(last.id);
        return;
      }
      default:
        return;
    }
  }

  // --- interno ---------------------------------------------------------------

  private explorationContext(): ExplorationContext | null {
    if (!this.lastVisibleResult) return null;
    return { visibleResult: this.lastVisibleResult, fullResult: this.lastOriginalResult };
  }

  private entitySummaryRequest(): EntitySummaryRequest | null {
    const context = this.explorationContext();
    if (!context || !this.isEntityMode) return null;
    return {
      context,
      state: this.explorationState,
      subgraph: this.entitySubgraph,
      lot: {
        currentLot: this.lastLotState.currentLot,
        lotCount: this.lastLotState.lotCount,
        totalRows: this.lastOriginalResult?.bindings.length,
        visibleRows: this.lastVisibleResult?.bindings.length,
        truncated: this.lastOriginalResult?.meta.truncated,
      },
    };
  }

  private async copyEntitySummary(scope: 'view' | 'structure'): Promise<void> {
    const request = this.entitySummaryRequest();
    if (!request) return;
    const result =
      scope === 'view'
        ? await this.summaryClipboard.copyCurrentView(request)
        : await this.summaryClipboard.copyFullStructure(request);
    this.explorationMessage = result.message;
    this.copyFallbackText = result.status === 'unsupported' ? result.text : '';
    this.cdr.markForCheck();
  }

  /**
   * Aplica el resultado de una operación pura. Un rechazo no redibuja nada y se
   * anuncia; los `no-op` (re-seleccionar el nodo activo, volver a la raíz
   * estando en ella) son ruido y quedan mudos.
   */
  private applyExploration(next: ExplorationState): void {
    const rejection = next.lastRejection;
    this.explorationState = next;
    this.explorationMessage = rejection && rejection.code !== 'no-op' ? rejection.message : '';
    if (!rejection) this.syncEntityMode();
    this.cdr.markForCheck();
  }

  /**
   * Entra al modo entidad. Antes de cambiar nada guarda la vista global: volver
   * tiene que devolver cámara, layout, nivel y acomodo manual intactos.
   */
  private enterEntity(rootUri: string, trigger: EntityModeTrigger): void {
    const context = this.explorationContext();
    if (!context) return;
    const next = enterEntityMode(this.explorationState, { rootUri, trigger });
    if (next.lastRejection) {
      this.explorationState = next;
      this.explorationMessage =
        next.lastRejection.code === 'no-op' ? '' : next.lastRejection.message;
      this.cdr.markForCheck();
      return;
    }

    if (!this.isEntityMode) {
      this.resultViewSnapshot = {
        layout: this.currentLayout,
        detailLevel: this.detailLevel,
        camera: this.cy ? { pan: { ...this.cy.pan() }, zoom: this.cy.zoom() } : undefined,
        manualPositions: new Map(this.manualPositions),
      };
    }

    this.explorationState = next;
    this.explorationMessage = '';
    // §9: el modo entidad usa Jerárquico, y con etiquetas visibles (en Resumen
    // los nodos no las muestran y el subgrafo sería ilegible).
    this.currentLayout = 'dagre';
    if (this.detailLevel === 'summary') this.detailLevel = 'exploration';
    this.manualPositions.clear();
    this.destroyGraph();
    this.syncEntityMode();
    this.cdr.markForCheck();
  }

  /** Recalcula el subgrafo del estado actual y lo vuelca en Cytoscape. */
  private syncEntityMode(): void {
    if (!isExplorationActive(this.explorationState)) return;
    const context = this.explorationContext();
    if (!context) return;
    const subgraph = explorationSubgraph(context, this.explorationState);
    if (!subgraph) return;
    if (subgraph.sourceScope === 'none') {
      this.leaveEntityMode(
        'La entidad ya no está en el resultado: se volvió al resultado completo.',
      );
      return;
    }

    this.entitySubgraph = subgraph;
    // El chip de cobertura describe el lote del resultado; en modo entidad los
    // indicadores viven en el panel.
    this.coverageLabel = '';
    this.refreshEntityViewModel();
    this.syncGraph(buildEntityModeElements(subgraph).elements);
  }

  /** Textos del panel. Se calculan una vez por subgrafo, no por ciclo de CD. */
  private refreshEntityViewModel(): void {
    const subgraph = this.entitySubgraph;
    if (!subgraph) {
      this.entityRootLabel = '';
      this.entityRootShortUri = '';
      this.entityActiveLabel = '';
      this.entityActiveShortUri = '';
      this.entityActivePinned = false;
      this.entityMetrics = '';
      this.entityWarnings = '';
      this.entityCrumbs = [];
      this.entityBranches = [];
      this.entityOtherBranches = [];
      return;
    }

    const fromSubgraph = entityLabelResolver(subgraph);
    // Las raíces anteriores del breadcrumb pueden haber salido del subgrafo
    // vigente: el índice de nodos las sigue conociendo.
    const labelOf = (uri: string): string => {
      const label = fromSubgraph(uri);
      if (label !== uri) return label;
      return this.nodeIndex.get(uri)?.label || uri;
    };

    this.entityRootLabel = labelOf(subgraph.rootUri);
    this.entityRootShortUri = shortenUri(subgraph.rootUri);
    this.entityActiveLabel = labelOf(subgraph.activeUri);
    this.entityActiveShortUri = shortenUri(subgraph.activeUri);
    this.entityActivePinned = this.explorationState.pinnedUris.includes(subgraph.activeUri);
    this.entityMetrics = entityMetricsLabel(subgraph);
    this.entityWarnings = entityWarningsLabel(subgraph);
    this.entityCrumbs = entityBreadcrumb(explorationBreadcrumb(this.explorationState), labelOf);
    this.entityBranches = activeBranchItems(subgraph);
    this.entityOtherBranches = otherBranchItems(subgraph);
  }

  /**
   * Abandona el modo entidad sin redibujar: sólo devuelve los campos de la
   * vista global a lo que eran. Lo usan tanto la salida explícita como los
   * casos en los que el resultado deja de tener la raíz.
   */
  private discardEntityMode(): void {
    const next = exitToResult(this.explorationState);
    if (!next.lastRejection) this.explorationState = next;
    this.entitySubgraph = null;
    this.copyFallbackText = '';
    this.refreshEntityViewModel();

    const snapshot = this.resultViewSnapshot;
    this.resultViewSnapshot = null;
    if (!snapshot) return;
    this.currentLayout = snapshot.layout;
    this.detailLevel = snapshot.detailLevel;
    this.restoreCamera = snapshot.camera;
    this.restoreManualPositions = snapshot.manualPositions;
  }

  /** Vuelve al resultado completo y lo redibuja con su estado previo. */
  private leaveEntityMode(message: string): void {
    this.discardEntityMode();
    this.explorationMessage = message;
    this.destroyGraph();

    const visible = this.lastVisibleResult;
    if (visible) {
      const built = this.buildElements(visible);
      this.coverageLabel = this.buildCoverageLabel(
        built,
        visible,
        this.lastLotState.lotCount,
        this.lastLotState.currentLot,
      );
      this.syncGraph(built.elements);
    }
    this.cdr.markForCheck();
  }

  private getLayoutOptions(layout: GraphLayout): cytoscape.LayoutOptions {
    return layoutOptionsFor(layout, this.detailLevel);
  }

  private getInitialLayoutOptions(layout: GraphLayout): cytoscape.LayoutOptions {
    if (layout === 'cola') {
      return {
        ...(this.getLayoutOptions(layout) as unknown as Record<string, unknown>),
        // webcola con `animate: false` resuelve su simulación sincrónicamente y
        // puede bloquear el hilo principal. Además, partir todos los nodos de
        // (0,0) reproduce el solapamiento observado en componentes pequeños.
        animate: true,
        randomize: true,
      } as unknown as cytoscape.LayoutOptions;
    }
    return {
      ...(this.getLayoutOptions(layout) as unknown as Record<string, unknown>),
      animate: false,
    } as unknown as cytoscape.LayoutOptions;
  }
}
