import { Component, inject, signal, computed, OnDestroy } from '@angular/core';
import { Subject, takeUntil } from 'rxjs';
import { filter } from 'rxjs/operators';
import { AgGridAngular } from 'ag-grid-angular';
import type {
  ColDef,
  GridApi,
  GridReadyEvent,
  IRowNode,
  ITooltipParams,
  RowSelectedEvent,
  RowSelectionOptions,
  ICellRendererParams,
} from 'ag-grid-community';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatSnackBarModule } from '@angular/material/snack-bar';
import { MatSelectModule } from '@angular/material/select';
import { FormsModule } from '@angular/forms';

import { SelectionService } from '@core/services/selection.service';
import { DashboardViewStateService } from '@core/services/dashboard-view-state.service';
import type {
  QueryResult,
  ResultBinding,
  BindingValue,
  NormalizedNode,
  Selection,
  TemporalEvent,
} from '@shared/models';
import { UriCellRendererComponent } from './cell-renderers/uri-cell-renderer.component';
import { CoordCellRendererComponent } from './cell-renderers/coord-cell-renderer.component';
import { PluginCellRendererComponent } from './cell-renderers/plugin-cell-renderer.component';

@Component({
  selector: 'app-table-view',
  standalone: true,
  imports: [
    AgGridAngular,
    MatIconModule,
    MatButtonModule,
    MatSnackBarModule,
    MatSelectModule,
    FormsModule,
  ],
  templateUrl: './table-view.component.html',
  styleUrl: './table-view.component.scss',
})
export class TableViewComponent implements OnDestroy {
  private readonly selectionService = inject(SelectionService);
  private readonly viewState = inject(DashboardViewStateService);
  private readonly destroy$ = new Subject<void>();

  readonly agThemeClass = 'ag-theme-alpine';

  private gridApi: GridApi | null = null;
  private isInternalSelection = false;
  /** Nodos del resultado sin filtrar, para resolver la selección de una fila. */
  private originalNodes: NormalizedNode[] = [];

  readonly queryResult = signal<QueryResult | null>(null);
  /** Resultado crudo (sin lotes): el banner de truncamiento habla del total. */
  private readonly rawQueryResult = signal<QueryResult | null>(null);
  readonly pageSize = signal(50);
  readonly pageSizeOptions = [50, 100, 200];
  readonly quickFilter = signal('');

  readonly columnDefs = signal<ColDef[]>([]);
  readonly rowData = signal<ResultBinding[]>([]);
  readonly defaultColDef: ColDef = {
    sortable: true,
    filter: true,
    resizable: true,
    minWidth: 100,
  };
  // API objeto (AG Grid >= 32.2); equivale al legacy rowSelection: 'single'
  // (click selecciona la fila, sin checkboxes).
  readonly rowSelection: RowSelectionOptions = {
    mode: 'singleRow',
    checkboxes: false,
    enableClickSelection: true,
  };

  readonly isReady = computed(() => this.gridApi !== null);
  readonly hasData = computed(() => this.rowData().length > 0);
  readonly isTruncated = computed(() => this.rawQueryResult()?.meta?.truncated ?? false);
  readonly truncatedMessage = computed(() => {
    const qr = this.rawQueryResult();
    if (!qr?.meta?.truncated) return '';
    return `Mostrando ${qr.bindings.length} de ${qr.meta.limitApplied} resultados (truncado)`;
  });

