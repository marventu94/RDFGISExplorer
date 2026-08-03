import { Component, DestroyRef, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatIconModule, MatIconRegistry } from '@angular/material/icon';
import { DomSanitizer } from '@angular/platform-browser';
import { MatButtonModule } from '@angular/material/button';
import { MatMenuModule } from '@angular/material/menu';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FilterBadgesComponent } from '../filter-badges/filter-badges.component';
import { SummaryPanelComponent } from '../summary-panel/summary-panel.component';
import { DashboardLayoutService, LayoutPreset } from '@core/services/dashboard-layout.service';
import {
  SelectionService,
  type LotState,
} from '@core/services/selection.service';
import { DashboardPersistenceService } from '@core/services/dashboard-persistence.service';
import { SparqlQueryStateService } from '@core/services/sparql-query-state.service';
import { SummaryStateService } from '@core/services/summary-state.service';
import { ResultExportService } from '@core/services/result-export.service';
import {
  type ExportProgress,
} from '@shared/export/result-exporter';
import {
  ExportProgressDialogComponent,
  type ExportProgressDialogData,
} from '../export-progress-dialog.component';
import {
  ExportCapDialogComponent,
  type ExportCapAction,
} from '../export-cap-dialog.component';
import {
  SaveDashboardDialogComponent,
  type SaveDashboardDialogData,
  type SaveDashboardDialogResult,
} from '../save-dashboard-dialog.component';

/**
 * Íconos propios para los presets de 3 y 4 vistas, dibujados en estilo
 * "línea" (marco + divisores) para que el menú sea visualmente uniforme:
 * la fuente Material Icons no tiene glifos de "3 paneles" con la geometría
 * real de los layouts (1 ancho arriba + 2 abajo, y su inversa), y el glifo
 * de 4 paneles (`grid_view`) es relleno, distinto de `crop_square` y
 * `splitscreen`. Se registran como svgIcon.
 */
const LAYOUT_SVG_ICONS: Record<string, string> = {
  'layout-triple':
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="4" width="16" height="16" rx="2"/><line x1="4" y1="12" x2="20" y2="12"/><line x1="12" y1="12" x2="12" y2="20"/></svg>',
  'layout-triple-inv':
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="4" width="16" height="16" rx="2"/><line x1="12" y1="4" x2="12" y2="12"/><line x1="4" y1="12" x2="20" y2="12"/></svg>',
  'layout-quad':
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="4" width="16" height="16" rx="2"/><line x1="4" y1="12" x2="20" y2="12"/><line x1="12" y1="4" x2="12" y2="20"/></svg>',
};

@Component({
  selector: 'app-navbar',
  standalone: true,
  imports: [
    FilterBadgesComponent,
    SummaryPanelComponent,
    FormsModule,
    MatIconModule,
    MatButtonModule,
    MatMenuModule,
    MatDialogModule,
    MatSnackBarModule,
  ],
  templateUrl: './navbar.component.html',
  styleUrl: './navbar.component.scss',
})
export class NavbarComponent {
  protected readonly layout = inject(DashboardLayoutService);
  protected readonly selectionService = inject(SelectionService);
  protected readonly persistence = inject(DashboardPersistenceService);
  private readonly dialog = inject(MatDialog);
  private readonly snackBar = inject(MatSnackBar);
  private readonly queryState = inject(SparqlQueryStateService);
  private readonly summaryState = inject(SummaryStateService);
  private readonly exportService = inject(ResultExportService);

  private readonly _coordinatedViewEnabled = signal(true);
  protected readonly coordinatedViewEnabled = this._coordinatedViewEnabled.asReadonly();

  protected readonly lotSizeOptions = signal<readonly number[]>([]);
  private readonly _lotState = signal<LotState | null>(null);
  protected readonly lotState = this._lotState.asReadonly();
  /** Límite aplicado por el backend cuando truncó el resultado; null si no truncó. */
  private readonly _truncatedLimit = signal<number | null>(null);
  protected readonly truncatedLimit = this._truncatedLimit.asReadonly();
  /** Hay un resultado ejecutado (habilita el export completo). */
  private readonly _hasResult = signal(false);
  protected readonly hasResult = this._hasResult.asReadonly();

  constructor() {
    const destroyRef = inject(DestroyRef);
    const iconRegistry = inject(MatIconRegistry);
    const sanitizer = inject(DomSanitizer);
    for (const [name, svg] of Object.entries(LAYOUT_SVG_ICONS)) {
      iconRegistry.addSvgIconLiteral(name, sanitizer.bypassSecurityTrustHtml(svg));
    }
    this.selectionService.coordinatedViewEnabled$
      .pipe(takeUntilDestroyed(destroyRef))
      .subscribe((v) => this._coordinatedViewEnabled.set(v));
    this.selectionService.lotState$
      .pipe(takeUntilDestroyed(destroyRef))
      .subscribe((s) => this._lotState.set(s));
    this.selectionService.lotSizeOptions$
      .pipe(takeUntilDestroyed(destroyRef))
      .subscribe((options) => this.lotSizeOptions.set(options));
    this.selectionService.queryResult$
      .pipe(takeUntilDestroyed(destroyRef))
      .subscribe((r) => {
        this._truncatedLimit.set(r?.meta?.truncated ? r.meta.limitApplied : null);
        this._hasResult.set(!!r);
      });
  }

