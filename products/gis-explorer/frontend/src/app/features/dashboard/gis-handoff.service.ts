import { Injectable, inject } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';

import { QueryHandoffService, getAutoRunHandoff } from '@core/services/query-handoff.service';
import { DashboardStateService } from '@core/services/dashboard-state.service';
import { GisSessionStateService } from '@core/services/gis-session-state.service';
import { ErrorDialogComponent } from '@features/sparql-input/error-dialog.component';
import { DashboardSaveFlowService } from './dashboard-save-flow.service';
import { I18nService } from '@core/services/i18n.service';
import {
  OverwriteDashboardDialogComponent,
  type OverwriteDashboardAction,
  type OverwriteDashboardDialogData,
} from './overwrite-dashboard-dialog.component';

/** Lo mínimo que necesita el handoff del editor SPARQL. */
export interface HandoffTarget {
  setQuery(query: string): void;
  setBackend(backend: string): void;
  execute(options?: { configureLayout?: boolean }): void;
}

/** Espera a que el editor esté montado antes de ejecutar la query importada. */
const AUTO_RUN_DELAY_MS = 300;

/**
 * Consume el handoff del RDF Explorer sobre el tablero abierto.
 *
 * Una query importada reemplaza consulta + layout + filtros, así que antes de
 * aplicarla se avisa qué se está por perder y se ofrece guardar. El aviso se
 * saltea si el Explorer ya lo mostró (`overwriteConfirmed`) o si no hay nada
 * que perder.
 */
@Injectable({ providedIn: 'root' })
export class GisHandoffService {
  private readonly handoff = inject(QueryHandoffService);
  private readonly dashboardState = inject(DashboardStateService);
  private readonly sessionState = inject(GisSessionStateService);
  private readonly saveFlow = inject(DashboardSaveFlowService);
  private readonly dialog = inject(MatDialog);
  private readonly snackBar = inject(MatSnackBar);
  private readonly i18n = inject(I18nService);

  /**
   * Hay algo que perder: un tablero abierto o una consulta que no es la de la
   * última importación (misma regla que publica el canal para el Explorer).
   */
  hasWorkToLose(): boolean {
    return this.sessionState.hasWorkAtRisk();
  }

  consumeInto(target: HandoffTarget): void {
    const payload = this.handoff.peek();

    if (!payload) {
      this.dialog.open(ErrorDialogComponent, {
        width: '480px',
        data: {
          title: this.i18n.text('No se encontró la query a importar'),
          message: this.i18n.text('El traspaso desde el RDF Explorer venció (dura 5 minutos) o se abrió esta vista en otra pestaña. Volvé al Explorer y apretá "Explorar en GIS" de nuevo.'),
        },
      });
      return;
    }

    if (payload.overwriteConfirmed || !this.hasWorkToLose()) {
      this.apply(target);
      return;
    }

    const data: OverwriteDashboardDialogData = {
      dashboardName: this.dashboardState.currentDashboardName(),
    };

    this.dialog
      .open(OverwriteDashboardDialogComponent, { width: '520px', data })
      .afterClosed()
      .subscribe((action: OverwriteDashboardAction | undefined) => {
        if (action === 'replace') {
          this.apply(target);
          return;
        }

        if (action === 'save-first') {
          this.saveFlow.saveInteractive().subscribe((saved) => {
            if (saved) {
              this.apply(target);
              return;
            }
            this.discard(this.i18n.text('No se guardó nada, así que no se importó nada.'));
          });
          return;
        }

        this.discard(this.i18n.text('Importación descartada: el tablero quedó como estaba.'));
      });
  }

  private apply(target: HandoffTarget): void {
    const payload = this.handoff.consume();
    if (!payload) return;

    // La vista importada es una vista NUEVA: si siguiera apuntando al tablero
    // que estaba abierto, "Guardar" lo sobrescribiría con la query importada.
    this.dashboardState.clearCurrent();
    this.sessionState.markImported(payload.query);

    target.setQuery(payload.query);
    target.setBackend(payload.backend);

    if (getAutoRunHandoff()) {
      setTimeout(() => target.execute({ configureLayout: true }), AUTO_RUN_DELAY_MS);
    } else {
      this.snackBar.open(
        this.i18n.text('Query importada del RDF Explorer. Apretá Ejecutar para correrla.'),
        this.i18n.text('Aceptar'),
        { duration: 6000 },
      );
    }
  }

  private discard(message: string): void {
    this.handoff.consume();
    this.snackBar.open(message, this.i18n.text('Aceptar'), { duration: 6000 });
  }
}
