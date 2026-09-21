import { Component, inject, signal, computed, effect, OnDestroy } from '@angular/core';
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
import { DashboardLoadProgressService } from '@core/services/dashboard-load-progress.service';
import { LimitsService } from '@core/services/limits.service';
import type {
  QueryResult,
  ResultBinding,
  BindingValue,
  NormalizedNode,
  Selection,
  TemporalEvent,
} from '@shared/models';
import { pickRowEntity, rowUris } from '@shared/selection/row-index';
import { UriCellRendererComponent } from './cell-renderers/uri-cell-renderer.component';
import { CoordCellRendererComponent } from './cell-renderers/coord-cell-renderer.component';

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
  private readonly limits = inject(LimitsService);
  private readonly loadProgress = inject(DashboardLoadProgressService);
  private readonly destroy$ = new Subject<void>();

  readonly agThemeClass = 'ag-theme-alpine';

  private gridApi: GridApi | null = null;
  private isInternalSelection = false;
  /** Nodos del resultado sin filtrar, para resolver la selección de una fila. */
  private originalNodes: NormalizedNode[] = [];
  /** Índice por URI de los nodos del resultado, para resolver la fila clickeada. */
  private nodeByUri = new Map<string, NormalizedNode>();
  /** Selección vigente, para repintarla cada vez que la grilla rehace sus filas. */
  private currentSelection: Selection | null = null;

  readonly queryResult = signal<QueryResult | null>(null);
  /** Resultado crudo (sin lotes): el banner de truncamiento habla del total. */
  private readonly rawQueryResult = signal<QueryResult | null>(null);
  readonly pageSize = signal(50);
  /** Opciones de paginación: config-driven (limits.tablePageSizeOptions). */
  readonly pageSizeOptions = computed(() => this.limits.limits().tablePageSizeOptions);
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

    // Si la config trae opciones de paginación que no incluyen la actual
    // (p.ej. restaurada de un tablero guardado), se clampea a la primera.
    effect(() => {
      const options = this.limits.limits().tablePageSizeOptions;
      if (options.length > 0 && !options.includes(this.pageSize())) {
        this.pageSize.set(options[0]);
      }
    });

    this.selectionService.queryResult$
      .pipe(takeUntil(this.destroy$))
      .subscribe((result) => {
        this.rawQueryResult.set(result);
        this.originalNodes = result?.nodes ?? [];
        this.nodeByUri = new Map(this.originalNodes.map((n) => [n.uri, n]));
      });

    this.selectionService.visibleQueryResult$
      .pipe(takeUntil(this.destroy$))
      .subscribe((result) => {
        this.queryResult.set(result);
        if (result) {
          this.buildColumnDefs(result);
          this.rowData.set(result.bindings);
          // Cartel de carga: columnas y filas ya están en la grilla.
          this.loadProgress.reportViewRendered('table');
        } else {
          this.columnDefs.set([]);
          this.rowData.set([]);
        }
      });

    // Ojo: NO se filtra la selección propia. Seleccionar reemite
    // `visibleQueryResult$` (el lote inyecta el nodo pineado), la grilla rehace
    // sus filas y se lleva puesta la selección — también la que acaba de hacer
    // el usuario con un click acá. Por eso se guarda siempre y se reaplica en
    // `onRowDataUpdated`.
    this.selectionService.selectedNode$
      .pipe(takeUntil(this.destroy$))
      .subscribe((sel: Selection) => {
        if (!sel.node) {
          this.currentSelection = null;
          this.clearRowSelection();
          return;
        }
        this.currentSelection = sel;
        // El click propio ya dejó la fila seleccionada y en pantalla: no hay
        // que moverle el scroll ni la página al usuario.
        this.applyRowSelection({ scroll: sel.source !== 'table' });
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  onGridReady(event: GridReadyEvent): void {
    this.gridApi = event.api;
    this.gridApi.sizeColumnsToFit();
    this.applyRowSelection({ scroll: false });
  }

  /**
   * La grilla rehízo sus filas (lote nuevo, filtro, o la reemisión que dispara
   * la propia selección). Los row nodes son nuevos, así que la selección hay
   * que volver a pintarla: sin esto la fila quedaba resaltada unos milisegundos
   * y se apagaba sola.
   */
  onRowDataUpdated(): void {
    this.applyRowSelection({ scroll: false });
  }

  onRowSelected(event: RowSelectedEvent): void {
    if (!event.node.isSelected() || this.isInternalSelection) return;
    const rowData = event.data as Record<string, BindingValue> | undefined;
    if (!rowData) return;

    const node = this.resolveNodeForRow(rowData);
    if (!node) return;
    // Cortafuegos: si la fila resuelve a lo que ya está seleccionado, no se
    // reemite. Así una selección aplicada por código (repintado de la grilla)
    // nunca puede realimentar el ciclo, aunque AG Grid avise tarde.
    if (node.uri === this.currentSelection?.node?.uri) return;

    this.selectionService.select(node, 'table');
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
    // Se elige la entidad principal de la fila (la que tiene coordenada, fechas
    // o atributos propios) y no la primera URI que aparezca: la primera suele
    // ser un nodo estructural que ni el mapa ni la timeline saben dibujar, y
    // entonces el click en la tabla no se veía en las otras vistas.
    const entity = pickRowEntity(rowUris(rowData), this.nodeByUri);
    if (entity) return entity;
    // Fallback: la fila no tiene nodo asociado en el resultado.
    return this.buildNodeFromRow(rowData);
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
        // Todas las celdas exponen el valor completo. Esto también cubre renderers
        // que muestran una versión abreviada, como las URI y las coordenadas.
        tooltipValueGetter: (params: ITooltipParams) => this.fullTextOrNull(params),
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

    this.columnDefs.set(defs);
  }

  private fullTextOrNull(params: ITooltipParams): string | null {
    const text = params.value == null ? '' : String(params.value);
    return text.length > 0 ? text : null;
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

  /** Apaga la selección de la grilla (selección limpiada desde cualquier vista). */
  private clearRowSelection(): void {
    if (!this.gridApi) return;
    this.isInternalSelection = true;
    this.gridApi.forEachNode((row) => {
      if (row.isSelected()) row.setSelected(false, false);
    });
    this.isInternalSelection = false;
  }

  /**
   * Pinta la selección vigente en la grilla y, si `scroll`, la trae a la vista.
   *
   * Se llama en cada emisión de la selección Y cada vez que la grilla rehace
   * sus filas (`onRowDataUpdated`): los row nodes son objetos nuevos y pierden
   * el estado de selección.
   *
   * Se busca primero la fila que menciona esa entidad EXACTA en cualquiera de
   * sus celdas (antes se comparaba solo contra la primera URI de la fila, así
   * que un click en el mapa sobre una geometría no seleccionaba nada acá). Si
   * ninguna fila la menciona —el mapa puede haber seleccionado un nodo que la
   * consulta no proyecta como columna— se cae a las entidades de su misma fila.
   *
   * La grilla está paginada (`[pagination]="true"`), y `ensureNodeVisible` sólo hace
   * scroll dentro de la página actual: no cambia de página. Si la fila caía en otra
   * página, quedaba seleccionada en el modelo pero sin renderizar, y por eso no se
   * veía pintada. Acá se calcula la página que le corresponde y se navega primero.
   */
  private applyRowSelection(opts: { scroll: boolean }): void {
    const sel = this.currentSelection;
    if (!this.gridApi || !sel?.node) return;
    const api = this.gridApi;

    const rows: IRowNode[] = [];
    api.forEachNode((gridNode) => rows.push(gridNode));

    const exact = new Set<string>([sel.node.uri]);
    const target =
      rows.find((row) => this.rowMatches(row.data as Record<string, BindingValue>, exact)) ??
      rows.find((row) =>
        this.rowMatches(row.data as Record<string, BindingValue>, sel.relatedUris ?? exact),
      );

    this.isInternalSelection = true;
    for (const row of rows) {
      const shouldSelect = row === target;
      if (row.isSelected() !== shouldSelect) {
        row.setSelected(shouldSelect, false);
      }
    }
    this.isInternalSelection = false;

    if (!target || !opts.scroll) return;
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

  /**
   * ¿Esta fila habla de alguna de estas entidades? Mira TODAS las celdas, no
   * solo la primera URI: la fila de una consulta espacio-temporal menciona
   * varias entidades (el aviso, el inmueble, la geometría) y cada vista
   * selecciona la suya.
   */
  private rowMatches(
    data: Record<string, BindingValue> | undefined,
    uris: ReadonlySet<string>,
  ): boolean {
    if (!data || uris.size === 0) return false;
    return rowUris(data).some((uri) => uris.has(uri));
  }
}
