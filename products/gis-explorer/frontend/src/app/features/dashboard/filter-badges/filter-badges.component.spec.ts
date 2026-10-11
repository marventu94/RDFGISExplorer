import { TestBed } from '@angular/core/testing';
import { BehaviorSubject } from 'rxjs';
import { setLanguage } from '@rdfgis/platform-bridge';
import type { QueryResult } from '@rdfgis/contracts';

import { FilterBadgesComponent } from './filter-badges.component';
import { SelectionService, type LotState } from '@core/services/selection.service';
import type { Filter } from '@shared/models/filter.model';

describe('FilterBadgesComponent', () => {
  const range: Filter = { id: 'range', kind: 'temporal', from: '2024-01-01', to: '2024-12-31', label: '2024' };
  let filters$: BehaviorSubject<Filter[]>;
  let result$: BehaviorSubject<QueryResult | null>;
  let lot$: BehaviorSubject<LotState>;

  function result(rows: number, truncated: boolean): QueryResult {
    return {
      variables: ['x'],
      bindings: Array.from({ length: rows }, (_, i) => ({ x: { type: 'uri', value: `urn:${i}` } })),
      nodes: [],
      edges: [],
      meta: { durationMs: 1, truncated, limitApplied: rows, backend: 'test' },
    } as unknown as QueryResult;
  }

  function render(): HTMLElement {
    const fixture = TestBed.createComponent(FilterBadgesComponent);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  beforeEach(() => {
    localStorage.clear();
    setLanguage('en');
    filters$ = new BehaviorSubject<Filter[]>([]);
    result$ = new BehaviorSubject<QueryResult | null>(result(1000, false));
    lot$ = new BehaviorSubject<LotState>({ lotSize: 300, currentLot: 1, lotCount: 4, totalRows: 1000, visibleNodes: 0 });
    TestBed.configureTestingModule({
      imports: [FilterBadgesComponent],
      providers: [{
        provide: SelectionService,
        useValue: {
          activeFilters$: filters$.asObservable(),
          queryResult$: result$.asObservable(),
          lotState$: lot$.asObservable(),
          removeFilter: vi.fn(),
        },
      }],
    });
  });

  afterEach(() => localStorage.clear());

  it('shows no scope while there are no active filters', () => {
    expect(render().querySelector('.filter-scope')).toBeNull();
  });

  it('says the filter covered every retrieved row, not only the visible batch', () => {
    filters$.next([range]);
    lot$.next({ lotSize: 300, currentLot: 1, lotCount: 1, totalRows: 87, visibleNodes: 40 });
    const scope = render().querySelector('.filter-scope') as HTMLElement;

    expect(scope.textContent?.trim()).toBe('87 of 1,000 retrieved rows match the filter');
    expect(scope.title).toBe('The filter applies to every retrieved row (all batches), not only the visible batch.');
    expect(scope.classList).not.toContain('filter-scope--partial');
  });

  it('warns that rows the endpoint did not return are not evaluated', () => {
    filters$.next([range]);
    result$.next(result(1000, true));
    lot$.next({ lotSize: 300, currentLot: 1, lotCount: 1, totalRows: 1, visibleNodes: 1 });
    const scope = render().querySelector('.filter-scope') as HTMLElement;

    expect(scope.textContent?.trim()).toBe('1 of 1,000 retrieved rows matches the filter · partial result');
    expect(scope.title).toContain('rows that were not retrieved are not evaluated');
    expect(scope.classList).toContain('filter-scope--partial');
  });
});
