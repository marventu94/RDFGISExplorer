import { Injectable, inject } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { Observable, of, switchMap, catchError, from, tap } from 'rxjs';

import { DashboardStateService } from '@core/services/dashboard-state.service';
import type { Dashboard } from '@rdfgis/contracts';
import { dashboardHost } from '@rdfgis/platform-bridge';
import {
  SaveDashboardDialogComponent,
  type SaveDashboardDialogData,
  type SaveDashboardDialogResult,
} from './save-dashboard-dialog.component';

/**
 * Flujo interactivo que recoge la intención del usuario y la delega al Shell.
 * que lo puedan disparar tanto el botón de la navbar como el aviso previo a
 * reemplazar el tablero con una query importada del RDF Explorer.
 */
@Injectable({ providedIn: 'root' })
export class DashboardSaveFlowService {
  private readonly dialog = inject(MatDialog);
  private readonly dashboardState = inject(DashboardStateService);

  /**
   * Abre el diálogo de guardado y guarda. Emite el tablero guardado, o `null`
   * si el usuario canceló o el guardado falló (el error se avisa aparte).
   */
  saveInteractive(): Observable<Dashboard | null> {
    const data: SaveDashboardDialogData = {
      currentName: this.dashboardState.currentDashboardName(),
      hasCurrentDashboard: !!this.dashboardState.currentDashboardId(),
    };

    return this.dialog
      .open(SaveDashboardDialogComponent, { width: '400px', data })
      .afterClosed()
      .pipe(
        switchMap((result: SaveDashboardDialogResult | undefined) => {
          if (!result) return of(null);
          return from(dashboardHost().save({
            kind: 'gis',
            name: result.name,
            mode: result.mode,
            currentId: this.dashboardState.currentDashboardId(),
          })).pipe(
            tap((dashboard) => this.dashboardState.setCurrentDashboard(dashboard.id, dashboard.name)),
            catchError(() => of(null)),
          );
        }),
      );
  }
}
