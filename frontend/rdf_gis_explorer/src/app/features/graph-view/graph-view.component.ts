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
  inject,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { SelectionService } from '@core/services/selection.service';
import { combineLatest, Subject, takeUntil } from 'rxjs';
import { debounceTime, filter } from 'rxjs/operators';
import cytoscape from 'cytoscape';
import cola from 'cytoscape-cola';
import dagre from 'cytoscape-dagre';
import type { QueryResult, NormalizedNode, NormalizedEdge, Selection } from '@shared/models';
import { DashboardViewStateService } from '@core/services/dashboard-view-state.service';
import { CoverageChipComponent } from '@shared/components/coverage-chip/coverage-chip.component';
import { createGraphStyle } from './graph-style';
import { LAYOUT_CONFIGS } from './graph-layouts';
import { EntityColorService } from '@core/services/entity-color.service';

cytoscape.use(cola);
cytoscape.use(dagre);

type GraphLayout = 'cola' | 'dagre' | 'circle' | 'grid';
type QueryState = 'no-query' | 'no-edges' | 'filtered-zero' | 'normal';

@Component({
  selector: 'app-graph-view',
  standalone: true,
  imports: [FormsModule, CoverageChipComponent],
  templateUrl: './graph-view.component.html',
  styleUrls: ['./graph-view.component.scss'],
})
export class GraphViewComponent implements OnInit, OnDestroy {
  @ViewChild('cyContainer', { static: true }) container!: ElementRef<HTMLDivElement>;

  cy?: cytoscape.Core;
  currentLayout: GraphLayout = 'cola';
  readonly layoutOptions = [
    { value: 'cola' as const, label: 'cola' },
    { value: 'dagre' as const, label: 'dagre' },
    { value: 'circle' as const, label: 'circle' },
    { value: 'grid' as const, label: 'grid' },
  ];

  queryState: QueryState = 'no-query';
  /** Texto del chip de cobertura; vacío cuando el grafo muestra todos los nodos. */
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
  private originalResult: QueryResult | null = null;
  private resizeObserver?: ResizeObserver;
  private suppressViewportEmit = false;
  private readonly viewportChange$ = new Subject<void>();

  readonly MAX_NODES = 300;
  private readonly COLLAPSE_DEGREE = 20;

  private readonly viewState = inject(DashboardViewStateService);
  private readonly colorService = inject(EntityColorService);

