import { ComponentFixture, TestBed } from '@angular/core/testing';
import { BehaviorSubject, of } from 'rxjs';
import { TimelineViewComponent } from './timeline-view.component';
import { SelectionService } from '@core/services/selection.service';
import type {
  QueryResult,
  NormalizedNode,
  Selection,
  Filter,
  TemporalFilter,
} from '@shared/models';

const nodeWithDates: NormalizedNode = {
  uri: 'http://www.wikidata.org/entity/Q7742',
  label: 'Juan Domingo Perón',
  type: 'http://www.wikidata.org/entity/Q207313',
  attributes: {},
  temporalEvents: [
    { field: 'inception', isoDate: '1946-06-04T00:00:00Z', numericValue: 100 },
    { field: 'inception', isoDate: '1952-06-04T00:00:00Z', numericValue: 150 },
  ],
};

const nodeWithOneDate: NormalizedNode = {
  uri: 'http://www.wikidata.org/entity/Q41404',
  label: 'Argentina',
  type: 'http://www.wikidata.org/entity/Q515',
  attributes: {},
  temporalEvents: [
    { field: 'inception', isoDate: '1816-07-09T00:00:00Z' },
  ],
};

const nodeWithoutDates: NormalizedNode = {
  uri: 'http://www.wikidata.org/entity/Q155',
  label: 'Brasil',
  type: 'http://www.wikidata.org/entity/Q515',
  attributes: {},
  temporalEvents: [],
};

const nodeWithPriceHistory: NormalizedNode = {
  uri: 'http://www.wikidata.org/entity/Q123',
  label: 'Propiedad Ejemplo',
  type: 'http://www.wikidata.org/entity/Q33506',
  attributes: {},
  temporalEvents: [
    { field: 'price', isoDate: '2020-01-01T00:00:00Z', numericValue: 50000 },
    { field: 'price', isoDate: '2021-01-01T00:00:00Z', numericValue: 55000 },
    { field: 'price', isoDate: '2022-01-01T00:00:00Z', numericValue: 60000 },
    { field: 'price', isoDate: '2023-01-01T00:00:00Z', numericValue: 65000 },
  ],
};

