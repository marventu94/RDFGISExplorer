import { Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { Observable, catchError, map, of, switchMap } from 'rxjs';
import { SelectionService } from '@core/services/selection.service';
import { ApiService } from '@core/services/api.service';
import { SparqlQueryStateService } from '@core/services/sparql-query-state.service';
import { SummaryStateService } from '@core/services/summary-state.service';
import { classifyVariables, computeLocalSummary } from '@shared/stats/result-summary';
import type { QueryResult, QuerySummary } from '@shared/models';

/** De dónde salieron los números del resumen. */
export type SummarySource = 'local' | 'backend';

interface ResolvedSummary {
  summary: QuerySummary;
  source: SummarySource;
}

/**
 * Panel de resumen: agregados (total, min/max/avg por variable numérica,
 * rangos temporales, top valores categóricos) computados sobre el RESULTADO
 * COMPLETO de la query — a diferencia de los chips de cobertura, que describen
 * el lote visible.
 *
 * Se recalcula solo cuando llega un QueryResult nuevo (query ejecutada); no
 * reacciona a cambios de lote ni a los filtros de las vistas. Si el resultado
 * no está truncado se computa en el cliente; si está truncado se pide al
 * backend (POST /api/query/summary), que agrega sobre el resultado completo.
 */
@Component({
  selector: 'app-summary-panel',
  standalone: true,
  imports: [MatIconModule, MatProgressSpinnerModule],
  templateUrl: './summary-panel.component.html',
  styleUrl: './summary-panel.component.scss',
})
export class SummaryPanelComponent {
  private readonly selectionService = inject(SelectionService);
  private readonly api = inject(ApiService);
  private readonly queryState = inject(SparqlQueryStateService);
  private readonly summaryState = inject(SummaryStateService);

  protected readonly collapsed = signal(true);
  protected readonly loading = signal(false);
  protected readonly resolved = signal<ResolvedSummary | null>(null);

  constructor() {
    const destroyRef = inject(DestroyRef);
    this.selectionService.queryResult$
      .pipe(
        takeUntilDestroyed(destroyRef),
        switchMap((result) => this.resolveSummary(result)),
      )
      .subscribe((resolved) => {
        this.loading.set(false);
        this.resolved.set(resolved);
        // El export completo usa el COUNT para el progreso real ("X de ~N").
        this.summaryState.set(resolved?.summary ?? null);
      });
  }

  private resolveSummary(result: QueryResult | null): Observable<ResolvedSummary | null> {
    if (!result) return of(null);

    const classification = classifyVariables(result);

    // Sin truncamiento: todas las filas están en el cliente, el resumen se
    // computa localmente sin pegarle al backend.
    if (!result.meta.truncated) {
      return of({ summary: computeLocalSummary(result, classification), source: 'local' });
    }

    // Truncado: las filas en cliente son una muestra; el agregado real lo
    // computa el backend sobre el resultado completo.
    const query = this.queryState.query();
    if (!query) return of(null);

    this.loading.set(true);
    return this.api
      .fetchSummary({
        query,
        numericVars: classification.numeric,
        temporalVars: classification.temporal,
        categoricalVars: classification.categorical,
      })
      .pipe(
        map((summary) => ({ summary, source: 'backend' as const })),
        catchError(() => of(null)),
      );
  }

  protected toggleCollapsed(): void {
    this.collapsed.update((c) => !c);
  }

  /** Etiqueta de la semántica: los números son del resultado completo, no del lote. */
  protected scopeLabel(summary: QuerySummary): string {
    const total = summary.totalRows;
    const rows = total === null ? 'el resultado completo' : `las ${total} filas del resultado completo`;
    const how =
      this.resolved()?.source === 'local'
        ? 'calculado en el navegador'
        : 'calculado en el endpoint';
    return `Resumen ${how} sobre ${rows} (independiente del lote visible y de los filtros)`;
  }

  /** Secciones que no se pudieron computar (degradación elegante del backend). */
  protected failedLabel(summary: QuerySummary): string | null {
    const parts: string[] = [];
    if (summary.failed.total) parts.push('total de filas');
    parts.push(...summary.failed.numeric, ...summary.failed.temporal, ...summary.failed.categorical);
    if (parts.length === 0) return null;
    return `No se pudo calcular: ${parts.join(', ')}`;
  }

  protected formatNumber(n: number | null): string {
    if (n === null) return '—';
    return Number.isInteger(n) ? String(n) : n.toFixed(2);
  }

  protected formatDate(iso: string | null): string {
    if (!iso) return '—';
    const d = new Date(iso);
    return isNaN(d.getTime()) ? iso : d.toLocaleDateString();
  }
}