  constructor(
    private selectionService: SelectionService,
    private ngZone: NgZone,
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    this.initResizeObserver();

    combineLatest([
      this.selectionService.queryResult$,
      this.selectionService.visibleQueryResult$,
      this.selectionService.activeFilters$,
      this.selectionService.lotState$,
    ])
      .pipe(takeUntil(this.destroy$))
      .subscribe(([original, visible, filters, lotState]) => {
        this.originalResult = original;
        this.activeFilterCount = filters.length;
        this.coverageLabel = '';

        if (!visible || visible.nodes.length === 0) {
          if (!original || original.nodes.length === 0) {
            this.queryState = 'no-query';
          } else if (filters.length > 0) {
            this.queryState = 'filtered-zero';
            this.originalNodeCount = original.nodes.length;
          } else {
            this.queryState = 'no-query';
          }
          this.cy?.destroy();
          this.cy = undefined;
          this.cdr.markForCheck();
          return;
        }

        this.filteredNodeCount = visible.nodes.length;
        this.originalNodeCount = original?.nodes.length ?? visible.nodes.length;

        if (visible.edges.length === 0) {
          this.queryState = 'no-edges';
        } else {
          this.queryState = 'normal';
        }

        // Red de seguridad: los lotes paginan filas, no nodos, así que un lote
        // puede referenciar más de MAX_NODES entidades; en ese caso el grafo
        // corta al top por grado (ver buildElements) y el chip lo avisa.
        if (visible.nodes.length > this.MAX_NODES) {
          this.coverageLabel = `Mostrando ${this.MAX_NODES} de ${visible.nodes.length} nodos (top por conexiones)`;
        } else if (lotState.lotCount > 1) {
          this.coverageLabel = `Lote ${lotState.currentLot} de ${lotState.lotCount} · ${visible.bindings.length} filas`;
        }

        this.renderGraph(visible);
        this.cdr.markForCheck();
      });

    this.selectionService.selectedNode$
      .pipe(
        takeUntil(this.destroy$),
        filter((sel: Selection) => sel.source !== 'graph'),
      )
      .subscribe((sel: Selection) => {
        if (sel.node && this.cy) {
          this.panToNode(sel.node.uri);
          this.applyFocusContext(sel.node.uri);
        }
      });

    this.viewportChange$
      .pipe(takeUntil(this.destroy$), debounceTime(500))
      .subscribe(() => this.emitFocusFromViewport());

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
            f.uris.size > 0 &&
            this.selectionService.getActiveView() !== 'graph',
        ),
      )
      .subscribe((f) => this.applyExternalFocus(f.uris));
  }

  private emitFocusFromViewport(): void {
    if (!this.cy) return;
    const extent = this.cy.extent();
    const uris: string[] = [];
    this.cy.nodes().forEach((n) => {
      const pos = n.position();
      if (
        pos.x >= extent.x1 &&
        pos.x <= extent.x2 &&
        pos.y >= extent.y1 &&
        pos.y <= extent.y2 &&
        n.style('display') !== 'none'
      ) {
        uris.push(n.id());
      }
    });
    if (uris.length === 0) return;
    this.selectionService.markActiveView('graph');
    this.selectionService.setFocus(uris, 'graph');
  }

  private applyExternalFocus(uris: ReadonlySet<string>): void {
    if (!this.cy) return;
    const matched = this.cy.nodes().filter((n) => uris.has(n.id()));
    if (matched.empty()) {
      this.cy.elements().style('opacity', 1.0);
      return;
    }
    this.cy.elements().style('opacity', 0.2);
    matched.style('opacity', 1.0);
    matched.connectedEdges().style('opacity', 0.6);
    
    const extent = this.cy.extent();
    let allVisible = true;
    matched.forEach((node) => {
      const pos = node.position();
      const isVisible =
        pos.x >= extent.x1 &&
        pos.x <= extent.x2 &&
        pos.y >= extent.y1 &&
        pos.y <= extent.y2;
      if (!isVisible) {
        allVisible = false;
      }
    });
    
    if (allVisible) {
      return;
    }
    
    this.suppressViewportEmit = true;
    this.cy.animate({
      fit: { eles: matched, padding: 60 },
      duration: 600,
    });
    setTimeout(() => {
      this.suppressViewportEmit = false;
    }, 800);
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    this.resizeObserver?.disconnect();
    this.cy?.destroy();
  }

  @HostListener('window:resize')
  onWindowResize(): void {
    this.cy?.resize();
  }

  setLayout(layout: GraphLayout): void {
    this.currentLayout = layout;
    this.viewState.graphState.set({ layout });
    const config = LAYOUT_CONFIGS[layout];
    if (this.cy && config) {
      this.cy.layout(config.options).run();
      setTimeout(() => {
        this.cy?.fit(undefined, 50);
      }, config.animationDuration + 50);
    }
  }

  fit(): void {
    this.cy?.fit(undefined, 50);
  }

  resetZoom(): void {
    if (!this.cy) return;
    this.cy.zoom(1);
    this.cy.center();
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

  private renderGraph(result: QueryResult): void {
    if (this.cy) {
      this.cy.destroy();
    }

    const elements = this.buildElements(result);
    const storedLayout = this.viewState.graphState();
    const defaultLayout = result.edges.length === 0 ? 'grid' : 'cola';
    this.currentLayout = storedLayout ? (storedLayout.layout as GraphLayout) : defaultLayout;

    this.cy = cytoscape({
      container: this.container.nativeElement,
      elements,
      style: createGraphStyle(
        this.colorService,
        () => false,
      ),
      layout: this.getLayoutOptions(defaultLayout),
      // No pasar wheelSensitivity: el default ya es 1 y Cytoscape >= 3.31
      // normaliza el scroll por deltaMode (fix para Firefox/Linux integrado).
      // Definir la opción, incluso en 1.0, solo dispara el warning de consola.
      minZoom: 0.05,
      maxZoom: 5,
    });

    this.cy.on('layoutstop', () => {
      this.arrangeIsolatedNodes();
      this.cy?.fit(undefined, 50);
    });

    this.bindGraphEvents();

    if (result.edges.length > 0) {
      this.cy.ready(() => {
        setTimeout(() => {
          this.collapseHighDegreeNodes();
        }, 0);
      });
    }

    const layoutDuration = LAYOUT_CONFIGS[this.currentLayout]?.animationDuration ?? 500;
    setTimeout(() => {
      this.arrangeIsolatedNodes();
      this.cy?.fit(undefined, 50);
    }, layoutDuration + 100);
  }

  private arrangeIsolatedNodes(): void {
    if (!this.cy) return;
    const components = this.cy.elements().components();
    if (components.length <= 1) return;

    const sorted = [...components].sort((a, b) => b.nodes().length - a.nodes().length);

    const boxes = sorted.map((c) => ({ comp: c, bb: c.boundingBox({}) }));
    const maxW = Math.max(...boxes.map((b) => b.bb.w));
    const maxH = Math.max(...boxes.map((b) => b.bb.h));
    const paddingX = Math.max(80, maxW * 0.2);
    const paddingY = Math.max(80, maxH * 0.2);
    const cellW = maxW + paddingX;
    const cellH = maxH + paddingY;

    const cols = Math.max(1, Math.ceil(Math.sqrt(boxes.length)));

    boxes.forEach((b, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const targetCx = col * cellW + cellW / 2;
      const targetCy = row * cellH + cellH / 2;
      const currentCx = (b.bb.x1 + b.bb.x2) / 2;
      const currentCy = (b.bb.y1 + b.bb.y2) / 2;
      const dx = targetCx - currentCx;
      const dy = targetCy - currentCy;
      b.comp.nodes().forEach((n) => {
        const p = n.position();
        n.position({ x: p.x + dx, y: p.y + dy });
      });
    });
  }

  private buildElements(result: QueryResult): cytoscape.ElementDefinition[] {
    const elements: cytoscape.ElementDefinition[] = [];

    const degreeMap = new Map<string, number>();
    for (const edge of result.edges) {
      degreeMap.set(edge.source, (degreeMap.get(edge.source) ?? 0) + 1);
      degreeMap.set(edge.target, (degreeMap.get(edge.target) ?? 0) + 1);
    }

    let visibleNodes = result.nodes;
    if (result.nodes.length > this.MAX_NODES) {
      visibleNodes = [...result.nodes]
        .sort((a, b) => (degreeMap.get(b.uri) ?? 0) - (degreeMap.get(a.uri) ?? 0))
        .slice(0, this.MAX_NODES);
    }

    const visibleUris = new Set(visibleNodes.map((n) => n.uri));

    for (const node of visibleNodes) {
      elements.push({
        data: {
          id: node.uri,
          label: node.label,
          type: node.type ?? '',
          degree: degreeMap.get(node.uri) ?? 0,
        },
      });
    }

    for (const edge of result.edges) {
      if (visibleUris.has(edge.source) && visibleUris.has(edge.target)) {
        elements.push({
          data: {
            id: edge.id,
            source: edge.source,
            target: edge.target,
            predicate: edge.predicate,
            predicateLabel: edge.predicateLabel ?? '',
          },
        });
      }
    }

    return elements;
  }

  private bindGraphEvents(): void {
    if (!this.cy) return;

    this.cy.on('tap', 'node', (evt) => {
      const node = evt.target;
      const collapsed = node.data('collapsed') as boolean;

      if (collapsed) {
        this.expandNode(node.id());
        return;
      }

      const nodeUri = node.id();
      const nodeData = this.originalResult?.nodes.find((n) => n.uri === nodeUri);
      if (nodeData) {
        this.ngZone.run(() => {
          this.selectionService.select(nodeData, 'graph');
        });
      }
      this.applyFocusContext(nodeUri);
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

    this.cy.on('mouseover', 'edge', (evt) => {
      const edge = evt.target;
      this.tooltipText =
        (edge.data('predicateLabel') as string) || (edge.data('predicate') as string) || '';
      this.tooltipVisible = !!this.tooltipText;
    });

    this.cy.on('mousemove', 'edge', (evt) => {
      if (!this.tooltipVisible) return;
      const originalEvent = evt.originalEvent as MouseEvent | undefined;
      if (originalEvent) {
        this.tooltipX = originalEvent.clientX + 12;
        this.tooltipY = originalEvent.clientY + 12;
      }
    });

    this.cy.on('mouseout', 'edge', () => {
      this.tooltipVisible = false;
    });

    this.cy.on('viewport', () => {
      if (this.suppressViewportEmit) return;
      // No ngZone.run ni markActiveView aquí: el listener wheel/pointerdown del
      // container ya marca activo. Mantener este handler liviano para no
      // disparar change detection en cada tick de scroll.
      this.ngZone.runOutsideAngular(() => this.viewportChange$.next());
    });

    const container = this.container.nativeElement;
    const markActive = () => this.selectionService.markActiveView('graph');
    container.addEventListener('pointerdown', markActive);
    container.addEventListener('wheel', markActive, { passive: true });
  }

  private applyFocusContext(focusUri: string | null): void {
    if (!this.cy) return;
    if (!focusUri) {
      this.cy.elements().style('opacity', 1.0);
      return;
    }
    const focus = this.cy.getElementById(focusUri);
    if (focus.empty()) return;
    const neighbors = focus.closedNeighborhood();
    this.cy.elements().difference(neighbors).style('opacity', 0.2);
    neighbors.style('opacity', 1.0);
  }

  private panToNode(uri: string): void {
    if (!this.cy) return;
    const node = this.cy.getElementById(uri);
    if (node.empty()) return;

    this.revealNode(node);

    const pos = node.position();
    const extent = this.cy.extent();
    const isVisible =
      pos.x >= extent.x1 &&
      pos.x <= extent.x2 &&
      pos.y >= extent.y1 &&
      pos.y <= extent.y2;

    if (!isVisible) {
      this.suppressViewportEmit = true;
      this.cy.animate({
        center: { eles: node },
        duration: 600,
      });
      setTimeout(() => {
        this.suppressViewportEmit = false;
      }, 800);
    }
  }

  /**
   * Equivalente en el grafo al problema de paginación de la tabla: el nodo existe pero
   * no está renderizado, así que centrar la vista en él no muestra nada.
   *
   * `collapseHighDegreeNodes` esconde con `display: none` a los vecinos de todo nodo
   * con grado > COLLAPSE_DEGREE. Si la selección llega desde el mapa, la tabla o la
   * timeline apuntando a uno de esos vecinos, había que expandir el hub a mano para
   * verlo. Acá se expande solo.
   */
  private revealNode(node: cytoscape.NodeSingular): void {
    if (node.style('display') !== 'none') return;

    const collapsedHubs = node
      .connectedEdges()
      .connectedNodes()
      .filter((n) => n.id() !== node.id() && n.data('collapsed') === true);

    collapsedHubs.forEach((hub) => this.expandNode(hub.id()));
  }

  private collapseHighDegreeNodes(): void {
    this.cy?.nodes().forEach((node) => {
      const deg = node.degree(false);
      if (deg > this.COLLAPSE_DEGREE) {
        node.data('collapsed', true);
        node.data('originalLabel', node.data('label'));
        node.data('label', `${node.data('label') as string} [+${deg} ocultos]`);
        node.connectedEdges().style('display', 'none');
        node
          .connectedEdges()
          .connectedNodes()
          .filter((n) => n.id() !== node.id())
          .style('display', 'none');
      }
    });
  }

  private expandNode(nodeId: string): void {
    const node = this.cy?.getElementById(nodeId);
    if (!node || !node.data('collapsed')) return;

    node.data('collapsed', false);
    const originalLabel = node.data('originalLabel') as string;
    if (originalLabel) {
      node.data('label', originalLabel);
    }
    node.connectedEdges().style('display', 'element');
    node.connectedEdges().connectedNodes().style('display', 'element');
  }

  private getLayoutOptions(layout: GraphLayout): cytoscape.LayoutOptions {
    return LAYOUT_CONFIGS[layout]?.options ?? LAYOUT_CONFIGS['cola'].options;
  }
}
