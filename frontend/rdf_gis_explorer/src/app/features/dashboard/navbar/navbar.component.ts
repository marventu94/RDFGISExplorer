import { Component, DestroyRef, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatMenuModule } from '@angular/material/menu';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FilterBadgesComponent } from '../filter-badges/filter-badges.component';
import { DashboardLayoutService, LayoutPreset } from '@core/services/dashboard-layout.service';
import {
  LOT_SIZE_OPTIONS,
  SelectionService,
  type LotState,
} from '@core/services/selection.service';
import { DashboardPersistenceService } from '@core/services/dashboard-persistence.service';
import {
  SaveDashboardDialogComponent,
  type SaveDashboardDialogData,
  type SaveDashboardDialogResult,
} from '../save-dashboard-dialog.component';

@Component({
  selector: 'app-navbar',
  standalone: true,
  imports: [
    FilterBadgesComponent,
    FormsModule,
    MatIconModule,
    MatButtonModule,
    MatMenuModule,
    MatDialogModule,
  ],
  templateUrl: './navbar.component.html',
  styleUrl: './navbar.component.scss',
})
export class NavbarComponent {
  protected readonly layout = inject(DashboardLayoutService);
  protected readonly selectionService = inject(SelectionService);
  protected readonly persistence = inject(DashboardPersistenceService);
  private readonly dialog = inject(MatDialog);

  private readonly _coordinatedViewEnabled = signal(true);
  protected readonly coordinatedViewEnabled = this._coordinatedViewEnabled.asReadonly();

  protected readonly lotSizeOptions = LOT_SIZE_OPTIONS;
  private readonly _lotState = signal<LotState | null>(null);
  protected readonly lotState = this._lotState.asReadonly();
  /** Límite aplicado por el backend cuando truncó el resultado; null si no truncó. */
  private readonly _truncatedLimit = signal<number | null>(null);
  protected readonly truncatedLimit = this._truncatedLimit.asReadonly();

  constructor() {
    const destroyRef = inject(DestroyRef);
    this.selectionService.coordinatedViewEnabled$
      .pipe(takeUntilDestroyed(destroyRef))
      .subscribe((v) => this._coordinatedViewEnabled.set(v));
    this.selectionService.lotState$
      .pipe(takeUntilDestroyed(destroyRef))
      .subscribe((s) => this._lotState.set(s));
    this.selectionService.queryResult$
      .pipe(takeUntilDestroyed(destroyRef))
      .subscribe((r) =>
        this._truncatedLimit.set(r?.meta?.truncated ? r.meta.limitApplied : null),
      );
  }

  protected readonly layoutOptions: { preset: LayoutPreset; label: string; icon: string }[] = [
    { preset: 'single', label: '1 vista', icon: 'crop_square' },
    { preset: 'split-h', label: '2 vistas', icon: 'view_column' },
    { preset: 'triple', label: '3 vistas (1 arriba)', icon: 'view_quilt' },
    { preset: 'triple-inv', label: '3 vistas (2 arriba)', icon: 'vertical_split' },
    { preset: 'quad', label: '4 vistas', icon: 'grid_view' },
  ];

  protected currentLayoutIcon(): string {
    const p = this.layout.preset();
    return this.layoutOptions.find((o) => o.preset === p)?.icon ?? 'grid_view';
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
}
