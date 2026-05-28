import { Injectable, signal, computed, inject } from '@angular/core';
import { firstValueFrom, Observable } from 'rxjs';
import type { ExplorerSerializedGraph } from '../graph/domain/graph-serializer';
import type { ExplorerWorkspacePayload, ExplorerPanelSnapshot, Dashboard } from './workspace-api.client';
import { WorkspaceApiClient } from './workspace-api.client';
import { SettingsService } from './settings.service';
import type { EndpointType } from './settings.types';
import { PropertyGraphService } from '../graph/property-graph.service';

export interface PanelState {
  id: string;
  name: string;
  graph: ExplorerSerializedGraph;
  generatedQuery: string;
  variables: string[];
}

@Injectable({ providedIn: 'root' })
export class WorkspacePersistenceService {
  private readonly api = inject(WorkspaceApiClient);
  private readonly settings = inject(SettingsService);

  readonly panels = signal<readonly PanelState[]>([
    {
      id: 'panel-0',
      name: 'Panel 1',
      graph: { nodes: [], edges: [] },
      generatedQuery: '',
      variables: [],
    },
  ]);

  readonly activePanelId = signal<string>('panel-0');

  readonly activePanel = computed<PanelState | undefined>(() => {
    const id = this.activePanelId();
    return this.panels().find(p => p.id === id);
  });

  private panelCounter = 0;

  addPanel(name = `Panel ${this.panels().length + 1}`): string {
    this.panelCounter += 1;
    const id = `panel-${this.panelCounter}`;
    this.panels.update(list => [
      ...list,
      { id, name, graph: { nodes: [], edges: [] }, generatedQuery: '', variables: [] },
    ]);
    this.activePanelId.set(id);
    return id;
  }

  removePanel(id: string): void {
    this.panels.update(list => {
      const filtered = list.filter(p => p.id !== id);
      if (filtered.length === 0) {
        const newPanel: PanelState = {
          id: 'panel-0',
          name: 'Panel 1',
          graph: { nodes: [], edges: [] },
          generatedQuery: '',
          variables: [],
        };
        this.activePanelId.set(newPanel.id);
        return [newPanel];
      }
      if (this.activePanelId() === id) {
        this.activePanelId.set(filtered[0].id);
      }
      return filtered;
    });
  }

  switchPanel(id: string): void {
    if (this.panels().some(p => p.id === id)) {
      this.activePanelId.set(id);
    }
  }

  renameActivePanel(name: string): void {
    const activeId = this.activePanelId();
    this.panels.update(list =>
      list.map(p =>
        p.id === activeId ? { ...p, name } : p,
      ),
    );
  }

  updateActivePanelGraph(graph: ExplorerSerializedGraph, generatedQuery: string, variables: string[]): void {
    const activeId = this.activePanelId();
    this.panels.update(list =>
      list.map(p =>
        p.id === activeId ? { ...p, graph, generatedQuery, variables } : p,
      ),
    );
  }

  private mapEndpointType(type: EndpointType): 'virtuoso' | 'fuseki' | 'generic' {
    return type === 'virtuoso' || type === 'fuseki' ? type : 'generic';
  }

  private toPayload(): ExplorerWorkspacePayload {
    const app = this.settings.app();
    const payloadPanels: ExplorerPanelSnapshot[] = this.panels().map(p => ({
      id: p.id,
      name: p.name,
      graph: p.graph,
      generatedQuery: p.generatedQuery,
      variables: p.variables,
    }));

    return {
      panels: payloadPanels,
      activePanelId: this.activePanelId(),
      settings: {
        endpointType: this.mapEndpointType(app.endpoint.type),
        backendMode: app.backendMode,
        limit: app.resultLimit,
      },
    };
  }

  private fromPayload(payload: ExplorerWorkspacePayload): void {
    const mappedPanels: PanelState[] = payload.panels.map(p => ({
      id: p.id,
      name: p.name,
      graph: p.graph,
      generatedQuery: p.generatedQuery,
      variables: p.variables ?? [],
    }));

    this.panels.set(mappedPanels);
    this.activePanelId.set(payload.activePanelId);

    this.settings.update('endpoint', {
      ...this.settings.app().endpoint,
      type: payload.settings.endpointType as EndpointType,
    });
    this.settings.update('backendMode', payload.settings.backendMode);
    this.settings.update('resultLimit', payload.settings.limit);
  }

  async saveWorkspace(name: string, overwriteId?: string): Promise<Dashboard> {
    const payload = this.toPayload();

    if (overwriteId) {
      return firstValueFrom(this.api.update(overwriteId, { name, payload }));
    }

    return firstValueFrom(this.api.create({ kind: 'explorer', name, payload }));
  }

  async loadWorkspace(id: string): Promise<void> {
    const dashboard = await firstValueFrom(this.api.get(id));
    if (dashboard.kind !== 'explorer') {
      throw new Error(`Dashboard ${id} is not an explorer workspace`);
    }
    this.fromPayload(dashboard.payload as ExplorerWorkspacePayload);
  }

  listWorkspaces(): Observable<Dashboard[]> {
    return this.api.list();
  }

  deleteWorkspace(id: string): Observable<void> {
    return this.api.delete(id);
  }

  snapshotActivePanel(graph: PropertyGraphService): void {
    const activeId = this.activePanelId();
    const snapshot = graph.serializeGraph();
    const queries = graph.getQueriesForGraph();
    const generatedQuery = queries.queries.map(q => q.toSparql()).filter(Boolean).join('\n');
    const variables = queries.queries.flatMap(q => q.select.map(r => String(r.variable)));
    this.panels.update(list =>
      list.map(p =>
        p.id === activeId
          ? { ...p, graph: snapshot, generatedQuery, variables }
          : p,
      ),
    );
  }

  restoreActivePanel(graph: PropertyGraphService): void {
    const panel = this.activePanel();
    if (!panel) return;
    graph.restoreGraph(panel.graph);
  }
}
