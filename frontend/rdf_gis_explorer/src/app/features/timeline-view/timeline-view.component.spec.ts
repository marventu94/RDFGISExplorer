import { ComponentFixture, TestBed } from '@angular/core/testing';
import { BehaviorSubject, of } from 'rxjs';
import { TimelineViewComponent } from './timeline-view.component';
import { SelectionService, type LotState } from '@core/services/selection.service';
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
  attributes: { capitalLabel: { type: 'literal', value: 'Brasilia' } },
  temporalEvents: [],
};

/** Magnitudes numéricas mezcladas con literales de texto, como las devuelve una query real. */
const nodeWithNumericAttrs: NormalizedNode = {
  uri: 'http://www.wikidata.org/entity/Q123',
  label: 'Depósito Norte',
  type: 'superficie_lote',
  attributes: {
    metrosCuadrados: { type: 'literal', value: '1250' },
    precio: { type: 'literal', value: '340000.5' },
    barrio: { type: 'literal', value: 'Villa Crespo' },
  },
  temporalEvents: [
    { field: 'fechaMedicion', isoDate: '2024-03-14T00:00:00Z' },
    { field: 'fechaMedicion', isoDate: '2023-01-10T00:00:00Z' },
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

// vi.hoisted: las factories de vi.mock se hoistean y no ven el scope del módulo;
// el holder expone la factory y la instancia actual para factory y tests.
const timelineMock = vi.hoisted(() => {
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

  return {
    createMockTimeline,
    instance: undefined as unknown as ReturnType<typeof createMockTimeline>,
    options: undefined as Record<string, unknown> | undefined,
    items: undefined as unknown,
    groups: undefined as unknown,
  };
});

vi.mock('vis-timeline/standalone', () => ({
  Timeline: vi.fn(function (
    _container: HTMLElement,
    items: unknown,
    groups: unknown,
    options: Record<string, unknown>,
  ) {
    timelineMock.instance = timelineMock.createMockTimeline();
    timelineMock.options = options;
    timelineMock.items = items;
    timelineMock.groups = groups;
    return timelineMock.instance;
  }),
}));

vi.mock('vis-data', () => ({
  DataSet: vi.fn(function (initial?: unknown[]) {
    const data = initial ? [...initial] : [];
    return {
      // El DataSet real acepta un item o un array; los grupos se agregan en lote.
      add: vi.fn((item: unknown) => {
        if (Array.isArray(item)) {
          data.push(...item);
        } else {
          data.push(item);
        }
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
  let lotStateSubject: BehaviorSubject<LotState>;

  beforeEach(async () => {
    timelineMock.instance = timelineMock.createMockTimeline();
    resizeObserverCallbacks.clear();

    queryResultSubject = new BehaviorSubject<QueryResult | null>(null);
    filteredQueryResultSubject = new BehaviorSubject<QueryResult | null>(null);
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
      visibleQueryResult$: filteredQueryResultSubject.asObservable(),
      activeFilters$: activeFiltersSubject.asObservable(),
      selectedNode$: selectedNodeSubject.asObservable(),
      lotState$: lotStateSubject.asObservable(),
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

    it('should show the lot message when the full result has dates but the visible lot does not', () => {
      queryResultSubject.next(createMockQueryResult([nodeWithDates, nodeWithoutDates]));
      filteredQueryResultSubject.next(createMockQueryResult([nodeWithoutDates]));
      lotStateSubject.next({
        lotSize: 300,
        currentLot: 2,
        lotCount: 3,
        totalRows: 900,
        visibleNodes: 1,
      });
      fixture.detectChanges();

      expect(component.queryState).toBe('no-dates-lot');
      const el = fixture.nativeElement as HTMLElement;
      expect(el.querySelector('.banner--info')?.textContent).toContain(
        'las fechas están en otro lote',
      );
    });

    it('should keep the query-level message when the full result has no dates either', () => {
      queryResultSubject.next(createMockQueryResult([nodeWithoutDates]));
      filteredQueryResultSubject.next(createMockQueryResult([nodeWithoutDates]));
      lotStateSubject.next({
        lotSize: 300,
        currentLot: 2,
        lotCount: 3,
        totalRows: 900,
        visibleNodes: 1,
      });
      fixture.detectChanges();

      expect(component.queryState).toBe('no-dates');
      const el = fixture.nativeElement as HTMLElement;
      expect(el.querySelector('.banner--info')?.textContent).toContain(
        'Esta query no devolvió fechas',
      );
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
      expect(timelineMock.instance.setItems).toHaveBeenCalled();
      expect(timelineMock.instance.setGroups).toHaveBeenCalled();
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

    it('should show coverage chip when some nodes have no dates', () => {
      const result = createMockQueryResult([nodeWithDates, nodeWithoutDates]);
      queryResultSubject.next(result);
      filteredQueryResultSubject.next(result);
      fixture.detectChanges();

      const chip = (fixture.nativeElement as HTMLElement).querySelector('.coverage-chip');
      expect(chip?.textContent?.trim()).toBe('Mostrando 1 de 2 entidades · 1 sin fecha');
    });

    it('should pluralize the coverage chip when several nodes have no dates', () => {
      const anotherWithoutDates: NormalizedNode = { ...nodeWithoutDates, uri: 'http://x/Q9', label: 'Chile' };
      const result = createMockQueryResult([nodeWithDates, nodeWithoutDates, anotherWithoutDates]);
      queryResultSubject.next(result);
      filteredQueryResultSubject.next(result);
      fixture.detectChanges();

      const chip = (fixture.nativeElement as HTMLElement).querySelector('.coverage-chip');
      expect(chip?.textContent?.trim()).toBe('Mostrando 1 de 3 entidades · 2 sin fechas');
    });

    it('should hide the coverage chip when all nodes have dates', () => {
      const result = createMockQueryResult([nodeWithDates, nodeWithOneDate]);
      queryResultSubject.next(result);
      filteredQueryResultSubject.next(result);
      fixture.detectChanges();

      expect(component.coverageLabel).toBe('');
      const el = fixture.nativeElement as HTMLElement;
      expect(el.querySelector('.coverage-chip')).toBeNull();
    });

    it('should clarify the coverage chip counts nodes of the current lot', () => {
      const result = createMockQueryResult([nodeWithDates, nodeWithoutDates]);
      queryResultSubject.next(result);
      filteredQueryResultSubject.next(result);
      lotStateSubject.next({
        lotSize: 300,
        currentLot: 3,
        lotCount: 5,
        totalRows: 1200,
        visibleNodes: 2,
      });
      fixture.detectChanges();

      const chip = (fixture.nativeElement as HTMLElement).querySelector('.coverage-chip');
      expect(chip?.textContent?.trim()).toBe('Mostrando 1 de 2 entidades del lote · 1 sin fecha');
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

      timelineMock.instance.simulateRangeChanged(
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

      timelineMock.instance.simulateRangeChanged(
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
      timelineMock.instance.simulateSelect([nodeWithDates.uri]);

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
      timelineMock.instance.simulateSelect([]);

      expect(selectionService.select).not.toHaveBeenCalled();
    });

    it('should ignore external selection with source timeline', () => {
      selectedNodeSubject.next({
        node: nodeWithOneDate,
        source: 'timeline',
      });
      fixture.detectChanges();

      expect(timelineMock.instance.setSelection).not.toHaveBeenCalled();
      expect(timelineMock.instance.moveTo).not.toHaveBeenCalled();
    });

    it('should scroll to node on external selection with dates', () => {
      const result = createMockQueryResult([nodeWithDates, nodeWithOneDate]);
      queryResultSubject.next(result);
      filteredQueryResultSubject.next(result);
      fixture.detectChanges();

      timelineMock.instance.setSelection.mockClear();
      timelineMock.instance.moveTo.mockClear();

      selectedNodeSubject.next({
        node: nodeWithOneDate,
        source: 'table',
      });
      fixture.detectChanges();

      expect(timelineMock.instance.setSelection).toHaveBeenCalledWith([
        nodeWithOneDate.uri,
      ]);
      expect(timelineMock.instance.moveTo).toHaveBeenCalledWith(
        new Date('1816-07-09T00:00:00Z'),
        {
          animation: { duration: 600, easingFunction: 'easeInOutQuad' },
        },
      );
    });

  });

  describe('temporal filter', () => {
    it('should emit temporal filter when applyRange is called', () => {
      const result = createMockQueryResult([nodeWithDates]);
      queryResultSubject.next(result);
      filteredQueryResultSubject.next(result);
      fixture.detectChanges();

      timelineMock.instance.simulateRangeChanged(
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
      expect(timelineMock.instance.setWindow).toHaveBeenCalled();
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

      timelineMock.instance.redraw.mockClear();
      window.dispatchEvent(new Event('resize'));

      expect(timelineMock.instance.redraw).toHaveBeenCalled();
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
      expect(timelineMock.instance.destroy).toHaveBeenCalled();
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

  describe('vis options', () => {
    it('should pin the timeline to the container so the date axis stays visible', () => {
      expect(timelineMock.options).toMatchObject({
        height: '100%',
        verticalScroll: true,
        horizontalScroll: false,
      });
    });

    // La rueda hace zoom solo con preferZoom Y sin zoomKey: con zoomKey presente
    // el handler del Core vuelve a scrollear en vez de dejar zoomear al Range.
    it('should make the mouse wheel zoom instead of panning horizontally', () => {
      expect(timelineMock.options?.['preferZoom']).toBe(true);
      expect(timelineMock.options).not.toHaveProperty('zoomKey');
    });

    it('should keep tooltips inside the quadrant', () => {
      expect(timelineMock.options?.['tooltip']).toEqual({
        followMouse: true,
        overflowMethod: 'flip',
      });
    });
  });

  describe('item tooltips', () => {
    function renderedItems(): Record<string, unknown>[] {
      const items = timelineMock.items as { get: () => Record<string, unknown>[] };
      return items.get();
    }

    it('should include label, formatted date and numeric attributes', () => {
      const result = createMockQueryResult([nodeWithNumericAttrs]);
      queryResultSubject.next(result);
      filteredQueryResultSubject.next(result);
      fixture.detectChanges();

      const title = renderedItems()[0]['title'] as string;
      expect(title).toContain('Depósito Norte');
      expect(title).toContain('2024');
      expect(title).toContain('Metros Cuadrados');
      expect(title).toContain('1.250');
      expect(title).toContain('Precio');
    });

    it('should report how many dates a node has, since only the most recent is drawn', () => {
      const result = createMockQueryResult([nodeWithNumericAttrs]);
      queryResultSubject.next(result);
      filteredQueryResultSubject.next(result);
      fixture.detectChanges();

      expect(renderedItems()[0]['title']).toContain('2 fechas');
    });

    it('should leave out non-numeric literals', () => {
      const result = createMockQueryResult([nodeWithNumericAttrs]);
      queryResultSubject.next(result);
      filteredQueryResultSubject.next(result);
      fixture.detectChanges();

      expect(renderedItems()[0]['title']).not.toContain('Villa Crespo');
    });

    it('should escape values coming from RDF data', () => {
      const hostile: NormalizedNode = {
        ...nodeWithNumericAttrs,
        uri: 'http://x/Q999',
        label: '<img src=x onerror="alert(1)">',
      };
      const result = createMockQueryResult([hostile]);
      queryResultSubject.next(result);
      filteredQueryResultSubject.next(result);
      fixture.detectChanges();

      const title = renderedItems()[0]['title'] as string;
      expect(title).not.toContain('<img');
      expect(title).toContain('&lt;img');
    });
  });

  describe('group labels', () => {
    function renderedGroups(): Record<string, unknown>[] {
      const groups = timelineMock.groups as { get: () => Record<string, unknown>[] };
      return groups.get();
    }

    it('should humanize a SPARQL variable name and add the count', () => {
      const result = createMockQueryResult([nodeWithNumericAttrs]);
      queryResultSubject.next(result);
      filteredQueryResultSubject.next(result);
      fixture.detectChanges();

      expect(renderedGroups()[0]['content']).toBe('Superficie lote (1)');
    });

    it('should reduce a URI type to its last segment', () => {
      // nodeWithDates y nodeWithOneDate traen URIs completas de Wikidata.
      const result = createMockQueryResult([nodeWithOneDate]);
      queryResultSubject.next(result);
      filteredQueryResultSubject.next(result);
      fixture.detectChanges();

      expect(renderedGroups()[0]['content']).toBe('Q515 (1)');
    });

    it('should count every node sharing a type', () => {
      const sibling: NormalizedNode = { ...nodeWithOneDate, uri: 'http://x/Q10', label: 'Perú' };
      const result = createMockQueryResult([nodeWithOneDate, sibling]);
      queryResultSubject.next(result);
      filteredQueryResultSubject.next(result);
      fixture.detectChanges();

      expect(renderedGroups()).toHaveLength(1);
      expect(renderedGroups()[0]['content']).toBe('Q515 (2)');
    });
  });

  describe('initial framing', () => {
    // La timeline se construye antes de suscribirse justamente por esto: los
    // BehaviorSubject emiten sincrónicamente y antes se perdía el encuadre.
    it('should frame the data when a result is already present before ngOnInit', async () => {
      const result = createMockQueryResult([nodeWithDates]);
      queryResultSubject.next(result);
      filteredQueryResultSubject.next(result);

      const freshFixture = TestBed.createComponent(TimelineViewComponent);
      freshFixture.detectChanges();

      expect(timelineMock.instance.setWindow).toHaveBeenCalled();
      freshFixture.destroy();
    });

    it('should pad the window so edge items are not flush against the border', () => {
      const result = createMockQueryResult([nodeWithOneDate]);
      queryResultSubject.next(result);
      filteredQueryResultSubject.next(result);
      fixture.detectChanges();

      const [start, end] = timelineMock.instance.setWindow.mock.calls.at(-1) as [Date, Date];
      const eventMs = new Date(nodeWithOneDate.temporalEvents![0].isoDate).getTime();
      // Una sola fecha: el span es 0, así que el piso del padding abre la ventana.
      expect(start.getTime()).toBeLessThan(eventMs);
      expect(end.getTime()).toBeGreaterThan(eventMs);
    });
  });
});
