import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import type { QueryResult } from '@rdfgis/contracts';
import { SelectionService, type LotState } from '@core/services/selection.service';
import { I18nService } from '@core/services/i18n.service';
import type { Filter } from '@shared/models/filter.model';
import { QueryPagingService } from '@core/services/query-paging.service';

export interface FilterScope {
  label: string;
  detail: string;
  partial: boolean;
}

@Component({
  selector: 'app-filter-badges',
  standalone: true,
  templateUrl: './filter-badges.component.html',
  styleUrl: './filter-badges.component.scss',
})
export class FilterBadgesComponent {
  private readonly selectionService = inject(SelectionService);
  private readonly i18n = inject(I18nService);
  private readonly paging = inject(QueryPagingService);

  // Suscripción explícita, como el navbar: toSignal() falla cuando el remoto
  // corre federado (NG0203, el rxjs-interop no comparte contexto de inyección).
  readonly filters = signal<Filter[]>([]);
  private readonly queryResult = signal<QueryResult | null>(null);
  private readonly lotState = signal<LotState | null>(null);

  constructor() {
    const destroyRef = inject(DestroyRef);
    this.selectionService.activeFilters$
      .pipe(takeUntilDestroyed(destroyRef))
      .subscribe((filters) => this.filters.set(filters));
    this.selectionService.queryResult$
      .pipe(takeUntilDestroyed(destroyRef))
      .subscribe((result) => this.queryResult.set(result));
    this.selectionService.lotState$
      .pipe(takeUntilDestroyed(destroyRef))
      .subscribe((lot) => this.lotState.set(lot));
  }

  /** The server-paged path reports the exact full-query scope. */
  readonly scope = computed<FilterScope | null>(() => {
    const result = this.queryResult();
    const lot = this.lotState();
    if (this.filters().length === 0 || !result || !lot || this.paging.busy() || this.paging.error()) return null;
    this.i18n.language();
    const rows = lot.baseTotalRows ?? result.bindings.length;
    const matches = lot.totalRows;
    const partial = lot.baseTotalRows === undefined && result.meta.truncated;
    if (lot.baseTotalRows !== undefined) {
      return {
        label: this.i18n.text(
          matches === 1 ? '{matches} de {rows} filas de la consulta pasa el filtro' : '{matches} de {rows} filas de la consulta pasan el filtro',
          { matches: this.i18n.formatNumber(matches), rows: this.i18n.formatNumber(rows) },
        ),
        detail: this.i18n.text('El filtro se aplica en el endpoint antes de contar y cargar los lotes.'),
        partial: false,
      };
    }
    const label = this.i18n.text(
      matches === 1
        ? '{matches} de {rows} filas recuperadas pasa el filtro'
        : '{matches} de {rows} filas recuperadas pasan el filtro',
      { matches: this.i18n.formatNumber(matches), rows: this.i18n.formatNumber(rows) },
    ) + (partial ? this.i18n.text(' · resultado parcial') : '');
    const detail = [
      this.i18n.text('El filtro se aplica a todas las filas recuperadas (todos los lotes), no solo al lote visible.'),
      ...(partial
        ? [this.i18n.text('El endpoint devolvió un resultado parcial: las filas que no se recuperaron no se evalúan.')]
        : []),
    ].join(' ');
    return { label, detail, partial };
  });

  removeFilter(id: string): void {
    this.selectionService.removeFilter(id);
  }
}
