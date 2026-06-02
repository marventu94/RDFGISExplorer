import { Component, inject, OnInit } from '@angular/core';
import { DashboardComponent } from '@features/dashboard/dashboard.component';
import { NavbarComponent } from '@features/dashboard/navbar/navbar.component';
import { DashboardLayoutService } from '@core/services/dashboard-layout.service';
import { DashboardPersistenceService } from '@core/services/dashboard-persistence.service';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { ModuleRegistry, AllCommunityModule } from 'ag-grid-community';

// Registrar módulos de AG Grid aquí (no en bootstrap.ts) porque cuando este componente
// se carga como remote de native federation, bootstrap.ts no se ejecuta.
ModuleRegistry.registerModules([AllCommunityModule]);

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [MatProgressSpinnerModule, DashboardComponent, NavbarComponent],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App implements OnInit {
  private readonly dashboardLayout = inject(DashboardLayoutService);
  protected readonly persistence = inject(DashboardPersistenceService);
  private readonly snackBar = inject(MatSnackBar);
  protected readonly editorCollapsed = this.dashboardLayout.editorCollapsed;

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

  private cleanLegacyLocalStorage(): void {
    try {
      localStorage.removeItem('rdf-explorer:queries');
    } catch {
      // ignore quota / private-mode errors
    }
  }
}
