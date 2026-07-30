import { Component, inject, signal, ViewChild, OnInit } from '@angular/core';
import { MatSidenavModule, MatSidenav } from '@angular/material/sidenav';
import { DashboardComponent } from '@features/dashboard/dashboard.component';
import { NavbarComponent } from '@features/dashboard/navbar/navbar.component';
import { DetailPanelComponent } from '@features/detail-panel/detail-panel.component';
import { SelectionService } from '@core/services/selection.service';
import { AppConfigService } from '@core/services/app-config.service';
import { LimitsService } from '@core/services/limits.service';
import { SparqlQueryStateService } from '@core/services/sparql-query-state.service';
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
  private readonly appConfig = inject(AppConfigService);
  private readonly limits = inject(LimitsService);
  private readonly queryState = inject(SparqlQueryStateService);
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

    // Límites config-driven (/api/config → LimitsService): las vistas los
    // consumen reactivamente; hasta que llega la config valen los defaults.
    this.appConfig.load().subscribe({
      next: (cfg) => this.limits.apply(cfg.limits),
      error: () => {
        // sin config: quedan los defaults de LimitsService
      },
    });

    const params = new URLSearchParams(window.location.search);
    const dashboardId = params.get('dashboardId');
    const handoff = params.get('handoff') === '1';

    if (dashboardId) {
      this.persistence.isHydrating.set(true);
      this.persistence.load(dashboardId).subscribe({
        next: () => {
          this.dashboardLayout.collapseEditor();
        },
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

    if (!dashboardId && !handoff) {
      this.appConfig.load().subscribe({
        next: (cfg) => this.queryState.backend.set(cfg.backend),
        error: () => this.queryState.backend.set('wikidata'),
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
