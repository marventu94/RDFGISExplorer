import { Injectable, signal } from '@angular/core';
import type { LimitsConfig } from '@rdfgis/contracts';
import { DEFAULT_LOT_SIZE, LOT_SIZE_OPTIONS } from '@shared/stats/lots';

/**
 * Defaults equivalentes a los del backend: valen hasta que llega la config
 * (que carga async, y en el remote puede no llegar nunca si el backend está
 * caído). Mantener alineados con AppConfigService.buildLimits().
 */
export const DEFAULT_LIMITS: LimitsConfig = {
  graphMaxNodes: 300,
  lotDefaultSize: DEFAULT_LOT_SIZE,
  lotSizeOptions: [...LOT_SIZE_OPTIONS],
  tablePageSizeOptions: [50, 100, 200],
  exportMaxRows: 50_000,
  exportMinPageSize: 250,
  summaryTopCategorical: 12,
};

/**
 * Límites de queries y visualización consumidos por las vistas. No depende de
 * HttpClient: arranca con DEFAULT_LIMITS y App lo actualiza cuando llega
 * /api/config (`apply`). Así cualquier TestBed lo resuelve sin providers
 * extra y las vistas siempre tienen valores seguros.
 */
@Injectable({ providedIn: 'root' })
export class LimitsService {
  private readonly _limits = signal<LimitsConfig>(DEFAULT_LIMITS);
  readonly limits = this._limits.asReadonly();

  apply(limits: LimitsConfig): void {
    this._limits.set(limits);
  }
}
