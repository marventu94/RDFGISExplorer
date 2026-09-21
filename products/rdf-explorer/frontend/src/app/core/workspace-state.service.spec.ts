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
});
