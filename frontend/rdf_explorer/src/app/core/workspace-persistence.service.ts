import { Injectable, signal, computed, inject } from '@angular/core';
import { firstValueFrom, Observable } from 'rxjs';
import type { ExplorerSerializedGraph } from '../graph/domain/graph-serializer';
import type { ExplorerWorkspacePayload, ExplorerPanelSnapshot, Dashboard } from './workspace-api.client';
import { WorkspaceApiClient } from './workspace-api.client';
import { AppConfigService } from './services/app-config.service';
import { PropertyGraphService } from '../graph/property-graph.service';
import { RequestService } from './request.service';

export interface PanelState {
  id: string;
  name: string;
  graph: ExplorerSerializedGraph;
  generatedQuery: string;
  variables: string[];
  dirty: boolean;
  sourceWorkspaceId?: string;
  viewport?: { zoom: number; pan: { x: number; y: number } };
  labels?: Record<string, string>;
}

@Injectable({ providedIn: 'root' })
export class WorkspacePersistenceService {
  private readonly api = inject(WorkspaceApiClient);
  private readonly appConfig = inject(AppConfigService);
  private readonly request = inject(RequestService);

  readonly panels = signal<readonly PanelState[]>([
    {
      id: 'panel-0',
      name: 'Panel 1',
      graph: { nodes: [], edges: [] },
      generatedQuery: '',
      variables: [],
      dirty: true,
    },
  ]);

  readonly activePanelId = signal<string>('panel-0');

  readonly activePanel = computed<PanelState | undefined>(() => {
    const id = this.activePanelId();
    return this.panels().find(p => p.id === id);
  });

  private panelCounter = 0;
  private isRestoring = false;

  reset(): void {
    this.panels.set([{
      id: 'panel-0',
      name: 'Panel 1',
      graph: { nodes: [], edges: [] },
      generatedQuery: '',
      variables: [],
      dirty: true,
    }]);
    this.activePanelId.set('panel-0');
    this.panelCounter = 0;
  }

  addPanel(name = `Panel ${this.panels().length + 1}`): string {
    this.panelCounter += 1;
    const id = `panel-${this.panelCounter}`;
    this.panels.update(list => [
      ...list,
      { id, name, graph: { nodes: [], edges: [] }, generatedQuery: '', variables: [], dirty: true },
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
          dirty: true,
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

  markActivePanelClean(): void {
    const activeId = this.activePanelId();
    this.panels.update(list =>
      list.map(p => p.id === activeId ? { ...p, dirty: false } : p),
    );
  }

  setActivePanelSource(workspaceId: string): void {
    const activeId = this.activePanelId();
    this.panels.update(list =>
      list.map(p => p.id === activeId ? { ...p, sourceWorkspaceId: workspaceId } : p),
    );
  }

  markActivePanelDirty(): void {
    const activeId = this.activePanelId();
    this.panels.update(list =>
      list.map(p => p.id === activeId ? { ...p, dirty: true } : p),
    );
  }

  updateActivePanelGraph(graph: ExplorerSerializedGraph, generatedQuery: string, variables: string[]): void {
    if (this.isRestoring) return;
    const activeId = this.activePanelId();
    this.panels.update(list =>
      list.map(p =>
        p.id === activeId ? { ...p, graph, generatedQuery, variables, dirty: true } : p,
      ),
    );
  }

  private mapEndpointType(type: 'virtuoso' | 'fuseki' | 'other'): 'virtuoso' | 'fuseki' | 'generic' {
    return type === 'virtuoso' || type === 'fuseki' ? type : 'generic';
  }

  private collectUrisFromSnapshot(graph: ExplorerSerializedGraph): Set<string> {
    const uris = new Set<string>();
    for (const node of graph.nodes) {
      const data = node.data as { isVar?: boolean; uris?: string[] };
      if (data.isVar) continue;
      for (const uri of data.uris ?? []) {
        uris.add(uri);
      }
    }
    return uris;
  }

  private buildLabelsForSnapshot(graph: ExplorerSerializedGraph): Record<string, string> {
    const cache = this.request.labelCache();
    const uris = this.collectUrisFromSnapshot(graph);
    const labels: Record<string, string> = {};
    for (const uri of uris) {
      const label = cache.get(uri);
      if (label !== undefined) {
        labels[uri] = label;
      }
    }
    return labels;
  }

  private toPayload(): ExplorerWorkspacePayload {
    const endpointType = this.appConfig.endpointType();
    const limit = this.appConfig.resultLimit();
    const payloadPanels: ExplorerPanelSnapshot[] = this.panels().map(p => ({
      id: p.id,
      name: p.name,
      graph: p.graph,
      generatedQuery: p.generatedQuery,
      variables: p.variables,
      viewport: p.viewport,
      labels: this.buildLabelsForSnapshot(p.graph),
    }));

    return {
      panels: payloadPanels,
      activePanelId: this.activePanelId(),
      settings: {
        endpointType: this.mapEndpointType(endpointType),
        limit,
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
      dirty: false,
      viewport: p.viewport,
      labels: p.labels,
    }));

    this.panels.set(mappedPanels);
    this.activePanelId.set(payload.activePanelId);
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

  async loadWorkspaceAsTabs(id: string): Promise<boolean> {
    const existing = this.panels().find(p => p.sourceWorkspaceId === id);
    if (existing) {
      this.activePanelId.set(existing.id);
      return false;
    }

    const dashboard = await firstValueFrom(this.api.get(id));
    if (dashboard.kind !== 'explorer') {
      throw new Error(`Dashboard ${id} is not an explorer workspace`);
    }
    const payload = dashboard.payload as ExplorerWorkspacePayload;

    const activePanelIndex = payload.panels.findIndex(p => p.id === payload.activePanelId);

    // Workspace de un solo panel: la pestaña muestra el nombre del tablero
    // (el diálogo de guardado ya sincroniza panel activo ↔ nombre del
    // workspace; esto cubre tableros sembrados o legados con otro nombre).
    const singlePanel = payload.panels.length === 1;

    const newPanels: PanelState[] = payload.panels.map((p) => {
      this.panelCounter += 1;
      return {
        id: `panel-${this.panelCounter}`,
        name: singlePanel ? dashboard.name : p.name,
        graph: p.graph,
        generatedQuery: p.generatedQuery,
        variables: p.variables ?? [],
        dirty: false,
        sourceWorkspaceId: id,
        labels: p.labels,
      };
    });

    this.panels.update(list => [...list, ...newPanels]);

    const newActivePanel = newPanels[activePanelIndex >= 0 ? activePanelIndex : 0];
    if (newActivePanel) {
      this.activePanelId.set(newActivePanel.id);
    }

    return true;
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
    const viewport = graph.viewport();
    this.panels.update(list =>
      list.map(p =>
        p.id === activeId
          ? { ...p, graph: snapshot, generatedQuery, variables, viewport: viewport ?? undefined }
          : p,
      ),
    );
  }

  restoreActivePanel(graph: PropertyGraphService): void {
    const panel = this.activePanel();
    if (!panel) return;
    this.isRestoring = true;

    if (panel.labels) {
      for (const [uri, label] of Object.entries(panel.labels)) {
        this.request.setLabel(uri, label);
      }
    }

    graph.restoreGraph(panel.graph);
    if (panel.viewport) {
      graph.viewport.set(panel.viewport);
    }
    this.isRestoring = false;
  }
}
