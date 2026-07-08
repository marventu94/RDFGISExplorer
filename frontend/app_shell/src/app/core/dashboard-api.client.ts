import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import type { Dashboard } from './dashboard.model';

@Injectable({ providedIn: 'root' })
export class DashboardApiClient {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = '/api/dashboards';

  getRecent(): Observable<Dashboard[]> {
    return this.http.get<Dashboard[]>(`${this.baseUrl}/recent`);
  }

  getById(id: string): Observable<Dashboard> {
    return this.http.get<Dashboard>(`${this.baseUrl}/${id}`);
  }

  create(dto: { kind: 'gis' | 'explorer'; name: string; payload: object }): Observable<Dashboard> {
    return this.http.post<Dashboard>(`${this.baseUrl}`, dto);
  }

  delete(id: string): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/${id}`);
  }

  rename(id: string, name: string): Observable<Dashboard> {
    return this.http.put<Dashboard>(`${this.baseUrl}/${id}`, { name });
  }
}
