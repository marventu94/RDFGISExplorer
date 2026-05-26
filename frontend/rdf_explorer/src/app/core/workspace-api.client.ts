import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface Dashboard {
  id: string;
  kind: 'gis' | 'explorer';
  name: string;
  payload: object;
  createdAt: string;
  updatedAt: string;
}

export interface ExplorerSerializedGraph {
  nodes: Array<{ id: string; type: string; data: Record<string, unknown> }>;
  edges: Array<{ id: string; source: string; target: string; data: Record<string, unknown> }>;
}

export interface ExplorerPanelSnapshot {
  id: string;
  name: string;
  graph: ExplorerSerializedGraph;
  generatedQuery: string;
  variables?: string[];
}

export interface ExplorerWorkspacePayload {
  panels: Readonly<ExplorerPanelSnapshot[]>;
  activePanelId: string;
  settings: {
    endpointType: 'virtuoso' | 'fuseki' | 'generic';
    backendMode: 'app-backend' | 'direct';
    limit: number;
  };
}

export interface CreateExplorerWorkspaceInput {
  kind: 'explorer';
  name: string;
  payload: ExplorerWorkspacePayload;
}

export interface UpdateExplorerWorkspaceInput {
  name?: string;
  payload?: ExplorerWorkspacePayload;
}

@Injectable({ providedIn: 'root' })
export class WorkspaceApiClient {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = 'http://localhost:3000';

  list(): Observable<Dashboard[]> {
    return this.http.get<Dashboard[]>(`${this.baseUrl}/api/dashboards`);
  }

  get(id: string): Observable<Dashboard> {
    return this.http.get<Dashboard>(`${this.baseUrl}/api/dashboards/${id}`);
  }

  create(input: CreateExplorerWorkspaceInput): Observable<Dashboard> {
    return this.http.post<Dashboard>(`${this.baseUrl}/api/dashboards`, input);
  }

  update(id: string, input: UpdateExplorerWorkspaceInput): Observable<Dashboard> {
    return this.http.put<Dashboard>(`${this.baseUrl}/api/dashboards/${id}`, input);
  }

  delete(id: string): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/api/dashboards/${id}`);
  }
}
