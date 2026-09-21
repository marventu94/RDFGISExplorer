import { Component, inject, OnInit } from '@angular/core';
import { DashboardComponent } from '@features/dashboard/dashboard.component';
import { NavbarComponent } from '@features/dashboard/navbar/navbar.component';
import { AppConfigService } from '@core/services/app-config.service';
import { LimitsService } from '@core/services/limits.service';
import { SparqlQueryStateService } from '@core/services/sparql-query-state.service';
import { DashboardLayoutService } from '@core/services/dashboard-layout.service';
import { DashboardStateService } from '@core/services/dashboard-state.service';
import { dashboardHost, isDashboardHostAvailable } from '@rdfgis/platform-bridge';
import { GisSessionStateService } from '@core/services/gis-session-state.service';
import { MatSnackBar } from '@angular/material/snack-bar';
import { LoadProgressOverlayComponent } from '@features/dashboard/load-progress/load-progress-overlay.component';
import { ModuleRegistry, AllCommunityModule } from 'ag-grid-community';
import { LanguageSelectorComponent } from '@core/services/language-selector.component';
import { I18nService } from '@core/services/i18n.service';

ModuleRegistry.registerModules([AllCommunityModule]);

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    LoadProgressOverlayComponent,
    DashboardComponent,
    NavbarComponent,
    LanguageSelectorComponent,
  ],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App implements OnInit {
  private readonly appConfig = inject(AppConfigService);
  private readonly limits = inject(LimitsService);
  private readonly queryState = inject(SparqlQueryStateService);
  private readonly dashboardLayout = inject(DashboardLayoutService);
  protected readonly dashboardState = inject(DashboardStateService);
  private readonly snackBar = inject(MatSnackBar);
  private readonly i18n = inject(I18nService);
  protected readonly editorCollapsed = this.dashboardLayout.editorCollapsed;

  constructor() {
    // Publica en el canal compartido qué tablero/consulta hay abierto, para
    // que el RDF Explorer avise antes de pisarlo con un handoff.
    inject(GisSessionStateService);

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

    if (dashboardId && isDashboardHostAvailable()) {
      this.dashboardState.beginLoad();
      this.dashboardState.isHydrating.set(true);
      dashboardHost().load(dashboardId).then(
        () => {
          this.dashboardLayout.collapseEditor();
        },
        () => {
          this.dashboardState.failLoad();
          this.snackBar.open(
            this.i18n.text('Error al cargar el dashboard. Se muestra un tablero vacío.'),
            this.i18n.text('Cerrar'),
            {
              duration: 6000,
              panelClass: 'snackbar-error',
            },
          );
          const url = new URL(window.location.href);
          url.searchParams.delete('dashboardId');
          window.history.replaceState({}, '', url.toString());
        },
      );
    }

    if (!dashboardId && !handoff) {
      this.appConfig.load().subscribe({
        next: (cfg) => this.queryState.backend.set(cfg.backend),
        error: () => this.queryState.backend.set('wikidata'),
      });
    }
  }

  private cleanLegacyLocalStorage(): void {
    try {
      localStorage.removeItem('rdf-explorer:queries');
    } catch {
      // ignore quota / private-mode errors
    }
  }
}
