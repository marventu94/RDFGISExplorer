import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { of } from 'rxjs';
import { SummaryPanelComponent } from './summary-panel.component';
import { ApiService } from '@core/services/api.service';
import { SelectionService } from '@core/services/selection.service';
import { SparqlQueryStateService } from '@core/services/sparql-query-state.service';
import type { BindingValue, QueryResult, QuerySummary } from '@shared/models';

const USER_QUERY = 'SELECT ?item ?price ?city WHERE { ?item ?p ?price . ?item ?c ?city }';

function num(n: number): BindingValue {
  return { type: 'literal', value: String(n), datatype: 'http://www.w3.org/2001/XMLSchema#integer' };
}

function uri(u: string): BindingValue {
  return { type: 'uri', value: u };
}

function makeResult(truncated: boolean): QueryResult {
  return {
    variables: ['item', 'price', 'city'],
    bindings: [
      { item: uri('http://x/1'), price: num(10), city: uri('http://x/la-plata') },
      { item: uri('http://x/2'), price: num(20), city: uri('http://x/berisso') },
      { item: uri('http://x/3'), price: num(30), city: uri('http://x/la-plata') },
    ],
    nodes: [],
    edges: [],
    meta: { durationMs: 100, truncated, limitApplied: 2000, backend: 'wikidata' },
  };
}

const BACKEND_SUMMARY: QuerySummary = {
  totalRows: 5000,
  numeric: [{ variable: 'price', count: 5000, min: 1, max: 999, avg: 250.5 }],
  temporal: [],
  categorical: [
    { variable: 'city', values: [{ value: 'http://x/la-plata', count: 3000 }] },
  ],
  failed: { total: false, numeric: [], temporal: [], categorical: [] },
  meta: { durationMs: 50, backend: 'wikidata' },
};

describe('SummaryPanelComponent', () => {
  let fixture: ComponentFixture<SummaryPanelComponent>;
  let component: SummaryPanelComponent;
  let selectionService: SelectionService;
  let queryState: SparqlQueryStateService;
  let fetchSummaryMock: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    fetchSummaryMock = vi.fn().mockReturnValue(of(BACKEND_SUMMARY));

    await TestBed.configureTestingModule({
      imports: [SummaryPanelComponent, NoopAnimationsModule],
      providers: [
        SelectionService,
        SparqlQueryStateService,
        { provide: ApiService, useValue: { fetchSummary: fetchSummaryMock } },
      ],
    }).compileComponents();

    selectionService = TestBed.inject(SelectionService);
    queryState = TestBed.inject(SparqlQueryStateService);
    queryState.query.set(USER_QUERY);

    fixture = TestBed.createComponent(SummaryPanelComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('renders nothing before any query result', () => {
    const panel = fixture.nativeElement.querySelector('.summary-panel');
    expect(panel).toBeNull();
  });

  it('computes the summary locally when the result is not truncated (no backend call)', () => {
    selectionService.setQueryResult(makeResult(false));
    fixture.detectChanges();

    expect(fetchSummaryMock).not.toHaveBeenCalled();
    const resolved = component['resolved']();
    expect(resolved?.source).toBe('local');
    expect(resolved?.summary.totalRows).toBe(3);
    expect(resolved?.summary.numeric).toEqual([
      { variable: 'price', count: 3, min: 10, max: 30, avg: 20 },
    ]);
  });

  it('calls the backend with the classified vars when the result is truncated', () => {
    selectionService.setQueryResult(makeResult(true));
    fixture.detectChanges();

    expect(fetchSummaryMock).toHaveBeenCalledTimes(1);
    expect(fetchSummaryMock).toHaveBeenCalledWith({
      query: USER_QUERY,
      numericVars: ['price'],
      temporalVars: [],
      // ?item también clasifica categórica: uri con pocos valores distintos.
      categoricalVars: ['item', 'city'],
    });
    const resolved = component['resolved']();
    expect(resolved?.source).toBe('backend');
    expect(resolved?.summary.totalRows).toBe(5000);
  });

  it('shows the full-result scope label', () => {
    selectionService.setQueryResult(makeResult(true));
    component['toggleCollapsed']();
    fixture.detectChanges();

    const scope = fixture.nativeElement.querySelector('.summary-scope');
    expect(scope.textContent).toContain('las 5000 filas del resultado completo');
  });

  it('does not recompute when the lot changes', () => {
    selectionService.setQueryResult(makeResult(true));
    fixture.detectChanges();
    expect(fetchSummaryMock).toHaveBeenCalledTimes(1);
    const before = component['resolved']();

    // Cambiar de lote y de tamaño de lote no emite queryResult$: no recalcula.
    selectionService.setCurrentLot(2);
    selectionService.setLotSize(100);
    selectionService.nextLot();
    fixture.detectChanges();

    expect(fetchSummaryMock).toHaveBeenCalledTimes(1);
    expect(component['resolved']()).toBe(before);
  });

  it('recomputes when a new query result arrives', () => {
    selectionService.setQueryResult(makeResult(true));
    fixture.detectChanges();
    selectionService.setQueryResult(makeResult(true));
    fixture.detectChanges();

    expect(fetchSummaryMock).toHaveBeenCalledTimes(2);
  });

  it('clears the panel when the result is cleared', () => {
    selectionService.setQueryResult(makeResult(false));
    fixture.detectChanges();
    selectionService.setQueryResult(null);
    fixture.detectChanges();

    expect(component['resolved']()).toBeNull();
    expect(fixture.nativeElement.querySelector('.summary-panel')).toBeNull();
  });
});
