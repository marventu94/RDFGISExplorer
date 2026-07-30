import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { BehaviorSubject, of } from 'rxjs';
import { GraphViewComponent } from './graph-view.component';
import { SelectionService, type LotState } from '@core/services/selection.service';
import { EntityColorService } from '@core/services/entity-color.service';
import { AppConfigService } from '@core/services/app-config.service';
import { DashboardViewStateService } from '@core/services/dashboard-view-state.service';
import { DEFAULT_LIMITS, LimitsService } from '@core/services/limits.service';
import type { QueryResult, NormalizedNode, NormalizedEdge, Selection, Filter } from '@shared/models';

const mockNode: NormalizedNode = {
  uri: 'http://www.wikidata.org/entity/Q7742',
  label: 'Juan Domingo Perón',
  type: 'http://www.wikidata.org/entity/Q5',
  attributes: {},
};

const mockNode2: NormalizedNode = {
  uri: 'http://www.wikidata.org/entity/Q41404',
  label: 'Argentina',
  type: 'http://www.wikidata.org/entity/Q515',
  attributes: {},
};

const mockEdge: NormalizedEdge = {
  id: 'edge-1',
  source: 'http://www.wikidata.org/entity/Q7742',
  target: 'http://www.wikidata.org/entity/Q41404',
  predicate: 'http://www.wikidata.org/prop/P39',
  predicateLabel: 'position held',
};

function createMockQueryResult(
  nodes: NormalizedNode[],
  edges: NormalizedEdge[],
): QueryResult {
  return {
    variables: ['person', 'personLabel'],
    bindings: [],
    nodes,
    edges,
    meta: {
      durationMs: 100,
      truncated: false,
      limitApplied: 500,
      backend: 'wikidata',
    },
  };
}

