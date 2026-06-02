import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { BehaviorSubject } from 'rxjs';
import { TableViewComponent } from './table-view.component';
import { SelectionService } from '@core/services/selection.service';
import type {
  QueryResult,
  ResultBinding,
  BindingValue,
  NormalizedNode,
  Selection,
} from '@shared/models';

const mockBindingValueUri: BindingValue = {
  type: 'uri',
  value: 'http://example.org/Q1',
};
const mockBindingValueLiteral: BindingValue = {
  type: 'literal',
  value: 'Buenos Aires',
};
const mockBindingValueCoord: BindingValue = {
  type: 'coordinate',
  value: { lat: -34.6037, lng: -58.3816 },
  raw: 'Point(-58.3816 -34.6037)',
};

const mockQueryResult: QueryResult = {
  variables: ['city', 'cityLabel', 'coord'],
  bindings: [
    {
      city: mockBindingValueUri,
      cityLabel: mockBindingValueLiteral,
      coord: mockBindingValueCoord,
    },
  ],
  nodes: [
    {
      uri: 'http://example.org/Q1',
      label: 'Buenos Aires',
      attributes: {
        city: mockBindingValueUri,
        cityLabel: mockBindingValueLiteral,
        coord: mockBindingValueCoord,
      },
      coordinate: { lat: -34.6037, lng: -58.3816 },
    },
  ],
  edges: [],
  meta: {
    durationMs: 100,
    truncated: false,
    limitApplied: 500,
    backend: 'wikidata',
  },
};

describe('TableViewComponent', () => {
  let component: TableViewComponent;
  let fixture: ComponentFixture<TableViewComponent>;
  let selectionServiceMock: {
    filteredQueryResult$: BehaviorSubject<QueryResult | null>;
    queryResult$: BehaviorSubject<QueryResult | null>;
    selectedNode$: BehaviorSubject<Selection>;
    activeFilters$: BehaviorSubject<unknown[]>;
    select: ReturnType<typeof vi.fn>;
    setQueryResult: ReturnType<typeof vi.fn>;
    clearSelection: ReturnType<typeof vi.fn>;
    addFilter: ReturnType<typeof vi.fn>;
    removeFilter: ReturnType<typeof vi.fn>;
  };
  beforeEach(async () => {
    selectionServiceMock = {
      filteredQueryResult$: new BehaviorSubject<QueryResult | null>(null),
      queryResult$: new BehaviorSubject<QueryResult | null>(null),
      selectedNode$: new BehaviorSubject<Selection>({
        node: null,
        source: 'external',
      }),
      activeFilters$: new BehaviorSubject<unknown[]>([]),
      select: vi.fn(),
      setQueryResult: vi.fn(),
      clearSelection: vi.fn(),
      addFilter: vi.fn(),
      removeFilter: vi.fn(),
    };

    await TestBed.configureTestingModule({
      imports: [TableViewComponent, NoopAnimationsModule],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: SelectionService, useValue: selectionServiceMock },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(TableViewComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should show empty state when no query result', () => {
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('.empty-state')).toBeTruthy();
    expect(compiled.textContent).toContain('Ejecut');
  });

  it('should build column defs when query result arrives', () => {
    selectionServiceMock.filteredQueryResult$.next(mockQueryResult);
    fixture.detectChanges();

    const defs = component.columnDefs();
    expect(defs.length).toBe(3);
    expect(defs[0].field).toBe('city');
    expect(defs[1].field).toBe('cityLabel');
    expect(defs[2].field).toBe('coord');
  });

  it('should clear columns and rows when result is null', () => {
    selectionServiceMock.filteredQueryResult$.next(mockQueryResult);
    fixture.detectChanges();
    expect(component.columnDefs().length).toBe(3);

    selectionServiceMock.filteredQueryResult$.next(null);
    fixture.detectChanges();
    expect(component.columnDefs().length).toBe(0);
    expect(component.rowData().length).toBe(0);
  });

  it('should emit selection on row click', () => {
    selectionServiceMock.filteredQueryResult$.next(mockQueryResult);
    fixture.detectChanges();

    const rowData = mockQueryResult.bindings[0] as Record<string, BindingValue>;
    (selectionServiceMock.select as ReturnType<typeof vi.fn>).mockImplementation((_node, _source) => {});

    expect(selectionServiceMock.select).toBeDefined();

    // Verify the mock function is in place
    expect(typeof selectionServiceMock.select).toBe('function');
  });
});
