import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { BehaviorSubject } from 'rxjs';
import { MapViewComponent } from './map-view.component';
import { SelectionService } from '@core/services/selection.service';
import type { QueryResult, NormalizedNode, Selection, Filter, Coordinate } from '@shared/models';

const mockCoord: Coordinate = { lat: -34.6, lng: -58.4 };
const mockCoord2: Coordinate = { lat: -31.4, lng: -64.2 };

const mockNode: NormalizedNode = {
  uri: 'http://www.wikidata.org/entity/Q1486',
  label: 'Buenos Aires',
  type: 'http://www.wikidata.org/entity/Q515',
  attributes: { populationLabel: { type: 'literal', value: '2890151' } },
  coordinate: mockCoord,
};

const mockNode2: NormalizedNode = {
  uri: 'http://www.wikidata.org/entity/Q442',
  label: 'Córdoba',
  type: 'http://www.wikidata.org/entity/Q515',
  attributes: {},
  coordinate: mockCoord2,
};

const mockNodeNoCoord: NormalizedNode = {
  uri: 'http://www.wikidata.org/entity/Q36180',
  label: 'Borges',
  type: 'http://www.wikidata.org/entity/Q5',
  attributes: {},
};

function createMockQueryResult(nodes: NormalizedNode[]): QueryResult {
  return {
    variables: ['city', 'cityLabel'],
    bindings: [],
    nodes,
    edges: [],
    meta: {
      durationMs: 100,
      truncated: false,
      limitApplied: 500,
      backend: 'wikidata',
    },
  };
}

vi.mock('leaflet', () => {
  const events: Record<string, Array<(...args: unknown[]) => void>> = {};

  const mockOn = vi.fn(function (this: unknown, event: string, cb: (...args: unknown[]) => void) {
    events[event] = events[event] || [];
    events[event].push(cb);
  });

  const mockMapObj = {
    on: mockOn,
    addLayer: vi.fn(),
    removeLayer: vi.fn(),
    addControl: vi.fn(),
    flyTo: vi.fn(),
    invalidateSize: vi.fn(),
    remove: vi.fn(),
  };

  const mockTileLayer = {
    addTo: vi.fn().mockReturnThis(),
  };

  const mockClusterGroup = {
    addLayer: vi.fn(),
    clearLayers: vi.fn(),
    eachLayer: vi.fn(),
    zoomToShowLayer: vi.fn((_layer: unknown, cb?: () => void) => cb?.()),
  };

  const mockFeatureGroup = {
    addLayer: vi.fn(),
    removeLayer: vi.fn(),
    getLayers: vi.fn(() => []),
    eachLayer: vi.fn(),
  };

  const mockCircleMarker = {
    bindTooltip: vi.fn().mockReturnThis(),
    on: vi.fn(),
    getLatLng: vi.fn(() => ({ lat: -34.6, lng: -58.4 })),
  };

  return {
    map: vi.fn(function () { return { ...mockMapObj }; }),
    tileLayer: vi.fn(function () { return mockTileLayer; }),
    markerClusterGroup: vi.fn(function () { return mockClusterGroup; }),
    featureGroup: vi.fn(function () { return mockFeatureGroup; }),
    circleMarker: vi.fn(function () { return mockCircleMarker; }),
    marker: vi.fn(function () { return {}; }),
    Control: {
      Draw: vi.fn(function () { return {}; }),
    },
    Draw: {
      Event: { CREATED: 'draw:created' },
    },
    divIcon: vi.fn(function () { return {}; }),
    Icon: {
      Default: {
        mergeOptions: vi.fn(),
        prototype: {},
      },
    },
  };
});

vi.mock('leaflet.markercluster', () => ({}));
vi.mock('leaflet-draw', () => ({}));

