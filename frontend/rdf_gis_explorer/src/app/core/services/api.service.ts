import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import type { QueryResult } from '@shared/models';

@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly http = inject(HttpClient);

  executeQuery(params: { sparql: string; limit?: number }): Observable<QueryResult> {
    return this.http.post<QueryResult>('/api/query/execute', {
      sparql: params.sparql,
      limit: params.limit ?? 500,
    });
  }
}
