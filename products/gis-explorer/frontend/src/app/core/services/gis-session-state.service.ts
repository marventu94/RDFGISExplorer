import { Injectable, computed, effect, inject } from '@angular/core';

import { DashboardStateService } from './dashboard-state.service';
import { SparqlQueryStateService } from './sparql-query-state.service';
import { publishGisSessionState } from './gis-session-channel';

/**
 * Qué hay abierto en el GIS, publicado en el canal compartido para que el RDF
 * Explorer pueda avisar antes de pisarlo con un handoff.
 * Se instancia una sola vez desde el componente raíz del GIS.
 */
@Injectable({ providedIn: 'root' })
export class GisSessionStateService {
  private readonly dashboardState = inject(DashboardStateService);
  private readonly queryState = inject(SparqlQueryStateService);

  /**
   * Hay algo que perder si entra una importación:
   *  - un tablero guardado abierto (sus cambios sin guardar se van), o
   *  - cualquier consulta ejecutada, aunque el tablero todavía no esté guardado.
   */
  readonly hasWorkAtRisk = computed(() => {
    if (this.dashboardState.currentDashboardId() !== null) return true;
    return this.queryState.query().trim().length > 0;
  });

  constructor() {
    effect(() => {
      publishGisSessionState({
        dashboardId: this.dashboardState.currentDashboardId(),
        dashboardName: this.dashboardState.currentDashboardName(),
        hasWorkAtRisk: this.hasWorkAtRisk(),
        updatedAt: new Date().toISOString(),
      });
    });
  }

}
