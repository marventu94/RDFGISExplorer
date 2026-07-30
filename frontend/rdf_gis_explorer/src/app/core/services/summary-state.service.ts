import { Injectable, signal } from '@angular/core';
import type { QuerySummary } from '@shared/models';

/**
 * Último resumen computado por el panel de resumen. El export completo lo usa
 * para el progreso real ("X de ~N filas") cuando el resultado está truncado:
 * el COUNT ya lo calculó el summary sobre el resultado completo.
 */
@Injectable({ providedIn: 'root' })
export class SummaryStateService {
  private readonly _summary = signal<QuerySummary | null>(null);
  readonly summary = this._summary.asReadonly();

  set(summary: QuerySummary | null): void {
    this._summary.set(summary);
  }
}
