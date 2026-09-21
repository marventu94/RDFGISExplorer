import { Injectable, signal } from '@angular/core';
import type { QueryResult } from '@shared/models';
import {
  applyMappingOverrides,
  type VariableRole,
} from '../../features/sparql-input/mapping-overrides.util';

/** Estado compartido del resultado original y su interpretación visual. */
@Injectable({ providedIn: 'root' })
export class VariableMappingService {
  private readonly _sourceResult = signal<QueryResult | null>(null);
  private readonly _overrides = signal<Record<string, VariableRole>>({});

  readonly sourceResult = this._sourceResult.asReadonly();
  readonly overrides = this._overrides.asReadonly();

  setSourceResult(
    result: QueryResult | null,
    overrides: Record<string, VariableRole> = {},
  ): QueryResult | null {
    this._sourceResult.set(result);
    this._overrides.set({ ...overrides });
    return result ? applyMappingOverrides(result, overrides) : null;
  }

  apply(overrides: Record<string, VariableRole>): QueryResult | null {
    this._overrides.set({ ...overrides });
    const source = this._sourceResult();
    return source ? applyMappingOverrides(source, overrides) : null;
  }

  restore(): QueryResult | null {
    this._overrides.set({});
    return this._sourceResult();
  }
}
