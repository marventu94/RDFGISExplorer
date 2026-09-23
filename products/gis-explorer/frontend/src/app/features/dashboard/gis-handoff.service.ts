import { Injectable, inject } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';

import { QueryHandoffService, getAutoRunHandoff } from '@core/services/query-handoff.service';
import { DashboardStateService } from '@core/services/dashboard-state.service';
import { DashboardLayoutService } from '@core/services/dashboard-layout.service';
import { DashboardViewStateService } from '@core/services/dashboard-view-state.service';
import { GisSessionStateService } from '@core/services/gis-session-state.service';
import { SelectionService } from '@core/services/selection.service';
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
  execute(options?: { configureLayout?: boolean; showLoadProgress?: boolean }): void;
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
  private readonly dashboardLayout = inject(DashboardLayoutService);
  private readonly viewState = inject(DashboardViewStateService);
  private readonly sessionState = inject(GisSessionStateService);
  private readonly selection = inject(SelectionService);
  private readonly saveFlow = inject(DashboardSaveFlowService);
  private readonly dialog = inject(MatDialog);
  private readonly snackBar = inject(MatSnackBar);
  private readonly i18n = inject(I18nService);

  /** Hay algo que perder: un tablero abierto o cualquier consulta ejecutada. */
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

    // A handoff starts a new GIS view: discard the previous graph camera and
    // use the dedicated graph-right / map-and-timeline-left arrangement.
    this.dashboardLayout.applyRdfHandoffLayout();
    this.viewState.resetGraphLayout('dagre');
    // Clear the previous result before requesting the fit. Otherwise an open
    // map can consume the new fit revision while re-rendering the old result,
    // leaving the imported result at the previous dashboard's zoom.
    this.selection.setQueryResult(null);
    this.viewState.requestMapViewportFit();

    target.setQuery(payload.query);
    target.setBackend(payload.backend);

    if (getAutoRunHandoff()) {
      this.dashboardState.beginQueryLoad();
      setTimeout(() => target.execute({ showLoadProgress: true }), AUTO_RUN_DELAY_MS);
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
