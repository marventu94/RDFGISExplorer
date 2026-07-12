import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { signal } from '@angular/core';
import { WorkspacePersistenceService } from './workspace-persistence.service';
import { WorkspaceApiClient, type Dashboard } from './workspace-api.client';
import { PropertyGraphService } from '../graph/property-graph.service';
import { RequestService } from './request.service';

function createMockClient(): WorkspaceApiClient {
  return {
    list: vi.fn(() => of([])),
    get: vi.fn(() => of({} as Dashboard)),
    create: vi.fn(() => of({} as Dashboard)),
    update: vi.fn(() => of({} as Dashboard)),
    delete: vi.fn(() => of(undefined)),
  } as unknown as WorkspaceApiClient;
}

function createMockRequestService(): RequestService {
  return {
    labelCache: signal(new Map()),
    getLabel: vi.fn(),
    setLabel: vi.fn(),
    execQuery: vi.fn(),
    prefetchLabels: vi.fn(),
  } as unknown as RequestService;
}

describe('WorkspacePersistenceService', () => {
  let service: WorkspacePersistenceService;
  let mockClient: WorkspaceApiClient;
  let mockRequest: RequestService;
  let graph: PropertyGraphService;

  beforeEach(() => {
    TestBed.resetTestingModule();
    mockClient = createMockClient();
    mockRequest = createMockRequestService();
    TestBed.configureTestingModule({
      providers: [
        WorkspacePersistenceService,
        PropertyGraphService,
        { provide: WorkspaceApiClient, useValue: mockClient },
        { provide: RequestService, useValue: mockRequest },
      ],
    });
    service = TestBed.inject(WorkspacePersistenceService);
    graph = TestBed.inject(PropertyGraphService);
    // Clear default panel
    service.panels.set([]);
    service.activePanelId.set('');
  });

  it('adds a new panel and switches to it', () => {
    const id = service.addPanel('Panel B');
    expect(service.panels().length).toBe(1);
    expect(service.activePanelId()).toBe(id);
    expect(service.activePanel()?.name).toBe('Panel B');
  });

  it('removes a panel and switches to another', () => {
    service.addPanel('A');
    const idB = service.addPanel('B');
    service.removePanel(idB);
    expect(service.panels().length).toBe(1);
    expect(service.activePanel()?.name).toBe('A');
  });

  it('creates a replacement when the last panel is removed', () => {
    service.panels.set([
      { id: 'p1', name: 'Only', graph: { nodes: [], edges: [] }, generatedQuery: '', variables: [], dirty: false },
    ]);
    service.activePanelId.set('p1');
    service.removePanel('p1');
    expect(service.panels().length).toBe(1);
    expect(service.activePanel()?.name).toBe('Panel 1');
  });

  it('snapshots active panel graph state', () => {
    service.addPanel('Test');
    const n = graph.addNode();
    n.mkVariable();
    n.x = 10;
    n.y = 20;

    service.snapshotActivePanel(graph);
    const panel = service.activePanel();
    expect(panel?.graph.nodes.length).toBeGreaterThan(0);
    expect(panel?.variables.length).toBe(0); // no queries yet
  });

  it('restores active panel graph state', () => {
    service.addPanel('Test');
    const n = graph.addNode();
    n.mkVariable();
    n.x = 10;
    n.y = 20;

    service.snapshotActivePanel(graph);
    graph.reset();
    expect(graph.nodes().length).toBe(0);

    service.restoreActivePanel(graph);
    expect(graph.nodes().length).toBe(1);
    expect(graph.nodes()[0].x).toBe(10);
  });

  it('saves workspace as new via API client', async () => {
    service.addPanel('Test');
    const mockDashboard: Dashboard = {
      id: 'ws-1',
      kind: 'explorer',
      name: 'Mi Workspace',
      payload: {},
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    (mockClient.create as ReturnType<typeof vi.fn>).mockReturnValue(of(mockDashboard));

    const result = await service.saveWorkspace('Mi Workspace');
    expect(result.name).toBe('Mi Workspace');
    expect(mockClient.create).toHaveBeenCalledOnce();
    const callArg = (mockClient.create as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(callArg.kind).toBe('explorer');
    expect(callArg.name).toBe('Mi Workspace');
    expect(callArg.payload.panels.length).toBe(1);
  });

  it('updates existing workspace when overwriteId is provided', async () => {
    service.addPanel('Test');
    const mockDashboard: Dashboard = {
      id: 'ws-1',
      kind: 'explorer',
      name: 'Updated',
      payload: {},
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    (mockClient.update as ReturnType<typeof vi.fn>).mockReturnValue(of(mockDashboard));

    const result = await service.saveWorkspace('Updated', 'ws-1');
    expect(result.name).toBe('Updated');
    expect(mockClient.update).toHaveBeenCalledOnce();
    const [id, arg] = (mockClient.update as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(id).toBe('ws-1');
    expect(arg.name).toBe('Updated');
    expect(arg.payload).toBeDefined();
  });

  it('loads workspace from API and restores panels', async () => {
    const payload = {
      panels: [
        {
          id: 'p1',
          name: 'Panel A',
          graph: { nodes: [], edges: [] },
          generatedQuery: 'SELECT * WHERE {}',
          variables: ['var0'],
        },
      ],
      activePanelId: 'p1',
      settings: {
        endpointType: 'fuseki' as const,
        limit: 50,
      },
    };

    const mockDashboard: Dashboard = {
      id: 'ws-2',
      kind: 'explorer',
      name: 'Loaded',
      payload,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    (mockClient.get as ReturnType<typeof vi.fn>).mockReturnValue(of(mockDashboard));

    await service.loadWorkspace('ws-2');
    expect(service.panels().length).toBe(1);
    expect(service.activePanel()?.name).toBe('Panel A');
    expect(service.activePanel()?.generatedQuery).toBe('SELECT * WHERE {}');
  });

  it('throws when loading a non-explorer dashboard', async () => {
    const mockDashboard: Dashboard = {
      id: 'ws-3',
      kind: 'gis',
      name: 'GIS',
      payload: {},
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    (mockClient.get as ReturnType<typeof vi.fn>).mockReturnValue(of(mockDashboard));

    await expect(service.loadWorkspace('ws-3')).rejects.toThrow('not an explorer workspace');
  });

  it('lists and deletes workspaces via API', () => {
    service.listWorkspaces().subscribe();
    expect(mockClient.list).toHaveBeenCalledOnce();

    service.deleteWorkspace('ws-1').subscribe();
    expect(mockClient.delete).toHaveBeenCalledWith('ws-1');
  });

  it('saves labels from cache into workspace payload', async () => {
    service.addPanel('Test');
    const n = graph.addNode();
    n.mkConst();
    n.addUri('http://example.org/NodeA');
    service.snapshotActivePanel(graph);

    mockRequest.labelCache.set(new Map([['http://example.org/NodeA', 'Node A Label']]));

    const mockDashboard: Dashboard = {
      id: 'ws-labels',
      kind: 'explorer',
      name: 'With Labels',
      payload: {},
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    (mockClient.create as ReturnType<typeof vi.fn>).mockReturnValue(of(mockDashboard));

    await service.saveWorkspace('With Labels');

    const callArg = (mockClient.create as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(callArg.payload.panels[0].labels).toEqual({
      'http://example.org/NodeA': 'Node A Label',
    });
  });

  it('saves property and literal labels into workspace payload', async () => {
    service.addPanel('Test');
    const n = graph.addNode();
    n.mkConst();
    n.addUri('http://example.org/NodeA');
    const prop = n.newProp();
    prop.mkConst();
    prop.addUri('http://example.org/propA');
    service.snapshotActivePanel(graph);

    mockRequest.labelCache.set(new Map([
      ['http://example.org/NodeA', 'Node A Label'],
      ['http://example.org/propA', 'Property A Label'],
    ]));

    const mockDashboard: Dashboard = {
      id: 'ws-labels',
      kind: 'explorer',
      name: 'With Property Labels',
      payload: {},
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    (mockClient.create as ReturnType<typeof vi.fn>).mockReturnValue(of(mockDashboard));

    await service.saveWorkspace('With Property Labels');

    const callArg = (mockClient.create as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(callArg.payload.panels[0].labels).toEqual({
      'http://example.org/NodeA': 'Node A Label',
      'http://example.org/propA': 'Property A Label',
    });
  });

  it('injects persisted labels into cache when restoring active panel', () => {
    service.panels.set([
      {
        id: 'p1',
        name: 'Test',
        graph: { nodes: [], edges: [] },
        generatedQuery: '',
        variables: [],
        dirty: false,
        labels: { 'http://example.org/NodeA': 'Node A Label' },
      },
    ]);
    service.activePanelId.set('p1');

    service.restoreActivePanel(graph);

    expect(mockRequest.setLabel).toHaveBeenCalledWith('http://example.org/NodeA', 'Node A Label');
  });

  it('restores labels for node properties when reloading a panel', () => {
    service.addPanel('Test');
    const n = graph.addNode();
    n.mkConst();
    n.addUri('http://example.org/NodeA');
    const prop = n.newProp();
    prop.mkConst();
    prop.addUri('http://example.org/propA');
    service.snapshotActivePanel(graph);

    // Simulate saved labels in panel state
    service.panels.update(list =>
      list.map(p =>
        p.id === service.activePanelId()
          ? { ...p, labels: { 'http://example.org/NodeA': 'Node A Label', 'http://example.org/propA': 'Property A Label' } }
          : p,
      ),
    );

    // Reset graph
    graph.reset();

    service.restoreActivePanel(graph);

    expect(mockRequest.setLabel).toHaveBeenCalledWith('http://example.org/NodeA', 'Node A Label');
    expect(mockRequest.setLabel).toHaveBeenCalledWith('http://example.org/propA', 'Property A Label');
  });

  it('loads workspace preserving labels in panel state', async () => {
    const payload = {
      panels: [
        {
          id: 'p1',
          name: 'Panel A',
          graph: { nodes: [], edges: [] },
          generatedQuery: 'SELECT * WHERE {}',
          variables: ['var0'],
          labels: { 'http://example.org/NodeA': 'Node A Label' },
        },
      ],
      activePanelId: 'p1',
      settings: {
        endpointType: 'fuseki' as const,
        limit: 50,
      },
    };

    const mockDashboard: Dashboard = {
      id: 'ws-labels',
      kind: 'explorer',
      name: 'Loaded',
      payload,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    (mockClient.get as ReturnType<typeof vi.fn>).mockReturnValue(of(mockDashboard));

    await service.loadWorkspace('ws-labels');
    expect(service.activePanel()?.labels).toEqual({
      'http://example.org/NodeA': 'Node A Label',
    });
  });
});
