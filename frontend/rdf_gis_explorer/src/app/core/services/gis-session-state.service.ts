import { Injectable, computed, effect, inject, signal } from '@angular/core';

import { DashboardPersistenceService } from './dashboard-persistence.service';
import { SparqlQueryStateService } from './sparql-query-state.service';
import { publishGisSessionState } from './gis-session-channel';

/**
 * Qué hay abierto en el GIS, publicado en el canal compartido para que el RDF
 * Explorer pueda avisar antes de pisarlo con un handoff.
 * Se instancia una sola vez desde el componente raíz del GIS.
 */
@Injectable({ providedIn: 'root' })
export class GisSessionStateService {
  private readonly persistence = inject(DashboardPersistenceService);
  private readonly queryState = inject(SparqlQueryStateService);

  /** Query que dejó la última importación del Explorer (si sigue tal cual). */
  private readonly importedQuery = signal<string | null>(null);

  /**
   * Hay algo que perder si entra una importación:
   *  - un tablero guardado abierto (sus cambios sin guardar se van), o
   *  - una consulta en pantalla que NO es la de la última importación.
   * Una vista que es exactamente el último handoff no cuenta: se regenera
   * exportando otra vez, y avisar en cada re-export vacía el aviso de sentido.
   */
  readonly hasWorkAtRisk = computed(() => {
    if (this.persistence.currentDashboardId() !== null) return true;
    const query = this.queryState.query().trim();
    if (query.length === 0) return false;
    return query !== (this.importedQuery() ?? '');
  });

  constructor() {
    effect(() => {
      publishGisSessionState({
        dashboardId: this.persistence.currentDashboardId(),
        dashboardName: this.persistence.currentDashboardName(),
        hasWorkAtRisk: this.hasWorkAtRisk(),
        updatedAt: new Date().toISOString(),
      });
    });
  }

  /** La vista actual es una importación del Explorer todavía sin tocar. */
  markImported(query: string): void {
    this.importedQuery.set(query.trim());
  }
}