// vi.hoisted: la factory de vi.mock se hoistea y no ve el scope del módulo;
// esto hace que los helpers existan tanto para la factory como para los tests.
// El mock guarda estado real (elementos, clases, posiciones, handlers) porque los
// tests que importan —cuántas veces se instancia, qué se agrega/quita, qué pasa al
// clickear— no se pueden escribir contra un vi.fn() vacío.
const { createMockCy, cyRegistry } = vi.hoisted(() => {
  interface El {
    id: string;
    data: Record<string, unknown>;
    isNode: boolean;
    classes: Set<string>;
    position: { x: number; y: number };
    locked: boolean;
  }

  function createMockCy(options: Record<string, unknown> = {}) {
    const els: El[] = [];
    const handlers: { event: string; selector: string | null; handler: (evt: unknown) => void }[] =
      [];
    const layoutRuns: Record<string, unknown>[] = [];
    const layoutStops: Record<string, unknown>[] = [];
    let panPos = { x: 0, y: 0 };
    let zoomLevel = 1;

    function addDefs(defs: unknown): void {
      const list = Array.isArray(defs) ? defs : [defs];
      for (const def of list) {
        const data = ((def as { data?: Record<string, unknown> }).data ?? {}) as Record<
          string,
          unknown
        >;
        els.push({
          id: String(data['id']),
          data: { ...data },
          isNode: !('source' in data),
          classes: new Set<string>(),
          position: { x: 0, y: 0 },
          locked: false,
        });
      }
    }

    function coll(items: El[]): Record<string, unknown> {
      const c: Record<string, unknown> = {
        _items: items,
        length: items.length,
        empty: () => items.length === 0,
        nonempty: () => items.length > 0,
        forEach: (cb: (e: unknown) => void) => items.forEach((it) => cb(coll([it]))),
        map: (cb: (e: unknown) => unknown) => items.map((it) => cb(coll([it]))),
        filter: (pred: (e: unknown) => boolean) => coll(items.filter((it) => pred(coll([it])))),
        first: () => coll(items.slice(0, 1)),
        nodes: (sel?: string) => (sel === undefined ? coll(items.filter((i) => i.isNode)) : coll(items.filter((i) => i.isNode))),
        edges: () => coll(items.filter((i) => !i.isNode)),
        id: () => items[0]?.id,
        isNode: () => !!items[0]?.isNode,
        data: (d?: Record<string, unknown> | string) => {
          if (d === undefined) return items[0]?.data;
          if (typeof d === 'string') return items[0]?.data[d];
          items.forEach((it) => Object.assign(it.data, d));
          return c;
        },
        remove: () => {
          for (const it of items) {
            const i = els.indexOf(it);
            if (i >= 0) els.splice(i, 1);
          }
          return c;
        },
        difference: (other: { _items?: El[] }) =>
          coll(items.filter((it) => !(other._items ?? []).includes(it))),
        addClass: (cls: string) => {
          items.forEach((it) => cls.split(/\s+/).forEach((x) => it.classes.add(x)));
          return c;
        },
        removeClass: (cls: string) => {
          items.forEach((it) => cls.split(/\s+/).forEach((x) => it.classes.delete(x)));
          return c;
        },
        hasClass: (cls: string) => !!items[0]?.classes.has(cls),
        emit: (event: string) => {
          handlers
            .filter((h) => h.event === event && h.selector === 'node')
            .forEach((h) => h.handler({ target: c }));
          return c;
        },
        style: vi.fn(() => c),
        position: (p?: { x: number; y: number }) => {
          if (p) {
            items.forEach((it) => (it.position = { ...p }));
            return c;
          }
          return items[0]?.position ?? { x: 0, y: 0 };
        },
        boundingBox: () => {
          const p = items[0]?.position ?? { x: 0, y: 0 };
          return { x1: p.x - 5, x2: p.x + 5, y1: p.y - 5, y2: p.y + 5, w: 10, h: 10 };
        },
        lock: () => {
          items.forEach((it) => (it.locked = true));
          return c;
        },
        unlock: () => {
          items.forEach((it) => (it.locked = false));
          return c;
        },
        locked: () => !!items[0]?.locked,
        degree: () =>
          els.filter(
            (e) =>
              !e.isNode && items.some((n) => n.id === e.data['source'] || n.id === e.data['target']),
          ).length,
        connectedEdges: () =>
          coll(
            els.filter(
              (e) =>
                !e.isNode &&
                items.some((n) => n.id === e.data['source'] || n.id === e.data['target']),
            ),
          ),
      };
      const neighborNodes = () => {
        const ids = new Set<string>();
        for (const e of els) {
          if (e.isNode) continue;
          for (const n of items) {
            if (e.data['source'] === n.id) ids.add(String(e.data['target']));
            if (e.data['target'] === n.id) ids.add(String(e.data['source']));
          }
        }
        return els.filter((x) => x.isNode && ids.has(x.id));
      };
      c['connectedNodes'] = () => coll(neighborNodes());
      c['neighborhood'] = () => coll(neighborNodes());
      c['closedNeighborhood'] = () => coll([...new Set([...items, ...neighborNodes()])]);
      return c;
    }

    addDefs(options['elements'] ?? []);

    const cy = {
      _options: options,
      _els: els,
      _handlers: handlers,
      _layoutRuns: layoutRuns,
      _layoutStops: layoutStops,
      _classesOf: (id: string) => Array.from(els.find((e) => e.id === id)?.classes ?? []),
      _ids: () => els.map((e) => e.id),
      _emit: (event: string, selector: string | null, evt: unknown) => {
        handlers
          .filter((h) => h.event === event && h.selector === selector)
          .forEach((h) => h.handler(evt));
      },
      destroy: vi.fn(),
      resize: vi.fn(),
      fit: vi.fn(),
      center: vi.fn(),
      animate: vi.fn(),
      style: vi.fn(),
      batch: (fn: () => void) => fn(),
      add: (defs: unknown) => addDefs(defs),
      elements: () => coll([...els]),
      nodes: () => coll(els.filter((e) => e.isNode)),
      edges: () => coll(els.filter((e) => !e.isNode)),
      getElementById: (id: string) => coll(els.filter((e) => e.id === id)),
      collection: () => coll([]),
      extent: () => ({ x1: -1e4, x2: 1e4, y1: -1e4, y2: 1e4, w: 2e4, h: 2e4 }),
      pan: (p?: { x: number; y: number }) => {
        if (p) {
          panPos = { ...p };
          return;
        }
        return panPos;
      },
      zoom: vi.fn((z?: number) => {
        if (typeof z === 'number') {
          zoomLevel = z;
          return;
        }
        return zoomLevel;
      }),
      layout: vi.fn((opts: Record<string, unknown>) => {
        layoutRuns.push(opts);
        const stopHandlers: (() => void)[] = [];
        const handle = {
          run: vi.fn(() => {
            // Una simulación infinita no termina sola: solo la para stop().
            if (!opts['infinite']) stopHandlers.forEach((h) => h());
            return handle;
          }),
          stop: vi.fn(() => {
            layoutStops.push(opts);
            return handle;
          }),
          one: vi.fn((_e: string, h: () => void) => {
            stopHandlers.push(h);
            return handle;
          }),
          on: vi.fn(() => handle),
        };
        return handle;
      }),
      on: vi.fn((event: string, selectorOrHandler: unknown, maybeHandler?: unknown) => {
        const isFn = typeof selectorOrHandler === 'function';
        handlers.push({
          event,
          selector: isFn ? null : (selectorOrHandler as string),
          handler: (isFn ? selectorOrHandler : maybeHandler) as (evt: unknown) => void,
        });
      }),
      ready: vi.fn((cb: () => void) => cb()),
    };
    return cy;
  }

  const cyRegistry: { instances: ReturnType<typeof createMockCy>[] } = { instances: [] };
  return { createMockCy, cyRegistry };
});

