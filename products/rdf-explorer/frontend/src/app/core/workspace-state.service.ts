import { Injectable, signal, computed, inject } from '@angular/core';
import type { ExplorerSerializedGraph } from '../graph/domain/graph-serializer';
import { AppConfigService } from './services/app-config.service';
import { PropertyGraphService } from '../graph/property-graph.service';
import { RequestService } from './request.service';
import { registerDashboardStateAdapter } from '@rdfgis/platform-bridge';

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
  /** Firma interna del último estado cargado/guardado; nunca se persiste. */
  cleanSignature: string;
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

@Injectable({ providedIn: 'root' })
export class WorkspaceStateService {
  private readonly appConfig = inject(AppConfigService);
  private readonly request = inject(RequestService);
  private readonly unregisterAdapter = registerDashboardStateAdapter({
    kind: 'explorer',
    exportPayload: () => this.exportPayload(),
    importPayload: (payload, context) => {
      const workspace = payload as ExplorerWorkspacePayload;
      if (context.mode === 'tabs') this.appendPayloadAsTabs(workspace, context.id, context.name);
      else this.fromPayload(workspace);
    },
    reset: () => this.reset(),
  });

  readonly panels = signal<readonly PanelState[]>([this.newPanel('panel-0', 'Panel 1')]);

  readonly activePanelId = signal<string>('panel-0');

  readonly activePanel = computed<PanelState | undefined>(() => {
    const id = this.activePanelId();
    return this.panels().find(p => p.id === id);
  });

  private panelCounter = 0;
  private isRestoring = false;

  private signature(panel: Pick<PanelState, 'name' | 'graph' | 'generatedQuery' | 'variables'>): string {
    return JSON.stringify({
      name: panel.name,
      graph: panel.graph,
      generatedQuery: panel.generatedQuery,
      variables: panel.variables,
    });
  }

  private newPanel(id: string, name: string): PanelState {
    const state = {
      id,
      name,
      graph: { nodes: [], edges: [] } as ExplorerSerializedGraph,
      generatedQuery: '',
      variables: [] as string[],
    };
    return { ...state, dirty: false, cleanSignature: this.signature(state) };
  }

  private withDirtyState(panel: PanelState): PanelState {
    return { ...panel, dirty: this.signature(panel) !== panel.cleanSignature };
  }

  reset(): void {
    this.panels.set([this.newPanel('panel-0', 'Panel 1')]);
    this.activePanelId.set('panel-0');
    this.panelCounter = 0;
  }

  addPanel(name = `Panel ${this.panels().length + 1}`): string {
    this.panelCounter += 1;
    const id = `panel-${this.panelCounter}`;
    this.panels.update(list => [
      ...list,
      this.newPanel(id, name),
    ]);
    this.activePanelId.set(id);
    return id;
  }

  removePanel(id: string): void {
    this.panels.update(list => {
      const filtered = list.filter(p => p.id !== id);
      if (filtered.length === 0) {
        const newPanel = this.newPanel('panel-0', 'Panel 1');
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
        p.id === activeId ? this.withDirtyState({ ...p, name }) : p,
      ),
    );
  }

  markAllPanelsClean(): void {
    this.panels.update(list => list.map(p => ({
      ...p,
      dirty: false,
      cleanSignature: this.signature(p),
    })));
  }

  setAllPanelsSource(workspaceId: string): void {
    this.panels.update(list =>
      list.map(p => ({ ...p, sourceWorkspaceId: workspaceId })),
    );
  }

  updateActivePanelGraph(graph: ExplorerSerializedGraph, generatedQuery: string, variables: string[]): void {
    if (this.isRestoring) return;
    const activeId = this.activePanelId();
    this.panels.update(list =>
      list.map(p =>
        p.id === activeId ? this.withDirtyState({ ...p, graph, generatedQuery, variables }) : p,
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

  exportPayload(): ExplorerWorkspacePayload {
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
    const mappedPanels: PanelState[] = payload.panels.map(p => {
      const state = {
        id: p.id, name: p.name, graph: p.graph, generatedQuery: p.generatedQuery,
        variables: p.variables ?? [], viewport: p.viewport, labels: p.labels,
      };
      return { ...state, dirty: false, cleanSignature: this.signature(state) };
    });

    this.panels.set(mappedPanels);
    this.activePanelId.set(payload.activePanelId);
  }

  hasWorkspaceOpen(id: string): boolean {
    const existing = this.panels().find(p => p.sourceWorkspaceId === id);
    if (existing) {
      this.activePanelId.set(existing.id);
      return true;
    }
    return false;
  }

  private appendPayloadAsTabs(payload: ExplorerWorkspacePayload, id: string, name: string): void {
    const activePanelIndex = payload.panels.findIndex(p => p.id === payload.activePanelId);

    // Workspace de un solo panel: la pestaña muestra el nombre del tablero
    // (el diálogo de guardado ya sincroniza panel activo ↔ nombre del
    // workspace; esto cubre tableros sembrados o legados con otro nombre).
    const singlePanel = payload.panels.length === 1;

    const newPanels: PanelState[] = payload.panels.map((p) => {
      this.panelCounter += 1;
      const state = {
        id: `panel-${this.panelCounter}`,
        name: singlePanel ? name : p.name,
        graph: p.graph,
        generatedQuery: p.generatedQuery,
        variables: p.variables ?? [],
        viewport: p.viewport,
        sourceWorkspaceId: id,
        labels: p.labels,
      };
      return { ...state, dirty: false, cleanSignature: this.signature(state) };
    });

    this.panels.update(list => [...list, ...newPanels]);

    const newActivePanel = newPanels[activePanelIndex >= 0 ? activePanelIndex : 0];
    if (newActivePanel) {
      this.activePanelId.set(newActivePanel.id);
    }

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
          ? this.withDirtyState({ ...p, graph: snapshot, generatedQuery, variables, viewport: viewport ?? undefined })
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
