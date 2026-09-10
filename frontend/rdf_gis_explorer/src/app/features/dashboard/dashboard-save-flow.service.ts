import { Injectable, inject } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { Observable, of, switchMap, catchError } from 'rxjs';

import { DashboardPersistenceService } from '@core/services/dashboard-persistence.service';
import type { Dashboard } from '@core/services/dashboard-api.client';
import {
  SaveDashboardDialogComponent,
  type SaveDashboardDialogData,
  type SaveDashboardDialogResult,
} from './save-dashboard-dialog.component';

/**
 * Flujo interactivo de guardado (diálogo + POST/PUT). Vive en un servicio para
 * que lo puedan disparar tanto el botón de la navbar como el aviso previo a
 * reemplazar el tablero con una query importada del RDF Explorer.
 */
@Injectable({ providedIn: 'root' })
export class DashboardSaveFlowService {
  private readonly dialog = inject(MatDialog);
  private readonly persistence = inject(DashboardPersistenceService);

  /**
   * Abre el diálogo de guardado y guarda. Emite el tablero guardado, o `null`
   * si el usuario canceló o el guardado falló (el error se avisa aparte).
   */
  saveInteractive(): Observable<Dashboard | null> {
    const data: SaveDashboardDialogData = {
      currentName: this.persistence.currentDashboardName(),
      hasCurrentDashboard: !!this.persistence.currentDashboardId(),
    };

    return this.dialog
      .open(SaveDashboardDialogComponent, { width: '400px', data })
      .afterClosed()
      .pipe(
        switchMap((result: SaveDashboardDialogResult | undefined) => {
          if (!result) return of(null);
          return this.persistence
            .save(result.name, result.mode)
            .pipe(catchError(() => of(null)));
        }),
      );
  }
}
