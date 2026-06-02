import { Component, inject, signal, computed, OnDestroy } from '@angular/core';
import { Subject, takeUntil } from 'rxjs';
import { filter } from 'rxjs/operators';
import { AgGridAngular } from 'ag-grid-angular';
import type {
  ColDef,
  GridApi,
  GridReadyEvent,
  RowSelectedEvent,
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

  private gridApi: GridApi | null = null;
  private isInternalSelection = false;

  readonly queryResult = signal<QueryResult | null>(null);
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

  readonly isReady = computed(() => this.gridApi !== null);
  readonly hasData = computed(() => this.rowData().length > 0);
  readonly isTruncated = computed(() => this.queryResult()?.meta?.truncated ?? false);
  readonly truncatedMessage = computed(() => {
    const qr = this.queryResult();
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

    this.selectionService.filteredQueryResult$
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

    const node = this.buildNodeFromRow(rowData);
    if (node) {
      this.selectionService.select(node, 'table');
    }
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
        sortable: true,
        filter: true,
        resizable: true,
        minWidth: 100,
        editable: false,
        valueGetter: (params) => {
          const val = params.data?.[variable] as BindingValue | undefined;
          return this.bindingToRawString(val);
        },
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

    for (const [key, value] of Object.entries(rowData)) {
      attributes[key] = value;

      if (value.type === 'uri' && !uri) {
        uri = value.value;
      }
      if (value.type === 'literal' && !label) {
        label = value.value;
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

  private scrollToNode(node: NormalizedNode): void {
    if (!this.gridApi) return;
    this.isInternalSelection = true;

    this.gridApi.forEachNode((gridNode) => {
      const data = gridNode.data as Record<string, BindingValue> | undefined;
      if (!data) return;
      const nodeUri = this.extractUri(data);
      if (nodeUri === node.uri) {
        gridNode.setSelected(true, false);
        const rowIndex = gridNode.rowIndex;
        if (rowIndex !== null) {
          const firstDisplayed = this.gridApi!.getFirstDisplayedRowIndex();
          const lastDisplayed = this.gridApi!.getLastDisplayedRowIndex();
          const isVisible = rowIndex >= firstDisplayed && rowIndex <= lastDisplayed;
          if (!isVisible) {
            this.gridApi?.ensureNodeVisible(gridNode, 'middle');
          }
        }
      } else {
        gridNode.setSelected(false, false);
      }
    });
    this.isInternalSelection = false;
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
