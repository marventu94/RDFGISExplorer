import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { AppConfigService } from './services/app-config.service';
import { RequestService } from './request.service';
import { WorkspaceStateService, type ExplorerWorkspacePayload } from './workspace-state.service';
import type { PropertyGraphService } from '../graph/property-graph.service';

describe('WorkspaceStateService dirty state', () => {
  let service: WorkspaceStateService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        WorkspaceStateService,
        { provide: AppConfigService, useValue: { endpointType: () => 'other', resultLimit: () => 500 } },
        { provide: RequestService, useValue: { labelCache: signal(new Map()), setLabel: () => undefined } },
      ],
    });
    service = TestBed.inject(WorkspaceStateService);
  });

  it('does not flag a new untouched panel and tracks changes against the saved baseline', () => {
    expect(service.activePanel()?.dirty).toBe(false);
    service.updateActivePanelGraph(
      { nodes: [{ id: 'node-0', type: 'node', data: {} }], edges: [] },
      'SELECT * WHERE {}',
      ['item'],
    );
    expect(service.activePanel()?.dirty).toBe(true);
    service.markAllPanelsClean();
    expect(service.activePanel()?.dirty).toBe(false);
    service.renameActivePanel('Renamed');
    expect(service.activePanel()?.dirty).toBe(true);
    service.renameActivePanel('Panel 1');
    expect(service.activePanel()?.dirty).toBe(false);
  });

  it('loads panels clean and marks a persisted name change dirty', () => {
    const payload: ExplorerWorkspacePayload = {
      panels: [{
        id: 'saved',
        name: 'Saved panel',
        graph: { nodes: [], edges: [] },
        generatedQuery: '',
        viewport: { zoom: 2, pan: { x: 10, y: 20 } },
      }],
      activePanelId: 'saved',
      settings: { endpointType: 'generic', limit: 500 },
    };
    (service as unknown as { fromPayload(value: ExplorerWorkspacePayload): void }).fromPayload(payload);
    expect(service.activePanel()?.dirty).toBe(false);
    expect(service.activePanel()?.viewport).toEqual({ zoom: 2, pan: { x: 10, y: 20 } });
    service.snapshotActivePanel({
      serializeGraph: () => ({ nodes: [], edges: [] }),
      getQueriesForGraph: () => ({ queries: [], emptyVars: [] }),
      viewport: () => ({ zoom: 7, pan: { x: 80, y: 90 } }),
    } as unknown as PropertyGraphService);
    expect(service.activePanel()?.viewport).toEqual({ zoom: 7, pan: { x: 80, y: 90 } });
    expect(service.activePanel()?.dirty).toBe(false);

    service.updateActivePanelGraph(
      { nodes: [{ id: 'node-1', type: 'node', data: {} }], edges: [] },
      'SELECT * WHERE {}',
      ['item'],
    );
    expect(service.activePanel()?.dirty).toBe(true);

    service.markAllPanelsClean();
    service.renameActivePanel('Changed name');
    expect(service.activePanel()?.dirty).toBe(true);
  });

  it('associates every panel with the workspace that saved them together', () => {
    service.addPanel('Panel 2');
    service.setAllPanelsSource('workspace-123');
    expect(service.panels().map(panel => panel.sourceWorkspaceId)).toEqual([
      'workspace-123',
      'workspace-123',
    ]);
  });

  it('replaces only the untouched initial panel when opening the first workspace', () => {
    const payload: ExplorerWorkspacePayload = {
      panels: [{
        id: 'saved',
        name: 'Legacy short name',
        graph: { nodes: [], edges: [] },
        generatedQuery: '',
      }],
      activePanelId: 'saved',
      settings: { endpointType: 'generic', limit: 500 },
    };

    (service as unknown as {
      appendPayloadAsTabs(value: ExplorerWorkspacePayload, id: string, name: string): void;
    }).appendPayloadAsTabs(payload, 'workspace-1', 'Dashboard name');

    expect(service.panels()).toHaveLength(1);
    expect(service.activePanel()?.name).toBe('Dashboard name');
    expect(service.activePanel()?.sourceWorkspaceId).toBe('workspace-1');
  });

  it('keeps an explicitly created empty panel when a workspace is opened', () => {
    service.addPanel();
    service.removePanel('panel-0');
    const payload: ExplorerWorkspacePayload = {
      panels: [{
        id: 'saved',
        name: 'Saved panel',
        graph: { nodes: [], edges: [] },
        generatedQuery: '',
      }],
      activePanelId: 'saved',
      settings: { endpointType: 'generic', limit: 500 },
    };

    (service as unknown as {
      appendPayloadAsTabs(value: ExplorerWorkspacePayload, id: string, name: string): void;
    }).appendPayloadAsTabs(payload, 'workspace-1', 'Workspace');

    expect(service.panels().map(panel => panel.name)).toEqual(['Panel 2', 'Workspace']);
  });

  it('does not append a workspace twice and focuses its existing panel', () => {
    const payload: ExplorerWorkspacePayload = {
      panels: [{
        id: 'saved',
        name: 'Saved panel',
        graph: { nodes: [], edges: [] },
        generatedQuery: '',
      }],
      activePanelId: 'saved',
      settings: { endpointType: 'generic', limit: 500 },
    };
    const append = (service as unknown as {
      appendPayloadAsTabs(value: ExplorerWorkspacePayload, id: string, name: string): void;
    }).appendPayloadAsTabs.bind(service);

    append(payload, 'workspace-1', 'Workspace');
    service.addPanel('Another panel');
    append(payload, 'workspace-1', 'Workspace');

    expect(service.panels()).toHaveLength(2);
    expect(service.activePanel()?.sourceWorkspaceId).toBe('workspace-1');
  });

  it('keeps one panel open and does not reuse automatic names after closing tabs', () => {
    const secondId = service.addPanel();
    expect(service.activePanel()?.name).toBe('Panel 2');

    service.removePanel(secondId);
    expect(service.activePanel()?.name).toBe('Panel 1');

    service.addPanel();
    expect(service.activePanel()?.name).toBe('Panel 3');
    service.removePanel('panel-0');
    service.removePanel(service.activePanelId());

    expect(service.panels()).toHaveLength(1);
    expect(service.activePanel()?.name).toBe('Panel 4');
  });

  it('publishes a missing viewport before restoring a legacy dashboard graph', () => {
    const payload: ExplorerWorkspacePayload = {
      panels: [{
        id: 'legacy',
        name: 'Legacy panel',
        graph: { nodes: [{ id: 'node-0', type: 'node', data: {} }], edges: [] },
        generatedQuery: '',
      }],
      activePanelId: 'legacy',
      settings: { endpointType: 'generic', limit: 500 },
    };
    (service as unknown as { fromPayload(value: ExplorerWorkspacePayload): void }).fromPayload(payload);

    const calls: string[] = [];
    const viewport = signal<{ zoom: number; pan: { x: number; y: number } } | null>({
      zoom: 3,
      pan: { x: 10, y: 20 },
    });
    const originalSet = viewport.set.bind(viewport);
    viewport.set = (value) => {
      calls.push(`viewport:${value === null ? 'fit' : value.zoom}`);
      originalSet(value);
    };
    const graph = {
      viewport,
      restoreGraph: () => calls.push('graph'),
      serializeGraph: () => payload.panels[0].graph,
    } as unknown as PropertyGraphService;

    service.restoreActivePanel(graph);

    expect(calls).toEqual(['viewport:fit', 'graph']);
    expect(viewport()).toBeNull();
  });

  it('rebases restored runtime IDs without marking a loaded panel dirty', () => {
    const payload: ExplorerWorkspacePayload = {
      panels: [{
        id: 'saved',
        name: 'Saved panel',
        graph: { nodes: [{ id: 'node-8', type: 'node', data: {} }], edges: [] },
        generatedQuery: '',
      }],
      activePanelId: 'saved',
      settings: { endpointType: 'generic', limit: 500 },
    };
    (service as unknown as { fromPayload(value: ExplorerWorkspacePayload): void }).fromPayload(payload);

    service.restoreActivePanel({
      viewport: signal(null),
      restoreGraph: () => undefined,
      serializeGraph: () => ({ nodes: [{ id: 'node-0', type: 'node', data: {} }], edges: [] }),
    } as unknown as PropertyGraphService);

    expect(service.activePanel()?.graph.nodes[0].id).toBe('node-0');
    expect(service.activePanel()?.dirty).toBe(false);
    expect(JSON.parse(service.activePanel()!.cleanSignature).graph.nodes[0].id).toBe('node-0');
  });
});
