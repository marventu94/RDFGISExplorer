import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import type { Dashboard } from './dashboard.model';

@Injectable({ providedIn: 'root' })
export class DashboardApiClient {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = '/api/dashboards';

  getRecent(): Observable<Dashboard[]> {
    // El backend clampa a 50; sin el parámetro el default es 10 y con más de
    // 10 tableros los más viejos desaparecen de la pantalla de bienvenida.
    return this.http.get<Dashboard[]>(`${this.baseUrl}/recent`, { params: { limit: 50 } });
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
