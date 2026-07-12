import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import type { Dashboard } from '@rdfgis/contracts';

// Contrato compartido: la fuente de verdad vive en packages/contracts.
export type { Dashboard } from '@rdfgis/contracts';

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
  viewport?: { zoom: number; pan: { x: number; y: number } };
  labels?: Record<string, string>;
}

export interface ExplorerWorkspacePayload {
  panels: Readonly<ExplorerPanelSnapshot[]>;
  activePanelId: string;
  settings: {
    endpointType: 'virtuoso' | 'fuseki' | 'generic';
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

  list(): Observable<Dashboard[]> {
    return this.http.get<Dashboard[]>('/api/dashboards');
  }

  get(id: string): Observable<Dashboard> {
    return this.http.get<Dashboard>(`/api/dashboards/${id}`);
  }

  create(input: CreateExplorerWorkspaceInput): Observable<Dashboard> {
    return this.http.post<Dashboard>('/api/dashboards', input);
  }

  update(id: string, input: UpdateExplorerWorkspaceInput): Observable<Dashboard> {
    return this.http.put<Dashboard>(`/api/dashboards/${id}`, input);
  }

  delete(id: string): Observable<void> {
    return this.http.delete<void>(`/api/dashboards/${id}`);
  }
}
