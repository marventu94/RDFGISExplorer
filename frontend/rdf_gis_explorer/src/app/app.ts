import { Component, inject, signal, ViewChild, OnInit } from '@angular/core';
import { MatSidenavModule, MatSidenav } from '@angular/material/sidenav';
import { DashboardComponent } from '@features/dashboard/dashboard.component';
import { NavbarComponent } from '@features/dashboard/navbar/navbar.component';
import { DetailPanelComponent } from '@features/detail-panel/detail-panel.component';
import { SelectionService } from '@core/services/selection.service';
import { DashboardLayoutService } from '@core/services/dashboard-layout.service';
import { DashboardPersistenceService } from '@core/services/dashboard-persistence.service';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { ModuleRegistry, AllCommunityModule } from 'ag-grid-community';

ModuleRegistry.registerModules([AllCommunityModule]);

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    MatSidenavModule,
    MatProgressSpinnerModule,
    DashboardComponent,
    NavbarComponent,
    DetailPanelComponent,
  ],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App implements OnInit {
  private readonly selectionService = inject(SelectionService);
  private readonly dashboardLayout = inject(DashboardLayoutService);
  protected readonly persistence = inject(DashboardPersistenceService);
  private readonly snackBar = inject(MatSnackBar);
  protected readonly sidenavOpen = signal(false);
  protected readonly editorCollapsed = this.dashboardLayout.editorCollapsed;

  @ViewChild('sidenav') sidenav!: MatSidenav;

  constructor() {
    this.selectionService.selectedNode$.subscribe((sel) => {
      if (sel.node && !this.dashboardLayout.visibleSlots().includes('table')) {
        this.sidenavOpen.set(true);
      }
    });
  }

  ngOnInit(): void {
    this.cleanLegacyLocalStorage();

    const params = new URLSearchParams(window.location.search);
    const dashboardId = params.get('dashboardId');

    if (dashboardId) {
      this.persistence.isHydrating.set(true);
      this.persistence.load(dashboardId).subscribe({
        error: () => {
          this.persistence.isHydrating.set(false);
          this.snackBar.open(
            'Error al cargar el dashboard. Se muestra un tablero vacío.',
            'Cerrar',
            {
              duration: 6000,
              panelClass: 'snackbar-error',
            },
          );
          const url = new URL(window.location.href);
          url.searchParams.delete('dashboardId');
          window.history.replaceState({}, '', url.toString());
        },
      });
    }
  }

  protected onSidenavClosed(): void {
    this.sidenavOpen.set(false);
  }

  private cleanLegacyLocalStorage(): void {
    try {
      localStorage.removeItem('rdf-explorer:queries');
    } catch {
      // ignore quota / private-mode errors
    }
  }
}