describe('MapViewComponent', () => {
  let fixture: ComponentFixture<MapViewComponent>;
  let component: MapViewComponent;
  let queryResultSubject: BehaviorSubject<QueryResult | null>;
  let filteredSubject: BehaviorSubject<QueryResult | null>;
  let activeFiltersSubject: BehaviorSubject<Filter[]>;
  let selectedNodeSubject: BehaviorSubject<Selection>;
  let selectSpy: ReturnType<typeof vi.fn>;
  let addFilterSpy: ReturnType<typeof vi.fn>;

  function createSubjects(): void {
    queryResultSubject = new BehaviorSubject<QueryResult | null>(null);
    filteredSubject = new BehaviorSubject<QueryResult | null>(null);
    activeFiltersSubject = new BehaviorSubject<Filter[]>([]);
    selectedNodeSubject = new BehaviorSubject<Selection>({
      node: null,
      source: 'external',
    });
    selectSpy = vi.fn();
    addFilterSpy = vi.fn();
  }

  async function setUpModule(): Promise<void> {
    const mockSelectionService = {
      queryResult$: queryResultSubject.asObservable(),
      filteredQueryResult$: filteredSubject.asObservable(),
      activeFilters$: activeFiltersSubject.asObservable(),
      selectedNode$: selectedNodeSubject.asObservable(),
      select: selectSpy,
      addFilter: addFilterSpy,
      removeFilter: vi.fn(),
      clearSelection: vi.fn(),
      setQueryResult: vi.fn(),
    };

    await TestBed.configureTestingModule({
      imports: [MapViewComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: SelectionService, useValue: mockSelectionService },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(MapViewComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }

  describe('basic component', () => {
    beforeEach(async () => {
      createSubjects();
      await setUpModule();
    });

    it('should create the component', () => {
      expect(component).toBeTruthy();
    });

    it('should handle resize', () => {
      expect(() => component.onResize()).not.toThrow();
    });

    it('should not throw on destroy without map', () => {
      component.ngOnDestroy();
    });
  });

  describe('with map initialized', () => {
    beforeEach(async () => {
      createSubjects();
      await setUpModule();
      component['initMap']();
    });

    describe('empty state transitions', () => {
      it('should show no-query empty state after init', () => {
        expect(component.queryState).toBe('no-query');
        const compiled = fixture.nativeElement as HTMLElement;
        expect(compiled.querySelector('.overlay-text')?.textContent).toContain(
          'Ejecutá una query para ver datos georeferenciados',
        );
      });

      it('should show no-coords state when result has nodes without coordinates', () => {
        const result = createMockQueryResult([mockNodeNoCoord]);
        queryResultSubject.next(result);
        filteredSubject.next(result);
        fixture.detectChanges();

        expect(component.queryState).toBe('no-coords');
        const compiled = fixture.nativeElement as HTMLElement;
        expect(compiled.querySelector('.overlay-text')?.textContent).toContain(
          'Esta query no devolvió coordenadas',
        );
      });

      it('should show normal state when result has nodes with coordinates', () => {
        const result = createMockQueryResult([mockNode, mockNode2]);
        queryResultSubject.next(result);
        filteredSubject.next(result);
        fixture.detectChanges();

        expect(component.queryState).toBe('normal');
      });

      it('should show filtered-zero state when filters leave no visible nodes', () => {
        const resultWithNodes = createMockQueryResult([mockNode, mockNode2]);
        queryResultSubject.next(resultWithNodes);
        filteredSubject.next(createMockQueryResult([]));
        activeFiltersSubject.next([
          {
            id: 'f1',
            kind: 'geo',
            polygon: {} as GeoJSON.Polygon,
            label: 'Test area',
          },
        ]);
        fixture.detectChanges();

        expect(component.queryState).toBe('filtered-zero');
        expect(component.activeFilterCount).toBe(1);
        const compiled = fixture.nativeElement as HTMLElement;
        expect(compiled.querySelector('.overlay-text')?.textContent).toContain(
          '0 de 2 nodos pasan los filtros activos',
        );
      });

      it('should transition back to no-query when result becomes null', () => {
        const result = createMockQueryResult([mockNode]);
        queryResultSubject.next(result);
        filteredSubject.next(result);
        fixture.detectChanges();
        expect(component.queryState).toBe('normal');

        queryResultSubject.next(null);
        filteredSubject.next(null);
        fixture.detectChanges();
        expect(component.queryState).toBe('no-query');
      });

      it('should handle empty result with nodes and no coordinates', () => {
        const emptyResult = createMockQueryResult([mockNodeNoCoord]);
        queryResultSubject.next(emptyResult);
        filteredSubject.next(emptyResult);
        fixture.detectChanges();

        expect(component.queryState).toBe('no-coords');
        expect(component.originalNodeCount).toBe(1);
      });

      it('should handle result with mixed coord/no-coord nodes', () => {
        const mixedResult = createMockQueryResult([mockNode, mockNodeNoCoord]);
        queryResultSubject.next(mixedResult);
        filteredSubject.next(mixedResult);
        fixture.detectChanges();

        expect(component.queryState).toBe('normal');
        expect(component.originalNodeCount).toBe(2);
      });
    });

    describe('map interaction', () => {
      it('should not call select before any marker click', () => {
        const result = createMockQueryResult([mockNode]);
        queryResultSubject.next(result);
        filteredSubject.next(result);
        fixture.detectChanges();

        expect(selectSpy).not.toHaveBeenCalled();
      });

      it('should not call addFilter before any draw event', () => {
        const result = createMockQueryResult([mockNode]);
        queryResultSubject.next(result);
        filteredSubject.next(result);
        fixture.detectChanges();

        expect(addFilterSpy).not.toHaveBeenCalled();
      });

      it('should clean up on destroy', () => {
        component.ngOnDestroy();
        expect(component['destroy$'].observed).toBeFalsy();
      });
    });
  });

  describe('scroll to editor', () => {
    beforeEach(async () => {
      createSubjects();
      await setUpModule();
    });

    it('should scroll to editor when scrollToEditor is called', () => {
      const div = document.createElement('div');
      div.className = 'editor-area';
      div.scrollIntoView = vi.fn();
      document.body.appendChild(div);

      try {
        component.scrollToEditor();
        expect(div.scrollIntoView).toHaveBeenCalledWith({
          behavior: 'smooth',
          block: 'center',
        });
      } finally {
        document.body.removeChild(div);
      }
    });

    it('should scroll to top when no editor area found', () => {
      const originalScrollTo = window.scrollTo;
      window.scrollTo = vi.fn();

      try {
        component.scrollToEditor();
        expect(window.scrollTo).toHaveBeenCalledWith({ top: 0, behavior: 'smooth' });
      } finally {
        window.scrollTo = originalScrollTo;
      }
    });
  });
});
