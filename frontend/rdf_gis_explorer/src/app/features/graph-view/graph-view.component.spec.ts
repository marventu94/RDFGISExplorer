import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { BehaviorSubject, of } from 'rxjs';
import { GraphViewComponent } from './graph-view.component';
import { SelectionService, type LotState } from '@core/services/selection.service';
import { EntityColorService } from '@core/services/entity-color.service';
import { AppConfigService } from '@core/services/app-config.service';
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
// esto hace que createMockCy exista tanto para la factory como para los tests.
const { createMockCy } = vi.hoisted(() => {
  function createMockCy() {
    const collectionObj = {
      style: vi.fn().mockReturnThis(),
      data: vi.fn(),
      id: vi.fn(() => 'mock-id'),
      empty: vi.fn(() => false),
      closedNeighborhood: vi.fn(function (this: Record<string, unknown>) {
        return this;
      }),
      difference: vi.fn(function (this: Record<string, unknown>) {
        return this;
      }),
      forEach: vi.fn(),
      degree: vi.fn(() => 5),
      connectedEdges: vi.fn(function (this: Record<string, unknown>) {
        return this;
      }),
      connectedNodes: vi.fn(function (this: Record<string, unknown>) {
        return this;
      }),
      filter: vi.fn(function (this: Record<string, unknown>) {
        return this;
      }),
    };
    return {
      destroy: vi.fn(),
      resize: vi.fn(),
      fit: vi.fn(),
      zoom: vi.fn(),
      center: vi.fn(),
      layout: vi.fn(() => ({ run: vi.fn() })),
      elements: vi.fn(() => collectionObj),
      nodes: vi.fn(() => collectionObj),
      getElementById: vi.fn(() => collectionObj),
      on: vi.fn(),
      ready: vi.fn((cb: () => void) => cb()),
      animate: vi.fn(),
      style: vi.fn().mockReturnThis(),
    };
  }
  return { createMockCy };
});

vi.mock('cytoscape', () => {
  const mockCyBuilder = vi.fn(() => createMockCy());
  return {
    default: Object.assign(mockCyBuilder, {
      use: vi.fn(),
    }),
  };
});

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

    expect(component.coverageLabel).toBe('Mostrando 300 de 301 nodos (top por conexiones)');
    const chip = (fixture.nativeElement as HTMLElement).querySelector('.coverage-chip');
    expect(chip?.textContent?.trim()).toBe('Mostrando 300 de 301 nodos (top por conexiones)');
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
