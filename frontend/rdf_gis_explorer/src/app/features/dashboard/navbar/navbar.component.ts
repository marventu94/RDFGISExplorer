import { Component, DestroyRef, inject, signal } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatMenuModule } from '@angular/material/menu';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FilterBadgesComponent } from '../filter-badges/filter-badges.component';
import { DashboardLayoutService, LayoutPreset } from '@core/services/dashboard-layout.service';
import { SelectionService } from '@core/services/selection.service';
import { DashboardPersistenceService } from '@core/services/dashboard-persistence.service';
import {
  SaveDashboardDialogComponent,
  type SaveDashboardDialogData,
  type SaveDashboardDialogResult,
} from '../save-dashboard-dialog.component';

@Component({
  selector: 'app-navbar',
  standalone: true,
  imports: [FilterBadgesComponent, MatIconModule, MatButtonModule, MatMenuModule, MatDialogModule, SaveDashboardDialogComponent],
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

  constructor() {
    this.selectionService.coordinatedViewEnabled$
      .pipe(takeUntilDestroyed(inject(DestroyRef)))
      .subscribe((v) => this._coordinatedViewEnabled.set(v));
  }

  protected readonly layoutOptions: { preset: LayoutPreset; label: string; icon: string }[] = [
    { preset: 'single', label: '1 vista', icon: 'crop_square' },
    { preset: 'split-h', label: '2 vistas', icon: 'view_column' },
    { preset: 'triple', label: '3 vistas', icon: 'view_quilt' },
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