  constructor() {
    const storedTable = this.viewState.tableState();
    if (storedTable?.pageSize) {
      this.pageSize.set(storedTable.pageSize);
    }
    if (storedTable?.quickFilter !== undefined) {
      this.quickFilter.set(storedTable.quickFilter);
    }

    this.selectionService.queryResult$
      .pipe(takeUntil(this.destroy$))
      .subscribe((result) => {
        this.rawQueryResult.set(result);
        this.originalNodes = result?.nodes ?? [];
      });

    this.selectionService.visibleQueryResult$
      .pipe(takeUntil(this.destroy$))
      .subscribe((result) => {
        this.queryResult.set(result);
        if (result) {
          this.buildColumnDefs(result);
          this.rowData.set(result.bindings);
        } else {
          this.columnDefs.set([]);
          this.rowData.set([]);
        }
      });

    this.selectionService.selectedNode$
      .pipe(
        takeUntil(this.destroy$),
        filter((sel: Selection) => sel.source !== 'table'),
      )
      .subscribe((sel: Selection) => {
        if (sel.node && this.gridApi) {
          this.scrollToNode(sel.node);
        }
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  onGridReady(event: GridReadyEvent): void {
    this.gridApi = event.api;
    this.gridApi.sizeColumnsToFit();
  }

  onRowSelected(event: RowSelectedEvent): void {
    if (!event.node.isSelected() || this.isInternalSelection) return;
    const rowData = event.data as Record<string, BindingValue> | undefined;
    if (!rowData) return;

    const node = this.resolveNodeForRow(rowData);
    if (node) {
      this.selectionService.select(node, 'table');
    }
  }

  /**
   * Resuelve el NormalizedNode real del resultado de la query a partir de la URI de
   * la fila, en lugar de fabricar uno nuevo.
   *
   * Por qué importa: el nodo del resultado ya trae `temporalEvents`, `type` y
   * `coordinate` calculados por el adapter. La timeline sólo reacciona a una
   * selección si el nodo tiene `temporalEvents` (ver su handler de selectedNode$),
   * así que un nodo fabricado sin ese campo movía el mapa pero dejaba la timeline
   * quieta. Se usan los nodos SIN filtrar, igual que graph-view con su `nodeIndex`.
   */
  private resolveNodeForRow(rowData: Record<string, BindingValue>): NormalizedNode | null {
    const uri = this.extractUri(rowData);
    if (uri) {
      const fromResult = this.originalNodes.find((n) => n.uri === uri);
      if (fromResult) return fromResult;
    }
    // Fallback: la fila no tiene nodo asociado en el resultado.
    return this.buildNodeFromRow(rowData);
  }

  exportCsv(): void {
    if (this.gridApi) {
      this.gridApi.exportDataAsCsv({
        fileName: `query-results-${new Date().toISOString().slice(0, 10)}.csv`,
      });
    }
  }

  onPageSizeChange(size: number): void {
    this.pageSize.set(size);
    this.viewState.tableState.set({
      ...this.viewState.tableState(),
      pageSize: size,
    });
  }

  onQuickFilterChange(value: string): void {
    this.quickFilter.set(value);
    this.viewState.tableState.set({
      ...this.viewState.tableState(),
      quickFilter: value,
    });
  }

  private buildColumnDefs(result: QueryResult): void {
    const defs: ColDef[] = result.variables.map((variable, index) => {
      const isPrimaryUriColumn = index === 0;

      const colDef: ColDef = {
        field: variable,
        headerName: variable,
        headerTooltip: variable,
        sortable: true,
        filter: true,
        resizable: true,
        minWidth: 100,
        editable: false,
        valueGetter: (params) => {
          const val = params.data?.[variable] as BindingValue | undefined;
          return this.bindingToRawString(val);
        },
        // La primera columna la dibuja UriCellRendererComponent, que abrevia la URI,
        // así que el valor completo casi nunca está a la vista: tooltip siempre.
        // En el resto sólo cuando el texto no entra en el ancho actual de la columna.
        tooltipValueGetter: isPrimaryUriColumn
          ? (params: ITooltipParams) => this.fullTextOrNull(params)
          : (params: ITooltipParams) => this.tooltipIfOverflowing(params),
        cellRendererSelector: (params: ICellRendererParams) => {
          if (isPrimaryUriColumn) {
            return { component: UriCellRendererComponent };
          }
          const rawBinding = (params.data as Record<string, BindingValue> | undefined)?.[variable];
          if (rawBinding?.type === 'coordinate') {
            return { component: CoordCellRendererComponent };
          }
          return undefined;
        },
      };
      return colDef;
    });

    defs.push({
      colId: 'plugin',
      headerName: 'Plugin',
      sortable: false,
      filter: false,
      resizable: false,
      suppressMovable: true,
      width: 80,
      cellRenderer: PluginCellRendererComponent,
    });

    this.columnDefs.set(defs);
  }

  private fullTextOrNull(params: ITooltipParams): string | null {
    const text = params.value == null ? '' : String(params.value);
    return text.length > 0 ? text : null;
  }

  /**
   * Devuelve el texto completo sólo si es probable que la celda lo esté recortando,
   * y `null` en caso contrario (null suprime el tooltip en AG Grid).
   *
   * No hay forma de medir el texto renderizado desde `tooltipValueGetter`, así que se
   * estima la capacidad de la columna a partir de su ancho real. `getActualWidth()` se
   * lee en el momento de mostrar el tooltip, de modo que al redimensionar una columna
   * el criterio se recalcula solo.
   */
  private tooltipIfOverflowing(params: ITooltipParams): string | null {
    const text = params.value == null ? '' : String(params.value);
    if (text.length === 0) return null;

    const width = params.column?.getActualWidth?.() ?? 0;
    if (width <= 0) return text;

    // ~7 px por carácter con la tipografía de 13 px de la grilla, menos el padding
    // horizontal de la celda (8 px por lado). Es una estimación deliberadamente
    // conservadora: si sobra un carácter se muestra el tooltip igual, que es
    // preferible a esconderlo cuando el texto sí está cortado.
    const CHAR_PX = 7;
    const CELL_PADDING_PX = 16;
    const capacity = Math.floor((width - CELL_PADDING_PX) / CHAR_PX);

    return text.length > capacity ? text : null;
  }

  private bindingToRawString(value: BindingValue | undefined): string {
    if (!value) return '';
    switch (value.type) {
      case 'literal':
        return value.value;
      case 'uri':
        return value.value;
      case 'coordinate':
        return `${value.value.lat}, ${value.value.lng}`;
      case 'date':
        return value.value;
      case 'bnode':
        return value.value;
      default:
        return '';
    }
  }

  private buildNodeFromRow(rowData: Record<string, BindingValue>): NormalizedNode | null {
    let uri = '';
    const attributes: Record<string, BindingValue> = {};
    let label = '';
    const temporalEvents: TemporalEvent[] = [];

    for (const [key, value] of Object.entries(rowData)) {
      attributes[key] = value;

      if (value.type === 'uri' && !uri) {
        uri = value.value;
      }
      if (value.type === 'literal' && !label) {
        label = value.value;
      }
      // Mismo criterio que GenericSparqlAdapter.findTemporalEvents(): sin esto el
      // nodo de fallback no movería la timeline.
      if (value.type === 'date') {
        const parsed = new Date(value.value);
        temporalEvents.push({
          field: key,
          isoDate: value.value,
          numericValue: isNaN(parsed.getTime()) ? undefined : parsed.getFullYear(),
        });
      }
    }

    if (!uri) return null;

    return {
      uri,
      label: label || this.shortenUri(uri),
      attributes,
      coordinate:
        (Object.values(attributes).find((v) => v.type === 'coordinate')?.value as
          | { lat: number; lng: number }
          | undefined) ?? undefined,
      ...(temporalEvents.length > 0 ? { temporalEvents } : {}),
    };
  }

  private shortenUri(uri: string): string {
    if (!uri) return '';
    const hashIndex = uri.lastIndexOf('#');
    if (hashIndex > 0) {
      const base = uri.substring(0, hashIndex);
      const fragment = uri.substring(hashIndex + 1);
      if (fragment.length < 30) {
        const parts = base.split('/');
        const ns = parts[parts.length - 1] || parts[parts.length - 2] || base;
        return `${ns}:${fragment}`;
      }
    }
    const parts = uri.split('/');
    return parts[parts.length - 1] || parts[parts.length - 2] || uri;
  }

  /**
   * Selecciona la fila del nodo y la trae a la vista.
   *
   * La grilla está paginada (`[pagination]="true"`), y `ensureNodeVisible` sólo hace
   * scroll dentro de la página actual: no cambia de página. Si la fila caía en otra
   * página, quedaba seleccionada en el modelo pero sin renderizar, y por eso no se
   * veía pintada. Acá se calcula la página que le corresponde y se navega primero.
   */
  private scrollToNode(node: NormalizedNode): void {
    if (!this.gridApi) return;
    const api = this.gridApi;

    const rows: IRowNode[] = [];
    api.forEachNode((gridNode) => rows.push(gridNode));

    const target = rows.find((row) => {
      const data = row.data as Record<string, BindingValue> | undefined;
      return data ? this.extractUri(data) === node.uri : false;
    });

    this.isInternalSelection = true;
    for (const row of rows) {
      const shouldSelect = row === target;
      if (row.isSelected() !== shouldSelect) {
        row.setSelected(shouldSelect, false);
      }
    }
    this.isInternalSelection = false;

    if (!target) return;
    const rowIndex = target.rowIndex;
    if (rowIndex === null || rowIndex === undefined) return;

    // rowIndex es el índice sobre las filas mostradas (post-filtro y post-orden),
    // así que la página se deduce dividiendo por el tamaño de página.
    const pageSize = api.paginationGetPageSize();
    if (pageSize > 0) {
      const targetPage = Math.floor(rowIndex / pageSize);
      if (api.paginationGetCurrentPage() !== targetPage) {
        api.paginationGoToPage(targetPage);
        // El cambio de página re-renderiza las filas: recién después tiene sentido
        // pedir el scroll dentro de la página.
        setTimeout(() => this.gridApi?.ensureNodeVisible(target, 'middle'), 0);
        return;
      }
    }

    const firstDisplayed = api.getFirstDisplayedRowIndex();
    const lastDisplayed = api.getLastDisplayedRowIndex();
    if (rowIndex < firstDisplayed || rowIndex > lastDisplayed) {
      api.ensureNodeVisible(target, 'middle');
    }
  }

  private extractUri(data: Record<string, BindingValue>): string | null {
    for (const value of Object.values(data)) {
      if (value?.type === 'uri') {
        return value.value;
      }
    }
    return null;
  }
}
