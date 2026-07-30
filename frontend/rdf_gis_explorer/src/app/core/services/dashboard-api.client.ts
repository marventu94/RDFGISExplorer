import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import type { Dashboard } from '@rdfgis/contracts';

// Contrato compartido: la fuente de verdad vive en packages/contracts.
export type { Dashboard } from '@rdfgis/contracts';

export interface GisDashboardPayload {
  query: string;
  backend: string;
  layout: {
    slotsCount: 1 | 2 | 3 | 4;
    preset?: 'single' | 'split-h' | 'triple' | 'triple-inv' | 'quad';
    slots: Array<{ id: string; view: 'map' | 'timeline' | 'graph' | 'table' }>;
  };
  filters: {
    table?: {
      quickFilter?: string;
      pageSize?: number;
    };
    timeline?: { rangeStart?: string; rangeEnd?: string };
    map?: { center: [number, number]; zoom: number; activeLayers?: string[] };
    graph?: {
      layout: string;
      pan?: { x: number; y: number };
      zoom?: number;
      manualPositions?: Record<string, { x: number; y: number }>;
    };
  };
  selection?: { selectedIds: string[]; pinnedId?: string };
}

export interface CreateDashboardInput {
  kind: 'gis';
  name: string;
  payload: GisDashboardPayload;
}

export interface UpdateDashboardInput {
  name?: string;
  payload?: GisDashboardPayload;
}

@Injectable({ providedIn: 'root' })
export class DashboardApiClient {
  private readonly http = inject(HttpClient);

  list(): Observable<Dashboard[]> {
    return this.http.get<Dashboard[]>('/api/dashboards');
  }

  get(id: string): Observable<Dashboard> {
    return this.http.get<Dashboard>(`/api/dashboards/${id}`);
  }

  create(input: CreateDashboardInput): Observable<Dashboard> {
    return this.http.post<Dashboard>('/api/dashboards', input);
  }

  update(id: string, input: UpdateDashboardInput): Observable<Dashboard> {
    return this.http.put<Dashboard>(`/api/dashboards/${id}`, input);
  }

  delete(id: string): Observable<void> {
    return this.http.delete<void>(`/api/dashboards/${id}`);
  }
}
