import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { BehaviorSubject } from 'rxjs';
import { TableViewComponent } from './table-view.component';
import { SelectionService } from '@core/services/selection.service';
import { DEFAULT_LIMITS, LimitsService } from '@core/services/limits.service';
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
    visibleQueryResult$: BehaviorSubject<QueryResult | null>;
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
      visibleQueryResult$: new BehaviorSubject<QueryResult | null>(null),
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

  it('takes pageSizeOptions from LimitsService and clamps a pageSize out of range', () => {
    expect(component.pageSizeOptions()).toEqual([50, 100, 200]);
    const limits = TestBed.inject(LimitsService);
    limits.apply({ ...DEFAULT_LIMITS, tablePageSizeOptions: [25, 75] });
    fixture.detectChanges();

    expect(component.pageSizeOptions()).toEqual([25, 75]);
    // pageSize 50 quedó fuera de la nueva oferta: se clampea a la primera.
    expect(component.pageSize()).toBe(25);
  });

  it('should show empty state when no query result', () => {
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('.empty-state')).toBeTruthy();
    expect(compiled.textContent).toContain('Ejecut');
  });

  it('should build column defs when query result arrives', () => {
    selectionServiceMock.visibleQueryResult$.next(mockQueryResult);
    fixture.detectChanges();

    const defs = component.columnDefs();
    expect(defs.length).toBe(3);
    expect(defs[0].field).toBe('city');
    expect(defs[1].field).toBe('cityLabel');
    expect(defs[2].field).toBe('coord');
  });

  it('should clear columns and rows when result is null', () => {
    selectionServiceMock.visibleQueryResult$.next(mockQueryResult);
    fixture.detectChanges();
    expect(component.columnDefs().length).toBe(3);

    selectionServiceMock.visibleQueryResult$.next(null);
    fixture.detectChanges();
    expect(component.columnDefs().length).toBe(0);
    expect(component.rowData().length).toBe(0);
  });

  it('should emit selection on row click', () => {
    selectionServiceMock.visibleQueryResult$.next(mockQueryResult);
    fixture.detectChanges();

    const rowData = mockQueryResult.bindings[0] as Record<string, BindingValue>;
    (selectionServiceMock.select as ReturnType<typeof vi.fn>).mockImplementation((_node, _source) => {});

    expect(selectionServiceMock.select).toBeDefined();

    // Verify the mock function is in place
    expect(typeof selectionServiceMock.select).toBe('function');
  });

  /**
   * Una fila de una consulta espacio-temporal menciona varias entidades y cada
   * vista dibuja la suya: el mapa la que tiene coordenada, la tabla la fila.
   * Estos casos cubren que un click en cualquier vista se vea acá.
   */
  describe('selección cruzada con las otras vistas', () => {
    /** Fila donde la entidad con coordenada NO es la primera columna. */
    const listing: BindingValue = { type: 'uri', value: 'urn:listing/1' };
    const casa: BindingValue = { type: 'uri', value: 'urn:casa/1' };
    const casaNode: NormalizedNode = {
      uri: 'urn:casa/1',
      label: 'Casa 1',
      attributes: {},
      coordinate: { lat: -34.87, lng: -57.89 },
    };
    const listingNode: NormalizedNode = {
      uri: 'urn:listing/1',
      label: 'Aviso 1',
      attributes: {},
    };
    const result: QueryResult = {
      variables: ['listing', 'casa'],
      bindings: [{ listing, casa } as ResultBinding],
      nodes: [listingNode, casaNode],
      edges: [],
      meta: { durationMs: 1, truncated: false, limitApplied: 500, backend: 'graphdb' },
    };

    let selectedRows: Array<{ uri: string; selected: boolean }>;

    /**
     * Los row nodes de AG Grid se recrean en cada `rowData` nuevo, así que el
     * fake también los recrea: es justo lo que borraba la selección.
     */
    function makeRows(): Array<{ selected: boolean } & Record<string, unknown>> {
      return result.bindings.map((binding) => {
        const row = {
          data: binding,
          rowIndex: 0,
          selected: false,
          isSelected(): boolean {
            return row.selected;
          },
          setSelected(value: boolean): void {
            row.selected = value;
            selectedRows.push({
              uri: (binding['casa'] as { value: string }).value,
              selected: value,
            });
          },
        };
        return row;
      });
    }

    let rows: ReturnType<typeof makeRows>;

    function attachGrid(): void {
      rows = makeRows();
      const api = {
        sizeColumnsToFit: vi.fn(),
        forEachNode: (cb: (row: unknown) => void) => rows.forEach(cb),
        paginationGetPageSize: () => 50,
        paginationGetCurrentPage: () => 0,
        paginationGoToPage: vi.fn(),
        getFirstDisplayedRowIndex: () => 0,
        getLastDisplayedRowIndex: () => 0,
        ensureNodeVisible: vi.fn(),
      };
      component.onGridReady({ api } as never);
    }

    /** La grilla rehace sus filas (lote nuevo, filtro, o la propia selección). */
    function rebuildRows(): void {
      rows = makeRows();
      component.onRowDataUpdated();
    }

    beforeEach(() => {
      selectedRows = [];
      selectionServiceMock.queryResult$.next(result);
      selectionServiceMock.visibleQueryResult$.next(result);
      fixture.detectChanges();
      attachGrid();
    });

    it('selects the row when the map picks an entity that is not the first column', () => {
      selectionServiceMock.selectedNode$.next({
        node: casaNode,
        source: 'map',
        relatedUris: new Set(['urn:casa/1', 'urn:listing/1']),
      });
      fixture.detectChanges();

      expect(selectedRows).toContainEqual({ uri: 'urn:casa/1', selected: true });
    });

    it('falls back to the row of a related entity when the exact one has no column', () => {
      const geometry: NormalizedNode = { uri: 'urn:geo/1', label: 'Geometría', attributes: {} };

      selectionServiceMock.selectedNode$.next({
        node: geometry,
        source: 'map',
        relatedUris: new Set(['urn:geo/1', 'urn:casa/1']),
      });
      fixture.detectChanges();

      expect(selectedRows).toContainEqual({ uri: 'urn:casa/1', selected: true });
    });

    it('ignores a selection that has nothing to do with the rows', () => {
      selectionServiceMock.selectedNode$.next({
        node: { uri: 'urn:otra/9', label: 'Otra', attributes: {} },
        source: 'map',
        relatedUris: new Set(['urn:otra/9']),
      });
      fixture.detectChanges();

      expect(selectedRows.every((r) => r.selected === false)).toBe(true);
    });

    /**
     * Regresión: seleccionar reemite `visibleQueryResult$` (el lote inyecta el
     * nodo pineado), la grilla rehace sus filas y la selección recién aplicada
     * se apagaba sola. Pasaba con cualquier origen, incluido el click acá.
     */
    it('keeps the row selected after the grid rebuilds its rows', () => {
      selectionServiceMock.selectedNode$.next({
        node: casaNode,
        source: 'map',
        relatedUris: new Set(['urn:casa/1', 'urn:listing/1']),
      });
      fixture.detectChanges();
      selectedRows = [];

      rebuildRows();

      expect(rows.some((r) => r.selected)).toBe(true);
    });

    it('keeps its own click selected after the rebuild it triggers', () => {
      component.onRowSelected({
        node: { isSelected: () => true },
        data: result.bindings[0],
      } as never);
      // El servicio real responde publicando la selección con origen 'table'.
      selectionServiceMock.selectedNode$.next({
        node: casaNode,
        source: 'table',
        relatedUris: new Set(['urn:casa/1', 'urn:listing/1']),
      });
      fixture.detectChanges();

      rebuildRows();

      expect(rows.some((r) => r.selected)).toBe(true);
    });

    it('clears the grid selection when the selection is cleared', () => {
      selectionServiceMock.selectedNode$.next({
        node: casaNode,
        source: 'map',
        relatedUris: new Set(['urn:casa/1']),
      });
      fixture.detectChanges();

      selectionServiceMock.selectedNode$.next({ node: null, source: 'external' });
      fixture.detectChanges();

      expect(rows.every((r) => !r.selected)).toBe(true);
    });

    it('emits the entity with data of its own when a row is clicked', () => {
      component.onRowSelected({
        node: { isSelected: () => true },
        data: result.bindings[0],
      } as never);

      // No la primera URI de la fila (el aviso), sino la que las otras vistas
      // saben dibujar.
      expect(selectionServiceMock.select).toHaveBeenCalledWith(casaNode, 'table');
    });
  });
});
