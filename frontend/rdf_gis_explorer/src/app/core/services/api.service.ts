import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, switchMap } from 'rxjs';
import { AppConfigService } from './app-config.service';
import type { QueryResult } from '@shared/models';

@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly http = inject(HttpClient);
  private readonly appConfig = inject(AppConfigService);

  executeQuery(params: { sparql: string; limit?: number }): Observable<QueryResult> {
    if (params.limit !== undefined) {
      return this.post(params.sparql, params.limit);
    }
    // Sin límite explícito: se pide el máximo que publica el backend en
    // /api/config (maxLimit). El volumen se pagina en cliente con los lotes.
    return this.appConfig
      .load()
      .pipe(switchMap((cfg) => this.post(params.sparql, cfg.maxLimit)));
  }

  private post(sparql: string, limit: number): Observable<QueryResult> {
    return this.http.post<QueryResult>('/api/query/execute', { sparql, limit });
  }
}
