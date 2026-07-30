import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, switchMap } from 'rxjs';
import { AppConfigService } from './app-config.service';
import type { QueryResult, QuerySummary, SummaryRequest } from '@shared/models';

@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly http = inject(HttpClient);
  private readonly appConfig = inject(AppConfigService);

  executeQuery(params: {
    sparql: string;
    limit?: number;
    /** Modo crudo (export): el backend devuelve solo bindings, sin grafo. */
    raw?: boolean;
  }): Observable<QueryResult> {
    if (params.limit !== undefined) {
      return this.post(params.sparql, params.limit, params.raw);
    }
    // Sin límite explícito: se pide el máximo que publica el backend en
    // /api/config (maxLimit). El volumen se pagina en cliente con los lotes.
    return this.appConfig
      .load()
      .pipe(switchMap((cfg) => this.post(params.sparql, cfg.maxLimit, params.raw)));
  }

  /**
   * Resumen agregado del resultado COMPLETO de la query (lo computa el backend
   * envolviendo la query como subquery). Se usa cuando el resultado está
   * truncado y el cliente solo tiene una muestra.
   */
  fetchSummary(params: SummaryRequest): Observable<QuerySummary> {
    return this.http.post<QuerySummary>('/api/query/summary', params);
  }

  private post(sparql: string, limit: number, raw?: boolean): Observable<QueryResult> {
    return this.http.post<QueryResult>('/api/query/execute', {
      sparql,
      limit,
      ...(raw ? { raw } : {}),
    });
  }
}
