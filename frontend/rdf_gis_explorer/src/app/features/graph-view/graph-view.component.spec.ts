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
import { realEstateFixture } from './testing/entity-subgraph-fixtures';
import { EntitySummaryClipboardService } from './entity-summary-clipboard.service';

const mockNode: NormalizedNode = {
  uri: 'http://www.wikidata.org/entity/Q7742',
  label: 'Juan Domingo Perón',
  classes: ['http://www.wikidata.org/entity/Q5'],
  attributes: {},
};

const mockNode2: NormalizedNode = {
  uri: 'http://www.wikidata.org/entity/Q41404',
  label: 'Argentina',
  classes: ['http://www.wikidata.org/entity/Q515'],
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

function createRepeatedPairResult(count = 2): QueryResult {
  const nodes = Array.from({ length: count }, (_, index) => [
    { uri: `listing-${index}`, label: `listing-${index}`, queryVariable: 'listing', attributes: {} },
    { uri: `estate-${index}`, label: `estate-${index}`, queryVariable: 'realEstate', attributes: {} },
  ]).flat() as NormalizedNode[];
  const edges = Array.from({ length: count }, (_, index) => ({
    id: `about-${index}`,
    source: `listing-${index}`,
    target: `estate-${index}`,
    predicate: 'http://rdfs.org/sioc/ns#about',
    predicateLabel: 'about',
  }));
  return {
    ...createMockQueryResult(nodes, edges),
    bindings: Array.from({ length: count }, (_, index) => ({
      listing: { type: 'uri' as const, value: `listing-${index}` },
      realEstate: { type: 'uri' as const, value: `estate-${index}` },
    })),
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
        // Unión de las cajas de TODOS los elementos: el encuadre de la vista
        // coordinada se calcula sobre la colección enfocada, no sobre uno.
        boundingBox: () => {
          const points = items.length ? items.map((it) => it.position) : [{ x: 0, y: 0 }];
          const x1 = Math.min(...points.map((p) => p.x)) - 5;
          const x2 = Math.max(...points.map((p) => p.x)) + 5;
          const y1 = Math.min(...points.map((p) => p.y)) - 5;
          const y2 = Math.max(...points.map((p) => p.y)) + 5;
          return { x1, x2, y1, y2, w: x2 - x1, h: y2 - y1 };
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
      // Viewport: el encuadre de la vista coordinada calcula el zoom a mano
      // (piso de zoom), así que necesita medidas y el tope de zoom reales.
      width: () => 800,
      height: () => 600,
      maxZoom: () => 5,
      minZoom: () => 0.05,
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
  let focusSubject: BehaviorSubject<{ uris: Set<string>; source: string | null }>;

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

    focusSubject = new BehaviorSubject<{ uris: Set<string>; source: string | null }>({
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
      getSelectedNodeSnapshot: vi.fn(() => selectedNodeSubject.getValue()),
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
    component.currentLayout = 'dagre';
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

  it('should have dagre as default layout', () => {
    expect(component.currentLayout).toBe('dagre');
  });

  it('oculta Cuadrícula cuando hay relaciones', () => {
    emitResult([mockNode, mockNode2], [mockEdge]);
    fixture.detectChanges();

    const options = Array.from(
      fixture.nativeElement.querySelectorAll('#graph-layout option') as NodeListOf<HTMLOptionElement>,
    );
    expect(options.map((option) => option.value)).toEqual(['dagre', 'cola']);
    expect(options.map((option) => option.textContent)).toEqual([
      'Jerárquico — Ordena relaciones dirigidas por niveles',
      'Orgánico — Distribuye redes mediante fuerzas',
    ]);
  });

  it('usa y ofrece Cuadrícula automáticamente cuando no hay relaciones', () => {
    emitResult([mockNode, mockNode2], []);
    fixture.detectChanges();

    expect(component.currentLayout).toBe('grid');
    expect(component.availableLayoutOptions.map((option) => option.value)).toContain('grid');
  });

  it('calcula la disposición inicial sin animar desde posiciones superpuestas', () => {
    emitResult([mockNode, mockNode2], [mockEdge]);

    const cy = lastCy();
    const bootstrapLayout = cy._options['layout'] as Record<string, unknown>;

    expect(bootstrapLayout['name']).toBe('preset');
    expect(cy._layoutRuns[0]?.['animate']).toBe(false);
  });

  it('inicia Cola con posiciones aleatorias sin bloquear el hilo principal', () => {
    TestBed.inject(DashboardViewStateService).graphState.set({ layout: 'cola' });
    const reverseEdge: NormalizedEdge = {
      id: 'edge-2',
      source: mockNode2.uri,
      target: mockNode.uri,
      predicate: 'http://example.org/reverse',
    };

    emitResult([mockNode, mockNode2], [mockEdge, reverseEdge]);

    const initialLayout = lastCy()._layoutRuns[0];
    expect(initialLayout?.['name']).toBe('cola');
    expect(initialLayout?.['animate']).toBe(true);
    expect(initialLayout?.['randomize']).toBe(true);
  });

  it('inicia en Resumen y el selector refleja el nivel activo', () => {
    emitResult([mockNode, mockNode2], [mockEdge]);
    fixture.detectChanges();

    const select = fixture.nativeElement.querySelector('#graph-detail') as HTMLSelectElement;
    expect(component.detailLevel).toBe('summary');
    expect(select.value).toBe('summary');
  });

  it('Resumen construye un único motivo para pares estructuralmente repetidos', () => {
    const nodes = Array.from({ length: 3 }, (_, index) => [
      { uri: `listing-${index}`, label: `listing-${index}`, queryVariable: 'listing', attributes: {} },
      { uri: `estate-${index}`, label: `estate-${index}`, queryVariable: 'realEstate', attributes: {} },
    ]).flat() as NormalizedNode[];
    const edges = Array.from({ length: 3 }, (_, index) => ({
      id: `about-${index}`,
      source: `listing-${index}`,
      target: `estate-${index}`,
      predicate: 'http://rdfs.org/sioc/ns#about',
      predicateLabel: 'about',
    }));
    const result: QueryResult = {
      ...createMockQueryResult(nodes, edges),
      bindings: Array.from({ length: 3 }, (_, index) => ({
        listing: { type: 'uri' as const, value: `listing-${index}` },
        realEstate: { type: 'uri' as const, value: `estate-${index}` },
      })),
    };

    queryResultSubject.next(result);
    visibleQueryResultSubject.next(result);
    fixture.detectChanges();

    expect(lastCy()._ids().filter((id: string) => id.includes('component-motif'))).toHaveLength(3);
    expect(component.coverageLabel).toBe('6 nodos representados en 1 motivo repetido');
  });

  it('Exploración reemplaza el motivo por sus entidades originales', () => {
    const nodes = Array.from({ length: 2 }, (_, index) => [
      { uri: `listing-${index}`, label: `listing-${index}`, queryVariable: 'listing', attributes: {} },
      { uri: `estate-${index}`, label: `estate-${index}`, queryVariable: 'realEstate', attributes: {} },
    ]).flat() as NormalizedNode[];
    const edges = Array.from({ length: 2 }, (_, index) => ({
      id: `about-${index}`,
      source: `listing-${index}`,
      target: `estate-${index}`,
      predicate: 'http://rdfs.org/sioc/ns#about',
    }));
    const result: QueryResult = {
      ...createMockQueryResult(nodes, edges),
      bindings: Array.from({ length: 2 }, (_, index) => ({
        listing: { type: 'uri' as const, value: `listing-${index}` },
        realEstate: { type: 'uri' as const, value: `estate-${index}` },
      })),
    };
    queryResultSubject.next(result);
    visibleQueryResultSubject.next(result);
    fixture.detectChanges();

    component.setDetailLevel('exploration');

    expect(lastCy()._ids()).toContain('listing-0');
    expect(lastCy()._ids().some((id: string) => id.includes('component-motif'))).toBe(false);
    expect(lastCy()._layoutRuns[0]).toMatchObject({
      name: 'dagre',
      nodeDimensionsIncludeLabels: true,
      nodeSep: 60,
      rankSep: 95,
      edgeSep: 24,
    });
  });

  /**
   * Una entidad colapsada dentro de un motivo no existe como nodo propio en el
   * lienzo: antes, seleccionarla desde otra vista no resaltaba nada. Ahora se
   * resalta el nodo resumen que la contiene ("está acá adentro").
   */
  it('resalta el nodo resumen que contiene a la entidad seleccionada en otra vista', () => {
    const result = createRepeatedPairResult();
    queryResultSubject.next(result);
    visibleQueryResultSubject.next(result);
    fixture.detectChanges();

    const cy = lastCy();
    expect(cy._ids()).not.toContain('listing-0'); // quedó colapsada en el motivo

    selectedNodeSubject.next({
      node: { uri: 'listing-0', label: 'listing-0', attributes: {} },
      source: 'timeline',
      relatedUris: new Set(['listing-0', 'estate-0']),
    });
    fixture.detectChanges();

    const seleccionados = cy
      ._ids()
      .filter((id: string) => cy._classesOf(id).includes('is-selected'));
    expect(seleccionados).toHaveLength(1);
    expect(seleccionados[0]).toContain('component-motif');
    // Y el resumen resaltado es justamente el que agrupa a listing-0.
    const miembros = (cy._els as Array<{ id: string; data: Record<string, unknown> }>).find(
      (el) => el.id === seleccionados[0],
    )?.data['memberNodeIds'] as string[] | undefined;
    expect(miembros).toContain('listing-0');
  });

  it('no resalta nada si ni la entidad ni su fila están en el lienzo', () => {
    const result = createRepeatedPairResult();
    queryResultSubject.next(result);
    visibleQueryResultSubject.next(result);
    fixture.detectChanges();

    const cy = lastCy();
    selectedNodeSubject.next({
      node: { uri: 'ajena-1', label: 'ajena', attributes: {} },
      source: 'map',
      relatedUris: new Set(['ajena-1']),
    });
    fixture.detectChanges();

    expect(cy._ids().filter((id: string) => cy._classesOf(id).includes('is-selected'))).toHaveLength(
      0,
    );
  });

  it('expande reversiblemente un motivo al pulsar su arista agregada', () => {
    const result = createRepeatedPairResult();
    queryResultSubject.next(result);
    visibleQueryResultSubject.next(result);
    fixture.detectChanges();
    const cy = lastCy();
    const motifEdgeId = cy._ids().find((id: string) => id.includes(':edge:'))!;

    cy._emit('tap', 'edge', { target: cy.getElementById(motifEdgeId) });

    expect(lastCy()._ids()).toContain('listing-0');
    expect(lastCy()._ids().some((id: string) => id.includes('component-motif'))).toBe(false);
    expect(component.coverageLabel).toBe('');

    const expandedCy = lastCy();
    expandedCy._emit('tap', 'edge', { target: expandedCy.getElementById('about-0') });

    expect(lastCy()._ids().filter((id: string) => id.includes('component-motif'))).toHaveLength(3);
    expect(component.coverageLabel).toBe('4 nodos representados en 1 motivo repetido');
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

    expect(component.coverageLabel).toBe('300 de 301 nodos visibles');
    const chip = (fixture.nativeElement as HTMLElement).querySelector('.coverage-chip');
    expect(chip?.textContent?.trim()).toBe('300 de 301 nodos visibles');
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

  describe('clear externo y foco vacío', () => {
    it('un clearSelection externo limpia is-selected e is-dimmed', () => {
      const lonely: NormalizedNode = {
        uri: 'http://www.wikidata.org/entity/Q888',
        label: 'Aislado',
        attributes: {},
      };
      emitResult([mockNode, mockNode2, lonely], [mockEdge]);
      const cy = lastCy();

      // Selección propia: pinta is-selected en el nodo e is-dimmed en el aislado.
      cy._emit('tap', 'node', { target: cy.getElementById(mockNode.uri) });
      expect(cy._classesOf(mockNode.uri)).toContain('is-selected');
      expect(cy._classesOf(lonely.uri)).toContain('is-dimmed');

      // Clear desde otra vista (source externo, sin nodo).
      selectedNodeSubject.next({ node: null, source: 'external' });
      fixture.detectChanges();

      expect(cy._classesOf(mockNode.uri)).toEqual([]);
      expect(cy._classesOf(lonely.uri)).toEqual([]);
    });

    /** El mock tipa las colecciones como índice, así que posicionar pide cast. */
    function placeNode(cy: ReturnType<typeof lastCy>, id: string, x: number, y: number): void {
      (cy.getElementById(id) as { position: (p: { x: number; y: number }) => unknown }).position({
        x,
        y,
      });
    }

    it('un foco externo vacío limpia el dimming y las is-focus-edge', () => {
      emitResult([mockNode, mockNode2], [mockEdge]);
      const cy = lastCy();

      focusSubject.next({ uris: new Set([mockNode.uri]), source: 'map' });
      fixture.detectChanges();
      expect(cy._classesOf(mockEdge.id)).toContain('is-focus-edge');

      focusSubject.next({ uris: new Set(), source: 'map' });
      fixture.detectChanges();

      expect(cy._classesOf(mockEdge.id)).toEqual([]);
      expect(cy._classesOf(mockNode.uri)).toEqual([]);
      expect(cy._classesOf(mockNode2.uri)).toEqual([]);
    });

    /**
     * Antes, el foco coordinado limpiaba las clases y se llevaba puesto el
     * resaltado del nodo seleccionado: con decenas de nodos enfocados, todos
     * iguales, no se veía cuál estaba seleccionado.
     */
    it('conserva el resaltado del seleccionado y atenúa el resto del foco', () => {
      emitResult([mockNode, mockNode2], [mockEdge]);
      const cy = lastCy();

      selectedNodeSubject.next({ node: mockNode, source: 'table' });
      fixture.detectChanges();
      expect(cy._classesOf(mockNode.uri)).toContain('is-selected');

      focusSubject.next({ uris: new Set([mockNode.uri, mockNode2.uri]), source: 'map' });
      fixture.detectChanges();

      expect(cy._classesOf(mockNode.uri)).toContain('is-selected');
      expect(cy._classesOf(mockNode.uri)).not.toContain('is-muted');
      // El otro nodo del foco se ve, pero deja de competir con el seleccionado.
      expect(cy._classesOf(mockNode2.uri)).toContain('is-muted');
      expect(cy._classesOf(mockNode2.uri)).not.toContain('is-dimmed');
    });

    it('no atenúa el foco cuando no hay nada seleccionado', () => {
      emitResult([mockNode, mockNode2], [mockEdge]);
      const cy = lastCy();

      focusSubject.next({ uris: new Set([mockNode.uri, mockNode2.uri]), source: 'map' });
      fixture.detectChanges();

      expect(cy._classesOf(mockNode.uri)).not.toContain('is-muted');
      expect(cy._classesOf(mockNode2.uri)).not.toContain('is-muted');
    });

    /**
     * El foco que mandan el mapa y la timeline abarca todo lo que entra en SU
     * viewport: encuadrarlo con `fit` dejaba el grafo tan lejos que los nodos
     * eran puntos. El encuadre no baja de `FOCUS_MIN_ZOOM`.
     */
    it('no se aleja por debajo del piso de zoom al encuadrar un foco amplio', () => {
      const nodes: NormalizedNode[] = Array.from({ length: 6 }, (_, i) => ({
        uri: `Q${i}`,
        label: `N${i}`,
        attributes: {},
      }));
      emitResult(nodes, []);
      const cy = lastCy();
      // Nodos bien separados: encuadrarlos a todos exigiría alejarse mucho.
      nodes.forEach((n, i) => placeNode(cy, n.uri, i * 4000, i * 4000));
      cy.animate.mockClear();

      focusSubject.next({ uris: new Set(nodes.map((n) => n.uri)), source: 'map' });
      fixture.detectChanges();

      expect(cy.animate).toHaveBeenCalledTimes(1);
      const opts = cy.animate.mock.calls[0][0] as { zoom: number; pan: { x: number; y: number } };
      expect(opts.zoom).toBeCloseTo(0.8, 5);
      expect(Number.isFinite(opts.pan.x)).toBe(true);
    });

    it('respeta el encuadre ajustado cuando el foco entra sin alejarse', () => {
      const nodes: NormalizedNode[] = Array.from({ length: 3 }, (_, i) => ({
        uri: `P${i}`,
        label: `N${i}`,
        attributes: {},
      }));
      emitResult(nodes, []);
      const cy = lastCy();
      // Foco chico y compacto, pero fuera del viewport actual.
      nodes.forEach((n, i) => placeNode(cy, n.uri, 20000 + i * 10, 20000));
      cy.animate.mockClear();

      focusSubject.next({ uris: new Set(nodes.map((n) => n.uri)), source: 'timeline' });
      fixture.detectChanges();

      const opts = cy.animate.mock.calls[0][0] as { zoom: number };
      // Cabe de sobra: el zoom lo decide el encuadre (tope 5), no el piso.
      expect(opts.zoom).toBeGreaterThan(0.8);
      expect(opts.zoom).toBeLessThanOrEqual(5);
    });
  });

  describe('límite reactivo', () => {
    it('un cambio runtime de graphMaxNodes reconstruye la vista una sola vez', () => {
      const nodes: NormalizedNode[] = Array.from({ length: 5 }, (_, i) => ({
        uri: `Q${i}`,
        label: `N${i}`,
        attributes: {},
      }));
      emitResult(nodes, []);
      expect(cyRegistry.instances.length).toBe(1);

      const limits = TestBed.inject(LimitsService);
      limits.apply({ ...DEFAULT_LIMITS, graphMaxNodes: 3 });
      fixture.detectChanges();

      expect(cyRegistry.instances.length).toBe(2);
      expect(lastCy()._ids()).toHaveLength(3);

      // Re-aplicar el mismo valor no reconstruye de nuevo.
      limits.apply({ ...DEFAULT_LIMITS, graphMaxNodes: 3 });
      fixture.detectChanges();
      expect(cyRegistry.instances.length).toBe(2);
    });

    it('sin grafo dibujado solo actualiza MAX_NODES, sin instanciar cytoscape', () => {
      const limits = TestBed.inject(LimitsService);
      limits.apply({ ...DEFAULT_LIMITS, graphMaxNodes: 42 });
      fixture.detectChanges();

      expect(component.MAX_NODES).toBe(42);
      expect(cyRegistry.instances.length).toBe(0);
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
        'Lote 2 de 3 · 1 filas · 300 de 301 nodos visibles · 1 priorizados por la query',
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

      expect(component.coverageLabel).toBe('2 de 3 nodos visibles · 1 arista oculta');
    });
  });

  describe('layout persistido', () => {
    it('instancia con el layout guardado, no con el default', () => {
      const viewState = TestBed.inject(DashboardViewStateService);
      viewState.graphState.set({ layout: 'dagre' });

      emitResult([mockNode, mockNode2], [mockEdge]);

      const cy = lastCy();
      expect(component.currentLayout).toBe('dagre');
      expect(cy._layoutRuns[0]?.['name']).toBe('dagre');
    });

    it.each(['cola', 'dagre', 'grid'] as const)('acepta el identificador histórico %s', (layout) => {
      TestBed.inject(DashboardViewStateService).graphState.set({ layout });

      emitResult([mockNode, mockNode2], [mockEdge]);

      expect(component.currentLayout).toBe(layout);
      expect(lastCy()._layoutRuns[0]?.['name']).toBe(layout);
      if (layout === 'grid') {
        expect(component.availableLayoutOptions.map((option) => option.value)).toContain('grid');
      }
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
    function chain(layout: 'cola' | 'dagre' = 'cola'): ReturnType<typeof lastCy> {
      const state = TestBed.inject(DashboardViewStateService).graphState();
      TestBed.inject(DashboardViewStateService).graphState.set({ ...state, layout });
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
      const cy = chain('dagre');

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

  // ---------------------------------------------------------------------------
  // Etapa 5: interfaz del modo entidad
  // ---------------------------------------------------------------------------
  describe('modo entidad', () => {
    const estate = realEstateFixture(10);

    function nodeOf(uri: string): NormalizedNode {
      return estate.result.nodes.find((n) => n.uri === uri)!;
    }

    function emitEstate(result: QueryResult = estate.result): void {
      queryResultSubject.next(result);
      visibleQueryResultSubject.next(result);
      fixture.detectChanges();
    }

    function select(uri: string, source: Selection['source'] = 'table'): void {
      selectedNodeSubject.next({ node: nodeOf(uri), source });
      fixture.detectChanges();
    }

    /** Entra al modo entidad con `listing/0` como raíz, desde la tabla. */
    function enter(): void {
      emitEstate();
      select(estate.root);
      component.showStructure();
      fixture.detectChanges();
    }

    function drawnIds(): string[] {
      return lastCy()._ids();
    }

    /** Sólo nodos: `_ids()` incluye también las aristas. */
    function drawnNodeIds(): string[] {
      return lastCy()
        ._els.filter((element) => element.isNode)
        .map((element) => element.id);
    }

    function branchOf(uri: string) {
      return [...component.entityBranches, ...component.entityOtherBranches].find(
        (branch) => branch.nodeUri === uri && branch.canExpand,
      )!;
    }

    function press(key: string): void {
      (fixture.nativeElement as HTMLElement).dispatchEvent(
        new KeyboardEvent('keydown', { key, bubbles: true }),
      );
      fixture.detectChanges();
    }

    it('no ofrece Ver estructura sin una selección explícita', () => {
      emitEstate();

      expect(component.canEnterEntityMode).toBe(false);
      const compiled = fixture.nativeElement as HTMLElement;
      const labels = [...compiled.querySelectorAll('button')].map((b) => b.textContent?.trim());
      expect(labels).not.toContain('Ver estructura');
    });

    it('ofrece Ver estructura cuando hay una selección de otra vista', () => {
      emitEstate();
      select(estate.root, 'map');

      expect(component.canEnterEntityMode).toBe(true);
      const compiled = fixture.nativeElement as HTMLElement;
      const labels = [...compiled.querySelectorAll('button')].map((b) => b.textContent?.trim());
      expect(labels).toContain('Ver estructura');
    });

    it.each(['table', 'map', 'timeline', 'graph'] as const)(
      'entra desde una selección de %s y dibuja sólo la estructura de la raíz',
      (source) => {
        emitEstate();
        select(estate.root, source);
        component.showStructure();
        fixture.detectChanges();

        expect(component.isEntityMode).toBe(true);
        expect(component.entityRootUri).toBe(estate.root);
        const ids = drawnIds();
        expect(ids).toContain(estate.root);
        expect(ids).toContain(estate.estate);
        expect(ids).toContain(estate.geometry);
        // El hairball no vuelve: los otros avisos no entran por el hub.
        expect(ids).not.toContain(estate.otherListing);
        expect(ids).not.toContain(estate.otherEstate);
      },
    );

    it('usa Jerárquico y sube el nivel para que se lean las etiquetas', () => {
      expect(component.detailLevel).toBe('summary');

      enter();

      expect(component.currentLayout).toBe('dagre');
      expect(component.detailLevel).toBe('exploration');
      expect(lastCy()._layoutRuns[0]?.['name']).toBe('dagre');
    });

    it('conecta las dos acciones de copia y anuncia el resultado', async () => {
      enter();
      const clipboard = TestBed.inject(EntitySummaryClipboardService);
      const view = vi.spyOn(clipboard, 'copyCurrentView').mockResolvedValue({
        status: 'copied',
        scope: 'view',
        copied: true,
        text: 'vista',
        metrics: null,
        message: 'Vista copiada.',
      });
      const structure = vi.spyOn(clipboard, 'copyFullStructure').mockResolvedValue({
        status: 'copied',
        scope: 'structure',
        copied: true,
        text: 'estructura',
        metrics: null,
        message: 'Estructura copiada.',
      });

      await component.copyCurrentEntityView();
      expect(view).toHaveBeenCalledOnce();
      expect(component.explorationMessage).toBe('Vista copiada.');

      await component.copyFullEntityStructure();
      expect(structure).toHaveBeenCalledOnce();
      expect(component.explorationMessage).toBe('Estructura copiada.');
    });

    it('expone el texto para copia manual cuando no hay API disponible', async () => {
      enter();
      vi.spyOn(TestBed.inject(EntitySummaryClipboardService), 'copyCurrentView').mockResolvedValue({
        status: 'unsupported',
        scope: 'view',
        copied: false,
        text: 'texto inequívoco',
        metrics: null,
        message: 'Copialo manualmente.',
      });

      await component.copyCurrentEntityView();
      fixture.detectChanges();

      expect(component.copyFallbackText).toBe('texto inequívoco');
      expect((fixture.nativeElement as HTMLElement).querySelector('textarea')?.value).toBe(
        'texto inequívoco',
      );
    });

    it('el selector de vista refleja y cambia el modo', () => {
      emitEstate();
      select(estate.root);
      expect(component.explorationMode).toBe('result');

      component.setExplorationMode('entity');
      fixture.detectChanges();
      expect(component.explorationMode).toBe('entity');

      component.setExplorationMode('result');
      fixture.detectChanges();
      expect(component.explorationMode).toBe('result');
    });

    it('el foco coordinado no inicia la exploración', () => {
      emitEstate();
      select(estate.root);

      focusSubject.next({
        uris: new Set(estate.result.nodes.map((node) => node.uri)),
        source: 'map',
      });
      fixture.detectChanges();

      expect(component.isEntityMode).toBe(false);
    });

    it('el foco coordinado no reencuadra ni altera el subgrafo explorado', () => {
      enter();
      const cy = lastCy();
      const before = drawnIds();
      cy.animate.mockClear();

      focusSubject.next({
        uris: new Set(estate.result.nodes.map((node) => node.uri)),
        source: 'timeline',
      });
      fixture.detectChanges();

      expect(component.isEntityMode).toBe(true);
      expect(drawnIds()).toEqual(before);
      expect(cy.animate).not.toHaveBeenCalled();
    });

    it('expandir un recurso compartido agrega sólo sus vecinos, sin recrear el lienzo', () => {
      enter();
      const instances = cyRegistry.instances.length;
      const before = drawnNodeIds().length;
      const branch = branchOf(estate.partido);

      expect(branch.reachesHub || branch.pendingCount > 0).toBe(true);
      component.expandBranchById(branch.id);
      fixture.detectChanges();

      expect(drawnNodeIds().length).toBeGreaterThan(before);
      // Ni se reconstruye el grafo global ni se recrea la instancia: patch.
      expect(drawnNodeIds().length).toBeLessThan(estate.result.nodes.length);
      expect(cyRegistry.instances.length).toBe(instances);
      expect(component.explorationMessage).toBe('');
    });

    it('contraer devuelve la vista al estado anterior', () => {
      enter();
      const before = drawnNodeIds().length;
      const branch = branchOf(estate.partido);

      component.expandBranchById(branch.id);
      fixture.detectChanges();
      component.collapseBranchById(branch.id);
      fixture.detectChanges();

      expect(drawnNodeIds().length).toBe(before);
      expect(component.explorationState.expandedBranchIds).toEqual([]);
    });

    it('una expansión que no entra en el presupuesto se rechaza con explicación accesible', () => {
      TestBed.inject(LimitsService).apply({ ...DEFAULT_LIMITS, graphMaxNodes: 8 });
      fixture.detectChanges();
      enter();
      const before = drawnNodeIds().length;

      component.expandBranchById(branchOf(estate.partido).id);
      fixture.detectChanges();

      expect(component.explorationMessage).toContain('presupuesto');
      expect(drawnNodeIds().length).toBe(before);
      const alert = (fixture.nativeElement as HTMLElement).querySelector('[role="alert"]');
      expect(alert?.textContent).toContain('presupuesto');
    });

    it('el panel publica métricas de visibles, disponibles y omitidos', () => {
      enter();

      const metrics = (fixture.nativeElement as HTMLElement).querySelector(
        '.entity-panel__metrics',
      );
      expect(metrics?.textContent).toContain('nodos');
      expect(metrics?.textContent).toContain('tripletas');
      expect(component.entityMetrics).toBe(metrics?.textContent?.trim());
    });

    it('fija y desfija el nodo activo', () => {
      enter();

      component.togglePinActive();
      expect(component.explorationState.pinnedUris).toEqual([estate.root]);

      component.togglePinActive();
      expect(component.explorationState.pinnedUris).toEqual([]);
    });

    it('usa el nodo activo como nueva raíz y el breadcrumb recuerda la anterior', () => {
      enter();
      select(estate.estate);

      expect(component.entityActiveUri).toBe(estate.estate);
      expect(component.entityRootUri).toBe(estate.root);

      component.promoteActive();
      fixture.detectChanges();

      expect(component.entityRootUri).toBe(estate.estate);
      expect(component.entityCrumbs.map((crumb) => crumb.uri)).toEqual([
        estate.root,
        estate.estate,
      ]);
      expect(component.entityCrumbs[1].current).toBe(true);
    });

    it('el breadcrumb vuelve a una raíz anterior', () => {
      enter();
      select(estate.estate);
      component.promoteActive();
      fixture.detectChanges();

      component.goToCrumb(estate.root);
      fixture.detectChanges();

      expect(component.entityRootUri).toBe(estate.root);
    });

    it('volver a la raíz y restablecer no salen del modo entidad', () => {
      enter();
      select(estate.estate);
      component.expandBranchById(branchOf(estate.partido).id);
      fixture.detectChanges();

      component.backToRoot();
      fixture.detectChanges();
      expect(component.entityActiveUri).toBe(estate.root);

      component.resetEntityExploration();
      fixture.detectChanges();
      expect(component.explorationState.expandedBranchIds).toEqual([]);
      expect(component.isEntityMode).toBe(true);
    });

    it('una selección posterior no reemplaza la raíz sin acción explícita', () => {
      enter();

      select(estate.otherListing, 'map');

      expect(component.entityRootUri).toBe(estate.root);
      expect(component.entityRootCandidate?.uri).toBe(estate.otherListing);

      component.exploreSelectedAsRoot();
      fixture.detectChanges();

      expect(component.entityRootUri).toBe(estate.otherListing);
    });

    it('una selección dentro de la estructura sólo mueve el nodo activo', () => {
      enter();

      select(estate.address, 'timeline');

      expect(component.entityActiveUri).toBe(estate.address);
      expect(component.entityRootUri).toBe(estate.root);
      expect(component.entityRootCandidate).toBeNull();
    });

    it('el tap en el lienzo emite selección y mueve el nodo activo', () => {
      enter();
      const cy = lastCy();
      const selectionService = TestBed.inject(SelectionService);

      cy._emit('tap', 'node', { target: cy.getElementById(estate.address) });
      selectedNodeSubject.next({ node: nodeOf(estate.address), source: 'graph' });
      fixture.detectChanges();

      expect(selectionService.select).toHaveBeenCalledWith(nodeOf(estate.address), 'graph');
      expect(component.entityActiveUri).toBe(estate.address);
    });

    it('volver al resultado recupera cámara, layout y nivel previos', () => {
      emitEstate();
      component.setDetailLevel('detail');
      component.setLayout('cola');
      fixture.detectChanges();
      const resultCy = lastCy();
      resultCy.zoom(2);
      resultCy.pan({ x: 15, y: 25 });

      select(estate.root);
      component.showStructure();
      fixture.detectChanges();
      expect(component.currentLayout).toBe('dagre');

      component.exitEntityMode();
      fixture.detectChanges();

      expect(component.isEntityMode).toBe(false);
      expect(component.currentLayout).toBe('cola');
      expect(component.detailLevel).toBe('detail');
      const restored = lastCy();
      restored._emit('layoutstop', null, {});
      expect(restored.zoom).toHaveBeenCalledWith(2);
      expect(restored.pan()).toEqual({ x: 15, y: 25 });
      expect(restored.fit).not.toHaveBeenCalled();
      // El resultado completo vuelve a estar dibujado.
      expect(drawnIds()).toContain(estate.otherListing);
    });

    it('el estado de exploración es transitorio: no se persiste en el tablero', () => {
      emitEstate();
      component.setLayout('cola');
      const viewState = TestBed.inject(DashboardViewStateService);
      const persisted = viewState.graphState();

      select(estate.root);
      component.showStructure();
      component.setLayout('grid');
      component.expandBranchById(branchOf(estate.partido).id);
      fixture.detectChanges();

      expect(viewState.graphState()).toEqual(persisted);
      expect(viewState.graphState()?.layout).toBe('cola');
    });

    it('se maneja con teclado: Esc sale, Retroceso deshace, Inicio vuelve a la raíz', () => {
      enter();
      select(estate.estate);
      expect(component.entityActiveUri).toBe(estate.estate);

      press('Home');
      expect(component.entityActiveUri).toBe(estate.root);

      press('Backspace');
      expect(component.entityActiveUri).toBe(estate.estate);

      press('Escape');
      expect(component.isEntityMode).toBe(false);
    });

    it('las flechas expanden y contraen la rama del nodo activo', () => {
      enter();
      select(estate.partido);
      const before = drawnNodeIds().length;

      press('ArrowRight');
      expect(drawnNodeIds().length).toBeGreaterThan(before);

      press('ArrowLeft');
      expect(drawnNodeIds().length).toBe(before);
    });

    it('el teclado no interfiere fuera del modo entidad', () => {
      emitEstate();
      select(estate.root);

      press('Escape');

      expect(component.isEntityMode).toBe(false);
      expect(component.canEnterEntityMode).toBe(true);
    });

    it('sigue explorando cuando la raíz sale del lote pero está en el resultado completo', () => {
      enter();

      visibleQueryResultSubject.next({
        ...estate.result,
        nodes: estate.result.nodes.filter((node) => node.uri !== estate.root),
        bindings: [],
      });
      fixture.detectChanges();

      expect(component.isEntityMode).toBe(true);
      expect(component.entityWarnings).toContain('resultado completo');
    });

    it('vuelve al resultado con aviso si la raíz desaparece del resultado', () => {
      enter();

      const without = {
        ...estate.result,
        nodes: estate.result.nodes.filter((node) => node.uri !== estate.root),
        bindings: [],
      };
      queryResultSubject.next(without);
      visibleQueryResultSubject.next(without);
      fixture.detectChanges();

      expect(component.isEntityMode).toBe(false);
      expect(component.explorationMessage).toContain('resultado completo');
    });

    it('un resultado vacío descarta la exploración sin dejar estado colgado', () => {
      enter();

      queryResultSubject.next(null);
      visibleQueryResultSubject.next(null);
      fixture.detectChanges();

      expect(component.isEntityMode).toBe(false);
      expect(component.entitySubgraph).toBeNull();
      expect(component.entityBranches).toEqual([]);
      expect(component.queryState).toBe('no-query');
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

  it('returns default color for undefined class', () => {
    const service = buildService();
    expect(service.colorForClass(undefined)).toBe(defaultColor);
  });

  it('returns default color for unknown class', () => {
    const service = buildService();
    expect(service.colorForClass('http://unknown')).toBe(defaultColor);
  });

  it('uses classColors from app config', () => {
    const service = buildService(
      { 'http://www.wikidata.org/entity/Q5': '#000000' },
    );
    expect(service.colorForClass('http://www.wikidata.org/entity/Q5')).toBe('#000000');
  });
});