  protected readonly layoutOptions: {
    preset: LayoutPreset;
    label: string;
    icon?: string;
    svgIcon?: string;
  }[] = [
    { preset: 'single', label: '1 vista', icon: 'crop_square' },
    { preset: 'split-h', label: '2 vistas', icon: 'splitscreen' },
    { preset: 'triple', label: '3 vistas (1 arriba)', svgIcon: 'layout-triple' },
    { preset: 'triple-inv', label: '3 vistas (2 arriba)', svgIcon: 'layout-triple-inv' },
    { preset: 'quad', label: '4 vistas', svgIcon: 'layout-quad' },
  ];

  protected currentLayoutOption(): { icon?: string; svgIcon?: string } {
    const p = this.layout.preset();
    return this.layoutOptions.find((o) => o.preset === p) ?? { svgIcon: 'layout-quad' };
  }

  protected setLayoutPreset(preset: LayoutPreset): void {
    this.layout.setLayout(preset);
  }

  protected toggleEditor(): void {
    this.layout.toggleEditor();
  }

  protected toggleCoordinatedView(): void {
    this.selectionService.toggleCoordinatedView();
  }

  protected previousLot(): void {
    this.selectionService.previousLot();
  }

  protected nextLot(): void {
    this.selectionService.nextLot();
  }

  protected onLotSizeChange(size: number): void {
    this.selectionService.setLotSize(Number(size));
  }

  /** Aviso de volumen: tooltip del navegador de lotes. */
  protected lotNotice(lot: LotState): string {
    return (
      `La query devolvió ${lot.totalRows} filas — mostrando en ${lot.lotCount} ` +
      `lotes de ${lot.lotSize}. Considerá acotar la query o el LIMIT.`
    );
  }

  protected truncatedNotice(): string {
    return (
      `El backend truncó el resultado al límite de ${this.truncatedLimit()} filas; ` +
      'los conteos por lote pueden estar incompletos.'
    );
  }

  protected openSaveDialog(): void {
    const data: SaveDashboardDialogData = {
      currentName: this.persistence.currentDashboardName(),
      hasCurrentDashboard: !!this.persistence.currentDashboardId(),
    };

    const dialogRef = this.dialog.open(SaveDashboardDialogComponent, {
      width: '400px',
      data,
    });

    dialogRef.afterClosed().subscribe((result: SaveDashboardDialogResult | undefined) => {
      if (!result) return;
      this.persistence.save(result.name, result.mode).subscribe();
    });
  }

  /**
   * Export completo del resultado a CSV: TODAS las filas de la query, no el
   * lote visible (eso ya lo hace el botón de la tabla). Si el resultado no
   * está truncado ya está todo en el cliente; si está truncado se pagina del
   * lado del endpoint (ver ResultExportService).
   */
  protected async exportFullCsv(): Promise<void> {
    const result = this.selectionService.getQueryResultSnapshot();
    if (!result) return;
    const query = this.queryState.query();
    const backend = result.meta.backend;

    // Sin truncamiento: el resultado completo ya está en el cliente.
    if (!result.meta.truncated) {
      this.exportService.downloadCsv({
        rows: result.bindings,
        variables: result.variables,
        backend,
        query,
        partial: false,
      });
      this.snackBar.open(
        `Exportadas ${result.bindings.length} filas (resultado completo)`,
        'OK',
        { duration: 4000 },
      );
      return;
    }

    const progress = signal<ExportProgress>({ rowsFetched: 0, page: 0, pageSize: 0 });
    // Progreso real si el summary ya calculó el COUNT del resultado completo.
    const totalRows = this.summaryState.summary()?.totalRows ?? null;
    const progressRef = this.dialog.open(ExportProgressDialogComponent, {
      data: { progress, totalRows } satisfies ExportProgressDialogData,
      disableClose: true,
    });
    let cancelRequested = false;
    progressRef.afterClosed().subscribe((action) => {
      if (action === 'cancel') cancelRequested = true;
    });

    const outcome = await this.exportService.exportAll({
      query,
      onProgress: (p) => progress.set(p),
      isCancelled: () => cancelRequested,
    });
    progressRef.close();

    switch (outcome.status) {
      case 'complete':
        this.exportService.downloadCsv({
          rows: outcome.rows,
          variables: outcome.variables,
          backend,
          query,
          partial: false,
        });
        this.snackBar.open(
          `Exportadas ${outcome.rows.length} filas (resultado completo)`,
          'OK',
          { duration: 4000 },
        );
        break;
      case 'max-rows': {
        const capRef = this.dialog.open(ExportCapDialogComponent, {
          width: '440px',
          data: { rows: outcome.rows.length, maxRows: outcome.maxRows },
        });
        capRef.afterClosed().subscribe((action: ExportCapAction | undefined) => {
          if (action === 'partial') {
            this.exportService.downloadCsv({
              rows: outcome.rows,
              variables: outcome.variables,
              backend,
              query,
              partial: true,
            });
            this.snackBar.open(
              `Exportación PARCIAL: ${outcome.rows.length} filas`,
              'OK',
              { duration: 5000 },
            );
          } else if (action === 'copy') {
            void navigator.clipboard.writeText(query).then(() =>
              this.snackBar.open('Query copiada al portapapeles', 'OK', { duration: 3000 }),
            );
          }
        });
        break;
      }
      case 'cancelled':
        this.snackBar.open('Exportación cancelada', 'OK', { duration: 3000 });
        break;
      case 'error':
        this.snackBar.open(`No se pudo exportar: ${outcome.error}`, 'Cerrar', {
          duration: 8000,
          panelClass: 'snackbar-error',
        });
        break;
    }
  }
}