function createMockQueryResult(nodes: NormalizedNode[]): QueryResult {
  return {
    variables: ['item', 'itemLabel'],
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

function createMockTimeline() {
  const onCallbacks: Map<string, (...args: unknown[]) => void> = new Map();

  return {
    on: vi.fn((event: string, cb: (...args: unknown[]) => void) => {
      onCallbacks.set(event, cb);
    }),
    setItems: vi.fn(),
    setGroups: vi.fn(),
    setSelection: vi.fn(),
    moveTo: vi.fn(),
    redraw: vi.fn(),
    destroy: vi.fn(),
    setWindow: vi.fn(),
    getWindow: vi.fn(() => ({
      start: new Date('2000-01-01'),
      end: new Date('2000-01-01'),
    })),
    simulateSelect(items: string[]): void {
      const cb = onCallbacks.get('select');
      if (cb) {
        cb({ items });
      }
    },
    simulateRangeChanged(start: Date, end: Date, byUser: boolean): void {
      const cb = onCallbacks.get('rangechanged');
      if (cb) {
        cb({ start, end, byUser });
      }
    },
  };
}

let mockTimelineInstance: ReturnType<typeof createMockTimeline>;

vi.mock('chart.js/auto', () => {
  const ChartMock = Object.assign(
    vi.fn(function () {
      return { destroy: vi.fn() };
    }),
    { register: vi.fn() },
  );
  return {
    Chart: ChartMock,
    registerables: [],
  };
});

vi.mock('vis-timeline/standalone', () => ({
  Timeline: vi.fn(function (
    _container: HTMLElement,
    _items: unknown,
    _groups: unknown,
    _options: unknown,
  ) {
    mockTimelineInstance = createMockTimeline();
    return mockTimelineInstance;
  }),
}));

vi.mock('vis-data', () => ({
  DataSet: vi.fn(function (initial?: unknown[]) {
    const data = initial ? [...initial] : [];
    return {
      add: vi.fn((item: unknown) => {
        data.push(item);
      }),
      clear: vi.fn(() => {
        data.length = 0;
      }),
      remove: vi.fn(),
      update: vi.fn(),
      get: vi.fn((_options?: unknown) => data),
      forEach: vi.fn((cb: (item: unknown) => void) => data.forEach(cb)),
      get length() {
        return data.length;
      },
    };
  }),
}));

const resizeObserverCallbacks = new Map<Element, () => void>();

vi.stubGlobal('ResizeObserver', vi.fn(function (callback: () => void) {
  return {
    observe: vi.fn((el: Element) => {
      resizeObserverCallbacks.set(el, callback);
    }),
    disconnect: vi.fn(() => resizeObserverCallbacks.clear()),
    unobserve: vi.fn(),
  };
}));

describe('TimelineViewComponent', () => {
  let fixture: ComponentFixture<TimelineViewComponent>;
  let component: TimelineViewComponent;
  let queryResultSubject: BehaviorSubject<QueryResult | null>;
  let filteredQueryResultSubject: BehaviorSubject<QueryResult | null>;
  let activeFiltersSubject: BehaviorSubject<Filter[]>;
  let selectedNodeSubject: BehaviorSubject<Selection>;

  beforeEach(async () => {
    mockTimelineInstance = createMockTimeline();
    resizeObserverCallbacks.clear();

    queryResultSubject = new BehaviorSubject<QueryResult | null>(null);
    filteredQueryResultSubject = new BehaviorSubject<QueryResult | null>(null);
    activeFiltersSubject = new BehaviorSubject<Filter[]>([]);
    selectedNodeSubject = new BehaviorSubject<Selection>({
      node: null,
      source: 'external',
    });

    const focusSubject = new BehaviorSubject<{ uris: Set<string>; source: string | null }>({
      uris: new Set(),
      source: null,
    });
    const activeViewSubject = new BehaviorSubject<string | null>(null);

    const mockSelectionService = {
      queryResult$: queryResultSubject.asObservable(),
      filteredQueryResult$: filteredQueryResultSubject.asObservable(),
      activeFilters$: activeFiltersSubject.asObservable(),
      selectedNode$: selectedNodeSubject.asObservable(),
      focus$: focusSubject.asObservable(),
      activeView$: activeViewSubject.asObservable(),
      coordinatedViewEnabled$: of(true),
      select: vi.fn(),
      clearSelection: vi.fn(),
      addFilter: vi.fn(),
      removeFilter: vi.fn(),
      setFocus: vi.fn(),
      markActiveView: vi.fn(),
      getActiveView: vi.fn(() => null),
    };

    await TestBed.configureTestingModule({
      imports: [TimelineViewComponent],
      providers: [
        { provide: SelectionService, useValue: mockSelectionService },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(TimelineViewComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create the component', () => {
    expect(component).toBeTruthy();
  });

  describe('empty states', () => {
    it('should show no-query state initially', () => {
      expect(component.queryState).toBe('no-query');
    });

    it('should show no-query text in the DOM', () => {
      const el = fixture.nativeElement as HTMLElement;
      expect(el.querySelector('.empty-state__text')?.textContent).toContain(
        'Ejecutá una query con fechas',
      );
    });

    it('should detect no-dates state when nodes exist but have no temporalEvents', () => {
      const result = createMockQueryResult([nodeWithoutDates]);
      queryResultSubject.next(result);
      filteredQueryResultSubject.next(result);
      fixture.detectChanges();

      expect(component.queryState).toBe('no-dates');
    });

    it('should show no-dates banner in the DOM', () => {
      const result = createMockQueryResult([nodeWithoutDates]);
      queryResultSubject.next(result);
      filteredQueryResultSubject.next(result);
      fixture.detectChanges();

      const el = fixture.nativeElement as HTMLElement;
      expect(el.querySelector('.banner--info')?.textContent).toContain(
        'Esta query no devolvió fechas',
      );
    });

    it('should show link to variable mapping in no-dates banner', () => {
      const result = createMockQueryResult([nodeWithoutDates]);
      queryResultSubject.next(result);
      filteredQueryResultSubject.next(result);
      fixture.detectChanges();

      const el = fixture.nativeElement as HTMLElement;
      const linkBtn = el.querySelector('.link-btn');
      expect(linkBtn).toBeTruthy();
      expect(linkBtn?.textContent).toContain('Mapeo de Variables');
    });

    it('should detect filtered-zero state when filters remove all nodes', () => {
      const resultWithNodes = createMockQueryResult([nodeWithDates]);
      queryResultSubject.next(resultWithNodes);
      filteredQueryResultSubject.next(createMockQueryResult([]));
      activeFiltersSubject.next([
        {
          id: 'timeline-range',
          kind: 'temporal',
          from: '2000-01-01T00:00:00Z',
          to: '2001-01-01T00:00:00Z',
          label: '2000 – 2001',
        } as TemporalFilter,
      ]);
      fixture.detectChanges();

      expect(component.queryState).toBe('filtered-zero');
    });

    it('should show filtered-zero chip text', () => {
      const resultWithNodes = createMockQueryResult([nodeWithDates, nodeWithOneDate]);
      queryResultSubject.next(resultWithNodes);
      filteredQueryResultSubject.next(createMockQueryResult([]));
      activeFiltersSubject.next([
        {
          id: 'timeline-range',
          kind: 'temporal',
          from: '2000-01-01T00:00:00Z',
          to: '2001-01-01T00:00:00Z',
          label: '2000 – 2001',
        } as TemporalFilter,
      ]);
      fixture.detectChanges();

      const el = fixture.nativeElement as HTMLElement;
      expect(el.querySelector('.empty-state__text')?.textContent).toContain(
        '0 de 2 eventos en el rango activo',
      );
    });
  });

  describe('normal state rendering', () => {
    it('should transition to normal state when nodes have dates', () => {
      const result = createMockQueryResult([nodeWithDates, nodeWithOneDate]);
      queryResultSubject.next(result);
      filteredQueryResultSubject.next(result);
      fixture.detectChanges();

      expect(component.queryState).toBe('normal');
      expect(mockTimelineInstance.setItems).toHaveBeenCalled();
      expect(mockTimelineInstance.setGroups).toHaveBeenCalled();
    });

    it('should show toolbar in normal state', () => {
      const result = createMockQueryResult([nodeWithDates]);
      queryResultSubject.next(result);
      filteredQueryResultSubject.next(result);
      fixture.detectChanges();

      const el = fixture.nativeElement as HTMLElement;
      expect(el.querySelector('.toolbar')).toBeTruthy();
      expect(el.querySelector('.toolbar-btn--apply')).toBeTruthy();
      expect(el.querySelector('.zoom-group')).toBeTruthy();
    });

    it('should show price chart area in normal state', () => {
      const result = createMockQueryResult([nodeWithDates]);
      queryResultSubject.next(result);
      filteredQueryResultSubject.next(result);
      fixture.detectChanges();

      const el = fixture.nativeElement as HTMLElement;
      expect(el.querySelector('.price-chart-area')).toBeTruthy();
    });

    it('should have apply range button disabled initially', () => {
      const result = createMockQueryResult([nodeWithDates]);
      queryResultSubject.next(result);
      filteredQueryResultSubject.next(result);
      fixture.detectChanges();

      const btn = (fixture.nativeElement as HTMLElement).querySelector(
        '.toolbar-btn--apply',
      ) as HTMLButtonElement;
      expect(btn.disabled).toBe(true);
    });

    it('should enable apply range after rangechanged event', () => {
      const result = createMockQueryResult([nodeWithDates]);
      queryResultSubject.next(result);
      filteredQueryResultSubject.next(result);
      fixture.detectChanges();

      mockTimelineInstance.simulateRangeChanged(
        new Date('1900-01-01'),
        new Date('1950-01-01'),
        true,
      );

      expect(component.canApplyRange).toBe(true);
    });

    it('should ignore rangechanged events not triggered by user', () => {
      const result = createMockQueryResult([nodeWithDates]);
      queryResultSubject.next(result);
      filteredQueryResultSubject.next(result);
      fixture.detectChanges();

      mockTimelineInstance.simulateRangeChanged(
        new Date('1900-01-01'),
        new Date('1950-01-01'),
        false,
      );

      expect(component.canApplyRange).toBe(false);
    });
  });

  describe('selection interaction', () => {
    it('should select node when timeline item is clicked', () => {
      const result = createMockQueryResult([nodeWithDates]);
      queryResultSubject.next(result);
      filteredQueryResultSubject.next(result);
      fixture.detectChanges();

      const selectionService = TestBed.inject(SelectionService);
      mockTimelineInstance.simulateSelect([nodeWithDates.uri]);

      expect(selectionService.select).toHaveBeenCalledWith(
        nodeWithDates,
        'timeline',
      );
    });

    it('should not select when clicked with empty items', () => {
      const result = createMockQueryResult([nodeWithDates]);
      queryResultSubject.next(result);
      filteredQueryResultSubject.next(result);
      fixture.detectChanges();

      const selectionService = TestBed.inject(SelectionService);
      mockTimelineInstance.simulateSelect([]);

      expect(selectionService.select).not.toHaveBeenCalled();
    });

    it('should ignore external selection with source timeline', () => {
      selectedNodeSubject.next({
        node: nodeWithOneDate,
        source: 'timeline',
      });
      fixture.detectChanges();

      expect(mockTimelineInstance.setSelection).not.toHaveBeenCalled();
      expect(mockTimelineInstance.moveTo).not.toHaveBeenCalled();
    });

    it('should scroll to node on external selection with dates', () => {
      const result = createMockQueryResult([nodeWithDates, nodeWithOneDate]);
      queryResultSubject.next(result);
      filteredQueryResultSubject.next(result);
      fixture.detectChanges();

      mockTimelineInstance.setSelection.mockClear();
      mockTimelineInstance.moveTo.mockClear();

      selectedNodeSubject.next({
        node: nodeWithOneDate,
        source: 'table',
      });
      fixture.detectChanges();

      expect(mockTimelineInstance.setSelection).toHaveBeenCalledWith([
        nodeWithOneDate.uri,
      ]);
      expect(mockTimelineInstance.moveTo).toHaveBeenCalledWith(
        new Date('1816-07-09T00:00:00Z'),
        {
          animation: { duration: 600, easingFunction: 'easeInOutQuad' },
        },
      );
    });

    it('should update selectedNode when internal selection happens', () => {
      const result = createMockQueryResult([nodeWithDates]);
      queryResultSubject.next(result);
      filteredQueryResultSubject.next(result);
      fixture.detectChanges();

      expect(component.selectedNode).toBeNull();

      mockTimelineInstance.simulateSelect([nodeWithDates.uri]);
      expect(component.selectedNode).toBe(nodeWithDates);
    });
  });

  describe('temporal filter', () => {
    it('should emit temporal filter when applyRange is called', () => {
      const result = createMockQueryResult([nodeWithDates]);
      queryResultSubject.next(result);
      filteredQueryResultSubject.next(result);
      fixture.detectChanges();

      mockTimelineInstance.simulateRangeChanged(
        new Date('1900-05-15T00:00:00Z'),
        new Date('1950-12-25T00:00:00Z'),
        true,
      );

      const selectionService = TestBed.inject(SelectionService);
      component.applyRange();

      expect(selectionService.addFilter).toHaveBeenCalled();
      const filterArg = (selectionService.addFilter as ReturnType<typeof vi.fn>).mock
        .calls[0][0] as TemporalFilter;
      expect(filterArg.kind).toBe('temporal');
      expect(filterArg.id).toBe('timeline-range');
      expect(filterArg.from).toContain('1900-05-15');
      expect(filterArg.to).toContain('1950-12-25');

      expect(component.canApplyRange).toBe(false);
    });

    it('should not emit filter when no pending range', () => {
      const selectionService = TestBed.inject(SelectionService);
      component.applyRange();
      expect(selectionService.addFilter).not.toHaveBeenCalled();
    });
  });

  describe('zoom controls', () => {
    it('should have zoom toolbar buttons in normal state', () => {
      const result = createMockQueryResult([nodeWithDates]);
      queryResultSubject.next(result);
      filteredQueryResultSubject.next(result);
      fixture.detectChanges();

      const el = fixture.nativeElement as HTMLElement;
      const zoomBtns = el.querySelectorAll('.zoom-group .toolbar-btn');
      expect(zoomBtns.length).toBe(6);
      expect(zoomBtns[0].textContent?.trim()).toBe('10 años');
      expect(zoomBtns[1].textContent?.trim()).toBe('5 años');
      expect(zoomBtns[2].textContent?.trim()).toBe('Año');
      expect(zoomBtns[3].textContent?.trim()).toBe('Mes');
      expect(zoomBtns[4].textContent?.trim()).toBe('Semana');
      expect(zoomBtns[5].textContent?.trim()).toBe('Día');
    });

    it('should set window to year range', () => {
      const result = createMockQueryResult([nodeWithDates]);
      queryResultSubject.next(result);
      filteredQueryResultSubject.next(result);
      fixture.detectChanges();

      // Access protected method via bracket access
      (component as unknown as Record<'zoomTo', (level: unknown) => void>).zoomTo(0);
      expect(mockTimelineInstance.setWindow).toHaveBeenCalled();
    });

    it('should not call setWindow when timeline is undefined', () => {
      (component as unknown as Record<string, unknown>)['timeline'] = undefined;
      expect(() =>
        (component as unknown as Record<'zoomTo', (level: unknown) => void>).zoomTo(0),
      ).not.toThrow();
    });
  });

  describe('resize', () => {
    it('should call redraw on window resize', () => {
      const result = createMockQueryResult([nodeWithDates]);
      queryResultSubject.next(result);
      filteredQueryResultSubject.next(result);
      fixture.detectChanges();

      mockTimelineInstance.redraw.mockClear();
      window.dispatchEvent(new Event('resize'));

      expect(mockTimelineInstance.redraw).toHaveBeenCalled();
    });

    it('should not throw when redraw called without timeline', () => {
      (component as unknown as Record<string, unknown>)['timeline'] = undefined;
      expect(() => component.onResize()).not.toThrow();
    });
  });

  describe('cleanup', () => {
    it('should destroy timeline on component destroy', () => {
      const result = createMockQueryResult([nodeWithDates]);
      queryResultSubject.next(result);
      filteredQueryResultSubject.next(result);
      fixture.detectChanges();

      component.ngOnDestroy();
      expect(mockTimelineInstance.destroy).toHaveBeenCalled();
    });

    it('should not throw on destroy without timeline', () => {
      (component as unknown as Record<string, unknown>)['timeline'] = undefined;
      expect(() => component.ngOnDestroy()).not.toThrow();
    });

    it('should disconnect resize observer on destroy', () => {
      component.ngOnDestroy();
      expect(resizeObserverCallbacks.size).toBe(0);
    });
  });

  describe('variable mapping event', () => {
    it('should dispatch custom event when openVariableMapping is called', () => {
      const dispatchSpy = vi.spyOn(window, 'dispatchEvent');
      component.openVariableMapping();

      expect(dispatchSpy).toHaveBeenCalled();
      const event = dispatchSpy.mock.calls[0][0] as CustomEvent;
      expect(event.type).toBe('open-variable-mapping');
    });
  });

  describe('price chart selection sync', () => {
    it('should pass selectedNode to price-chart when external selection arrives', () => {
      const result = createMockQueryResult([nodeWithPriceHistory, nodeWithOneDate]);
      queryResultSubject.next(result);
      filteredQueryResultSubject.next(result);
      fixture.detectChanges();

      selectedNodeSubject.next({
        node: nodeWithPriceHistory,
        source: 'table',
      });
      fixture.detectChanges();

      expect(component.selectedNode).toBe(nodeWithPriceHistory);
    });
  });

  describe('data reactivity', () => {
    it('should transition from no-dates to normal when dates become available', () => {
      const resultNoDates = createMockQueryResult([nodeWithoutDates]);
      queryResultSubject.next(resultNoDates);
      filteredQueryResultSubject.next(resultNoDates);
      fixture.detectChanges();
      expect(component.queryState).toBe('no-dates');

      const resultWithDates = createMockQueryResult([nodeWithDates]);
      queryResultSubject.next(resultWithDates);
      filteredQueryResultSubject.next(resultWithDates);
      fixture.detectChanges();
      expect(component.queryState).toBe('normal');
    });

    it('should transition back to no-query when result becomes null', () => {
      const result = createMockQueryResult([nodeWithDates]);
      queryResultSubject.next(result);
      filteredQueryResultSubject.next(result);
      fixture.detectChanges();
      expect(component.queryState).toBe('normal');

      queryResultSubject.next(null);
      filteredQueryResultSubject.next(null);
      fixture.detectChanges();
      expect(component.queryState).toBe('no-query');
    });
  });
});