vi.mock('cytoscape', () => {
  const mockCyBuilder = vi.fn((options: Record<string, unknown>) => {
    const instance = createMockCy(options);
    cyRegistry.instances.push(instance);
    return instance;
  });
  return {
    default: Object.assign(mockCyBuilder, {
      use: vi.fn(),
    }),
  };
});

/** Última instancia de cytoscape creada por el componente. */
function lastCy() {
  return cyRegistry.instances[cyRegistry.instances.length - 1];
}

vi.mock('cytoscape-cola', () => ({
  default: vi.fn(),
}));

vi.mock('cytoscape-dagre', () => ({
  default: vi.fn(),
}));

describe('GraphViewComponent', () => {
  let fixture: ComponentFixture<GraphViewComponent>;
  let component: GraphViewComponent;
  let queryResultSubject: BehaviorSubject<QueryResult | null>;
  let visibleQueryResultSubject: BehaviorSubject<QueryResult | null>;
  let activeFiltersSubject: BehaviorSubject<Filter[]>;
  let selectedNodeSubject: BehaviorSubject<Selection>;
  let lotStateSubject: BehaviorSubject<LotState>;

  beforeEach(async () => {
    cyRegistry.instances = [];
    queryResultSubject = new BehaviorSubject<QueryResult | null>(null);
    visibleQueryResultSubject = new BehaviorSubject<QueryResult | null>(null);
    activeFiltersSubject = new BehaviorSubject<Filter[]>([]);
    selectedNodeSubject = new BehaviorSubject<Selection>({
      node: null,
      source: 'external',
    });
    lotStateSubject = new BehaviorSubject<LotState>({
      lotSize: 300,
      currentLot: 1,
      lotCount: 1,
      totalRows: 0,
      visibleNodes: 0,
    });

    const focusSubject = new BehaviorSubject<{ uris: Set<string>; source: string | null }>({
      uris: new Set(),
      source: null,
    });
    const activeViewSubject = new BehaviorSubject<string | null>(null);

    const mockSelectionService = {
      queryResult$: queryResultSubject.asObservable(),
      visibleQueryResult$: visibleQueryResultSubject.asObservable(),
      activeFilters$: activeFiltersSubject.asObservable(),
      selectedNode$: selectedNodeSubject.asObservable(),
      lotState$: lotStateSubject.asObservable(),
      focus$: focusSubject.asObservable(),
      activeView$: activeViewSubject.asObservable(),
      coordinatedViewEnabled$: of(true),
      select: vi.fn(),
      clearSelection: vi.fn(),
      markActiveView: vi.fn(),
      getActiveView: vi.fn(() => null),
    };

    await TestBed.configureTestingModule({
      imports: [GraphViewComponent, NoopAnimationsModule],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: SelectionService, useValue: mockSelectionService },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(GraphViewComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create the component', () => {
    expect(component).toBeTruthy();
  });

  it('takes MAX_NODES from LimitsService when config-driven limits arrive', () => {
    expect(component.MAX_NODES).toBe(300);
    const limits = TestBed.inject(LimitsService);
    limits.apply({ ...DEFAULT_LIMITS, graphMaxNodes: 42 });
    fixture.detectChanges();
    expect(component.MAX_NODES).toBe(42);
  });

  it('should show empty state when no query result', () => {
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('.empty-state__text')?.textContent).toContain('Ejecutá una query');
  });

  it('should switch to cola layout', () => {
    component.currentLayout = 'circle';
    component.setLayout('cola');
    expect(component.currentLayout).toBe('cola');
  });

  it('should clean up cytoscape on destroy', () => {
    const mockCy = createMockCy();
    (component as unknown as Record<string, unknown>)['cy'] = mockCy;
    component.ngOnDestroy();
    expect(mockCy.destroy).toHaveBeenCalled();
  });

  it('should call reset zoom', () => {
    const mockCy = createMockCy();
    (component as unknown as Record<string, unknown>)['cy'] = mockCy;
    component.resetZoom();
    expect(mockCy.zoom).toHaveBeenCalledWith(1);
    expect(mockCy.center).toHaveBeenCalled();
  });

  it('should call fit', () => {
    const mockCy = createMockCy();
    (component as unknown as Record<string, unknown>)['cy'] = mockCy;
    component.fit();
    expect(mockCy.fit).toHaveBeenCalledWith(undefined, 50);
  });

  it('should not throw when cy is undefined on destroy', () => {
    component.ngOnDestroy();
  });

  it('should have four layout options', () => {
    expect(component.layoutOptions.length).toBe(4);
    const values = component.layoutOptions.map((o) => o.value);
    expect(values).toEqual(['cola', 'dagre', 'circle', 'grid']);
  });

  it('should have cola as default layout', () => {
    expect(component.currentLayout).toBe('cola');
  });

  it('should detect no-edges state when nodes exist but no edges', () => {
    const result = createMockQueryResult([mockNode, mockNode2], []);
    queryResultSubject.next(result);
    visibleQueryResultSubject.next(result);
    fixture.detectChanges();
    fixture.detectChanges();

    expect(component.queryState).toBe('no-edges');
  });

  it('should detect filtered-zero state', () => {
    const resultWithNodes = createMockQueryResult([mockNode, mockNode2], [mockEdge]);
    queryResultSubject.next(resultWithNodes);
    visibleQueryResultSubject.next(createMockQueryResult([], []));
    activeFiltersSubject.next([
      { id: 'f1', kind: 'geo', polygon: {} as GeoJSON.Polygon, label: 'Test area' },
    ]);
    fixture.detectChanges();
    fixture.detectChanges();

    expect(component.queryState).toBe('filtered-zero');
  });

  it('should show coverage chip when nodes exceed MAX_NODES', () => {
    const manyNodes: NormalizedNode[] = Array.from({ length: 301 }, (_, i) => ({
      uri: `http://www.wikidata.org/entity/Q${i + 1}`,
      label: `Nodo ${i + 1}`,
      attributes: {},
    }));
    const result = createMockQueryResult(manyNodes, [mockEdge]);
    queryResultSubject.next(result);
    visibleQueryResultSubject.next(result);
    fixture.detectChanges();
    fixture.detectChanges();

    expect(component.coverageLabel).toBe('300 de 301 nodos (los más conectados)');
    const chip = (fixture.nativeElement as HTMLElement).querySelector('.coverage-chip');
    expect(chip?.textContent?.trim()).toBe('300 de 301 nodos (los más conectados)');
  });

  it('should hide the coverage chip when all nodes fit in the graph', () => {
    const result = createMockQueryResult([mockNode, mockNode2], [mockEdge]);
    queryResultSubject.next(result);
    visibleQueryResultSubject.next(result);
    fixture.detectChanges();
    fixture.detectChanges();

    expect(component.coverageLabel).toBe('');
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('.coverage-chip')).toBeNull();
  });

  it('should show lot context in the coverage chip when there are several lots', () => {
    const result = createMockQueryResult([mockNode, mockNode2], [mockEdge]);
    result.bindings = [
      { person: { type: 'uri', value: mockNode.uri } },
      { person: { type: 'uri', value: mockNode2.uri } },
    ];
    queryResultSubject.next(result);
    visibleQueryResultSubject.next(result);
    lotStateSubject.next({
      lotSize: 300,
      currentLot: 2,
      lotCount: 7,
      totalRows: 1903,
      visibleNodes: 2,
    });
    fixture.detectChanges();
    fixture.detectChanges();

    expect(component.coverageLabel).toBe('Lote 2 de 7 · 2 filas');
    const chip = (fixture.nativeElement as HTMLElement).querySelector('.coverage-chip');
    expect(chip?.textContent?.trim()).toBe('Lote 2 de 7 · 2 filas');
  });

  it('should transition back to no-query when result becomes null', () => {
    const result = createMockQueryResult([mockNode], [mockEdge]);
    queryResultSubject.next(result);
    visibleQueryResultSubject.next(result);
    fixture.detectChanges();
    fixture.detectChanges();
    expect(component.queryState).toBe('normal');

    queryResultSubject.next(null);
    visibleQueryResultSubject.next(null);
    fixture.detectChanges();
    fixture.detectChanges();
    expect(component.queryState).toBe('no-query');
  });

  /** Helper: publica un resultado y deja el grafo instanciado. */
  function emitResult(nodes: NormalizedNode[], edges: NormalizedEdge[]): QueryResult {
    const result = createMockQueryResult(nodes, edges);
    queryResultSubject.next(result);
    visibleQueryResultSubject.next(result);
    fixture.detectChanges();
    return result;
  }

  describe('actualización incremental', () => {
    // Este es el guard de la regresión central: visibleQueryResult$ y lotState$
    // dependen de _selectedNode$, así que cada click re-emite. Antes eso destruía
    // la instancia y re-corría el layout, y los nodos se reacomodaban.
    it('instancia cytoscape una sola vez aunque la selección re-emita', () => {
      emitResult([mockNode, mockNode2], [mockEdge]);
      expect(cyRegistry.instances.length).toBe(1);

      selectedNodeSubject.next({ node: mockNode, source: 'graph' });
      lotStateSubject.next({
        lotSize: 300,
        currentLot: 1,
        lotCount: 1,
        totalRows: 2,
        visibleNodes: 2,
      });
      visibleQueryResultSubject.next(createMockQueryResult([mockNode, mockNode2], [mockEdge]));
      fixture.detectChanges();

      expect(cyRegistry.instances.length).toBe(1);
    });

    it('no re-corre el layout cuando la topología no cambió', () => {
      emitResult([mockNode, mockNode2], [mockEdge]);
      const cy = lastCy();
      const runsAfterCreate = cy._layoutRuns.length;

      // Mismo conjunto de elementos, otra emisión.
      visibleQueryResultSubject.next(createMockQueryResult([mockNode, mockNode2], [mockEdge]));
      fixture.detectChanges();

      expect(cy._layoutRuns.length).toBe(runsAfterCreate);
    });

    it('no toca la cámara al re-emitir con la misma topología', () => {
      emitResult([mockNode, mockNode2], [mockEdge]);
      const cy = lastCy();
      cy.fit.mockClear();
      cy.animate.mockClear();

      visibleQueryResultSubject.next(createMockQueryResult([mockNode, mockNode2], [mockEdge]));
      fixture.detectChanges();

      expect(cy.fit).not.toHaveBeenCalled();
      expect(cy.animate).not.toHaveBeenCalled();
    });

    it('agrega solo el nodo nuevo y deja bloqueados los que ya estaban', () => {
      emitResult([mockNode, mockNode2], [mockEdge]);
      const cy = lastCy();
      expect(cy._ids()).toEqual([mockNode.uri, mockNode2.uri, mockEdge.id]);

      const extra: NormalizedNode = {
        uri: 'http://www.wikidata.org/entity/Q999',
        label: 'Nodo pinneado',
        attributes: {},
      };
      visibleQueryResultSubject.next(
        createMockQueryResult([mockNode, mockNode2, extra], [mockEdge]),
      );
      fixture.detectChanges();

      expect(cyRegistry.instances.length).toBe(1);
      expect(cy._ids()).toContain(extra.uri);
      // El layout incremental corre sin centerGraph para no mover los bloqueados.
      const lastRun = cy._layoutRuns[cy._layoutRuns.length - 1];
      expect(lastRun['centerGraph']).toBe(false);
      // Y los desbloquea al terminar.
      const kept = cy.getElementById(mockNode.uri) as { locked: () => boolean };
      expect(kept.locked()).toBe(false);
    });

    it('quita del grafo los nodos que salieron del resultado', () => {
      emitResult([mockNode, mockNode2], [mockEdge]);
      const cy = lastCy();

      visibleQueryResultSubject.next(createMockQueryResult([mockNode], []));
      fixture.detectChanges();

      expect(cy._ids()).toEqual([mockNode.uri]);
    });
  });

  describe('click', () => {
    it('selecciona el nodo y atenúa lo que no es su vecindario', () => {
      emitResult([mockNode, mockNode2], [mockEdge]);
      const cy = lastCy();
      const selectionService = TestBed.inject(SelectionService);

      cy._emit('tap', 'node', { target: cy.getElementById(mockNode.uri) });

      expect(selectionService.select).toHaveBeenCalledWith(mockNode, 'graph');
      expect(cy._classesOf(mockNode.uri)).toContain('is-selected');
      // mockNode2 es vecino por mockEdge, así que no se atenúa.
      expect(cy._classesOf(mockNode2.uri)).not.toContain('is-dimmed');
    });

    it('atenúa un nodo que no es vecino del seleccionado', () => {
      const lonely: NormalizedNode = {
        uri: 'http://www.wikidata.org/entity/Q888',
        label: 'Aislado',
        attributes: {},
      };
      emitResult([mockNode, mockNode2, lonely], [mockEdge]);
      const cy = lastCy();

      cy._emit('tap', 'node', { target: cy.getElementById(mockNode.uri) });

      expect(cy._classesOf(lonely.uri)).toContain('is-dimmed');
    });

    it('no mueve la cámara al clickear un nodo', () => {
      emitResult([mockNode, mockNode2], [mockEdge]);
      const cy = lastCy();
      cy.fit.mockClear();
      cy.animate.mockClear();

      cy._emit('tap', 'node', { target: cy.getElementById(mockNode.uri) });

      expect(cy.fit).not.toHaveBeenCalled();
      expect(cy.animate).not.toHaveBeenCalled();
    });

    it('el click en el fondo limpia la selección y el atenuado', () => {
      emitResult([mockNode, mockNode2], [mockEdge]);
      const cy = lastCy();
      const selectionService = TestBed.inject(SelectionService);

      cy._emit('tap', 'node', { target: cy.getElementById(mockNode.uri) });
      cy._emit('tap', null, { target: cy, originalEvent: { target: { tagName: 'CANVAS' } } });

      expect(selectionService.clearSelection).toHaveBeenCalled();
      expect(cy._classesOf(mockNode.uri)).toEqual([]);
      expect(cy._classesOf(mockNode2.uri)).toEqual([]);
    });

    it('resuelve nodos que solo están en el resultado visible', () => {
      // Los intermedios que agrega query-topology pueden no estar en original.nodes;
      // antes el tap sobre ellos no seleccionaba nada.
      const intermediate: NormalizedNode = {
        uri: '_:b0',
        label: 'bnode',
        attributes: {},
      };
      queryResultSubject.next(createMockQueryResult([mockNode], []));
      visibleQueryResultSubject.next(createMockQueryResult([mockNode, intermediate], []));
      fixture.detectChanges();

      const cy = lastCy();
      const selectionService = TestBed.inject(SelectionService);
      cy._emit('tap', 'node', { target: cy.getElementById('_:b0') });

      expect(selectionService.select).toHaveBeenCalledWith(intermediate, 'graph');
    });
  });

  describe('buildElements', () => {
    function build(result: QueryResult) {
      return (
        component as unknown as {
          buildElements: (r: QueryResult) => {
            elements: { data: Record<string, unknown> }[];
            drawnNodes: number;
            totalNodes: number;
            edgesHiddenByTruncation: number;
          };
        }
      ).buildElements(result);
    }

    it('deja los MAX_NODES de mayor grado', () => {
      // Q1 sin aristas; Q2..Q4 conectados entre sí.
      const nodes: NormalizedNode[] = ['Q1', 'Q2', 'Q3', 'Q4'].map((id) => ({
        uri: id,
        label: id,
        attributes: {},
      }));
      const edges: NormalizedEdge[] = [
        { id: 'e1', source: 'Q2', target: 'Q3', predicate: 'p' },
        { id: 'e2', source: 'Q3', target: 'Q4', predicate: 'p' },
      ];
      (component as unknown as { MAX_NODES: number }).MAX_NODES = 2;

      const built = build(createMockQueryResult(nodes, edges));
      const ids = built.elements.map((e) => e.data['id']);

      expect(built.drawnNodes).toBe(2);
      expect(built.totalNodes).toBe(4);
      // Q3 tiene grado 2, Q2 y Q4 grado 1, Q1 grado 0.
      expect(ids).toContain('Q3');
      expect(ids).not.toContain('Q1');
    });

    it('descarta las aristas con un extremo fuera y las cuenta', () => {
      const nodes: NormalizedNode[] = ['Q1', 'Q2', 'Q3'].map((id) => ({
        uri: id,
        label: id,
        attributes: {},
      }));
      const edges: NormalizedEdge[] = [
        { id: 'e1', source: 'Q1', target: 'Q2', predicate: 'p' },
        { id: 'e2', source: 'Q1', target: 'Q3', predicate: 'p' },
      ];
      (component as unknown as { MAX_NODES: number }).MAX_NODES = 2;

      const built = build(createMockQueryResult(nodes, edges));
      const edgeIds = built.elements.filter((e) => 'source' in e.data).map((e) => e.data['id']);

      // Q1 (grado 2) y uno de Q2/Q3 sobreviven; la arista al descartado se va.
      expect(edgeIds.length).toBe(1);
      expect(built.edgesHiddenByTruncation).toBe(1);
    });

    it('emite el grado dibujado y el total por separado', () => {
      const nodes: NormalizedNode[] = ['Q1', 'Q2', 'Q3'].map((id) => ({
        uri: id,
        label: id,
        attributes: {},
      }));
      const edges: NormalizedEdge[] = [
        { id: 'e1', source: 'Q1', target: 'Q2', predicate: 'p' },
        { id: 'e2', source: 'Q1', target: 'Q3', predicate: 'p' },
      ];
      (component as unknown as { MAX_NODES: number }).MAX_NODES = 2;

      const built = build(createMockQueryResult(nodes, edges));
      const q1 = built.elements.find((e) => e.data['id'] === 'Q1');

      // El tamaño del nodo se calcula del grado dibujado, no del total.
      expect(q1?.data['totalDegree']).toBe(2);
      expect(q1?.data['degree']).toBe(1);
    });
  });

  describe('sin auto-colapso', () => {
    it('no esconde vecinos ni altera labels de nodos muy conectados', () => {
      // 25 vecinos de un hub: antes, con grado > 20, se colapsaba solo.
      const hub: NormalizedNode = { uri: 'hub', label: 'Hub', attributes: {} };
      const neighbors: NormalizedNode[] = Array.from({ length: 25 }, (_, i) => ({
        uri: `n${i}`,
        label: `N${i}`,
        attributes: {},
      }));
      const edges: NormalizedEdge[] = neighbors.map((n, i) => ({
        id: `e${i}`,
        source: 'hub',
        target: n.uri,
        predicate: 'p',
      }));

      emitResult([hub, ...neighbors], edges);
      const cy = lastCy();

      expect(cy._ids()).toHaveLength(26 + 25);
      const hubEl = cy.getElementById('hub') as { data: (k: string) => unknown };
      expect(hubEl.data('label')).toBe('Hub');
      expect(hubEl.data('collapsed')).toBeUndefined();
    });
  });

  describe('chip de cobertura', () => {
    it('muestra lote y truncado juntos', () => {
      const manyNodes: NormalizedNode[] = Array.from({ length: 301 }, (_, i) => ({
        uri: `Q${i + 1}`,
        label: `Nodo ${i + 1}`,
        attributes: {},
      }));
      const result = createMockQueryResult(manyNodes, [mockEdge]);
      result.bindings = [{ person: { type: 'uri', value: 'Q1' } }];
      queryResultSubject.next(result);
      visibleQueryResultSubject.next(result);
      lotStateSubject.next({
        lotSize: 300,
        currentLot: 2,
        lotCount: 3,
        totalRows: 900,
        visibleNodes: 301,
      });
      fixture.detectChanges();

      expect(component.coverageLabel).toBe(
        'Lote 2 de 3 · 1 filas · 300 de 301 nodos (los más conectados)',
      );
    });

    it('informa las aristas que el truncado dejó afuera', () => {
      const nodes: NormalizedNode[] = ['Q1', 'Q2', 'Q3'].map((id) => ({
        uri: id,
        label: id,
        attributes: {},
      }));
      const edges: NormalizedEdge[] = [
        { id: 'e1', source: 'Q1', target: 'Q2', predicate: 'p' },
        { id: 'e2', source: 'Q1', target: 'Q3', predicate: 'p' },
      ];
      (component as unknown as { MAX_NODES: number }).MAX_NODES = 2;

      emitResult(nodes, edges);

      expect(component.coverageLabel).toBe('2 de 3 nodos (los más conectados) · 1 arista oculta');
    });
  });

  describe('layout persistido', () => {
    it('instancia con el layout guardado, no con el default', () => {
      const viewState = TestBed.inject(DashboardViewStateService);
      viewState.graphState.set({ layout: 'dagre' });

      emitResult([mockNode, mockNode2], [mockEdge]);

      const options = lastCy()._options as { layout?: { name?: string } };
      expect(component.currentLayout).toBe('dagre');
      expect(options.layout?.name).toBe('dagre');
    });

    it('restaura la cámara guardada en vez de encuadrar', () => {
      const viewState = TestBed.inject(DashboardViewStateService);
      viewState.graphState.set({ layout: 'cola', pan: { x: 15, y: 25 }, zoom: 2 });

      emitResult([mockNode, mockNode2], [mockEdge]);
      const cy = lastCy();
      cy._emit('layoutstop', null, {});

      expect(cy.zoom).toHaveBeenCalledWith(2);
      expect(cy.pan()).toEqual({ x: 15, y: 25 });
      expect(cy.fit).not.toHaveBeenCalled();
    });

    it('encuadra una sola vez cuando no hay cámara guardada', () => {
      emitResult([mockNode, mockNode2], [mockEdge]);
      const cy = lastCy();

      cy._emit('layoutstop', null, {});
      cy._emit('layoutstop', null, {});

      expect(cy.fit).toHaveBeenCalledTimes(1);
    });
  });

  describe('arrastre suave', () => {
    /** Cadena A—B—C. */
    function chain(): ReturnType<typeof lastCy> {
      const nodes: NormalizedNode[] = ['A', 'B', 'C'].map((id) => ({
        uri: id,
        label: id,
        attributes: {},
      }));
      emitResult(nodes, [
        { id: 'ab', source: 'A', target: 'B', predicate: 'p' },
        { id: 'bc', source: 'B', target: 'C', predicate: 'p' },
      ]);
      return lastCy();
    }

    function nodeAt(cy: ReturnType<typeof lastCy>, id: string): { x: number; y: number } {
      const el = cy.getElementById(id) as { position: () => { x: number; y: number } };
      return el.position();
    }

    function moveTo(cy: ReturnType<typeof lastCy>, id: string, x: number, y: number): void {
      const el = cy.getElementById(id) as { position: (p: { x: number; y: number }) => unknown };
      el.position({ x, y });
    }

    function isLocked(cy: ReturnType<typeof lastCy>, id: string): boolean {
      return (cy.getElementById(id) as { locked: () => boolean }).locked();
    }

    function liveRuns(cy: ReturnType<typeof lastCy>): Record<string, unknown>[] {
      return cy._layoutRuns.filter((o) => o['infinite'] === true);
    }

    it('enciende la simulación de cola al agarrar un nodo', () => {
      const cy = chain();
      cy._emit('grab', 'node', { target: cy.getElementById('A'), originalEvent: {} });

      const live = liveRuns(cy);
      expect(live).toHaveLength(1);
      // No debe reencuadrar ni recentrar mientras acomodás.
      expect(live[0]['fit']).toBe(false);
      expect(live[0]['centerGraph']).toBe(false);
    });

    it('apaga la simulación al soltar', () => {
      const cy = chain();
      cy._emit('grab', 'node', { target: cy.getElementById('A'), originalEvent: {} });
      cy._emit('free', 'node', { target: cy.getElementById('A') });

      expect(cy._layoutStops.filter((o) => o['infinite'] === true)).toHaveLength(1);
    });

    it('no la enciende dos veces si llega otro grab', () => {
      const cy = chain();
      cy._emit('grab', 'node', { target: cy.getElementById('A'), originalEvent: {} });
      cy._emit('grab', 'node', { target: cy.getElementById('B'), originalEvent: {} });

      expect(liveRuns(cy)).toHaveLength(1);
    });

    it('con Shift no enciende la simulación: mueve solo ese nodo', () => {
      const cy = chain();
      cy._emit('grab', 'node', {
        target: cy.getElementById('A'),
        originalEvent: { shiftKey: true },
      });

      expect(liveRuns(cy)).toHaveLength(0);
    });

    it('no la enciende con un layout estructural como dagre', () => {
      const viewState = TestBed.inject(DashboardViewStateService);
      viewState.graphState.set({ layout: 'dagre' });
      const cy = chain();

      cy._emit('grab', 'node', { target: cy.getElementById('A'), originalEvent: {} });

      expect(liveRuns(cy)).toHaveLength(0);
    });

    it('clava los nodos ya acomodados y los libera al soltar', () => {
      const viewState = TestBed.inject(DashboardViewStateService);
      viewState.graphState.set({
        layout: 'cola',
        manualPositions: { B: { x: 50, y: 50 } },
      });
      const cy = chain();

      cy._emit('grab', 'node', { target: cy.getElementById('A'), originalEvent: {} });
      expect(isLocked(cy, 'B')).toBe(true);
      // El nodo que estás moviendo no se bloquea, aunque ya lo hubieras acomodado.
      expect(isLocked(cy, 'A')).toBe(false);
      expect(isLocked(cy, 'C')).toBe(false);

      cy._emit('free', 'node', { target: cy.getElementById('A') });
      expect(isLocked(cy, 'B')).toBe(false);
    });

    it('guarda solo la posición del nodo que soltaste, no la de los vecinos', () => {
      const cy = chain();
      const viewState = TestBed.inject(DashboardViewStateService);

      cy._emit('grab', 'node', { target: cy.getElementById('A'), originalEvent: {} });
      moveTo(cy, 'A', 30, 40);
      cy._emit('free', 'node', { target: cy.getElementById('A') });

      const manual = viewState.graphState()?.manualPositions;
      expect(manual?.['A']).toEqual({ x: 30, y: 40 });
      // A B lo acomodó la física, no el usuario: un layout futuro puede moverlo.
      expect(manual?.['B']).toBeUndefined();
      expect(nodeAt(cy, 'A')).toEqual({ x: 30, y: 40 });
    });

    it('reaplica el acomodo guardado después del layout', () => {
      const viewState = TestBed.inject(DashboardViewStateService);
      viewState.graphState.set({
        layout: 'cola',
        manualPositions: { [mockNode.uri]: { x: 77, y: 88 } },
      });

      emitResult([mockNode, mockNode2], [mockEdge]);
      const cy = lastCy();
      cy._emit('layoutstop', null, {});

      expect(nodeAt(cy, mockNode.uri)).toEqual({ x: 77, y: 88 });
    });

    it('cambiar el layout descarta el acomodo manual', () => {
      const cy = chain();
      const viewState = TestBed.inject(DashboardViewStateService);

      cy._emit('grab', 'node', { target: cy.getElementById('A'), originalEvent: {} });
      moveTo(cy, 'A', 30, 40);
      cy._emit('free', 'node', { target: cy.getElementById('A') });
      expect(viewState.graphState()?.manualPositions).toBeDefined();

      component.setLayout('dagre');

      expect(viewState.graphState()?.manualPositions).toBeUndefined();
    });
  });
});

describe('EntityColorService', () => {
  const defaultColor = '#607D8B';

  function buildService(configOverrides: Record<string, string> = {}) {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        EntityColorService,
        {
          provide: AppConfigService,
          useValue: {
            config: () => ({ classColors: configOverrides } as unknown as ReturnType<AppConfigService['config']>),
          },
        },
      ],
    });
    return TestBed.inject(EntityColorService);
  }

  it('returns default color for undefined type', () => {
    const service = buildService();
    expect(service.colorForType(undefined)).toBe(defaultColor);
  });

  it('returns default color for unknown type', () => {
    const service = buildService();
    expect(service.colorForType('http://unknown')).toBe(defaultColor);
  });

  it('uses classColors from app config', () => {
    const service = buildService(
      { 'http://www.wikidata.org/entity/Q5': '#000000' },
    );
    expect(service.colorForType('http://www.wikidata.org/entity/Q5')).toBe('#000000');
  });
});
