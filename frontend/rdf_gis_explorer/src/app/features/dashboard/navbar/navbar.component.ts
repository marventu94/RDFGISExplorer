import { Component, inject } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatMenuModule } from '@angular/material/menu';
import { toSignal } from '@angular/core/rxjs-interop';
import { FilterBadgesComponent } from '../filter-badges/filter-badges.component';
import { DashboardLayoutService, LayoutPreset } from '@core/services/dashboard-layout.service';
import { SelectionService } from '@core/services/selection.service';

@Component({
  selector: 'app-navbar',
  standalone: true,
  imports: [FilterBadgesComponent, MatIconModule, MatButtonModule, MatMenuModule],
  templateUrl: './navbar.component.html',
  styleUrl: './navbar.component.scss',
})
export class NavbarComponent {
  protected readonly layout = inject(DashboardLayoutService);
  protected readonly selectionService = inject(SelectionService);

  protected readonly coordinatedViewEnabled = toSignal(
    this.selectionService.coordinatedViewEnabled$,
    { initialValue: true },
  );

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
}
