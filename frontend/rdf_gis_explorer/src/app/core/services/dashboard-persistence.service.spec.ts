import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { MatSnackBarModule } from '@angular/material/snack-bar';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';

import { DashboardPersistenceService } from './dashboard-persistence.service';
import { type GisDashboardPayload } from './dashboard-api.client';
import { DashboardLayoutService } from './dashboard-layout.service';
import { SelectionService } from './selection.service';
import { SparqlQueryStateService } from './sparql-query-state.service';
import { DashboardViewStateService } from './dashboard-view-state.service';
import type { QueryResult, NormalizedNode } from '@shared/models';

function makeNode(overrides: Partial<NormalizedNode> = {}): NormalizedNode {
  return {
    uri: 'http://example.org/node/1',
    label: 'Node 1',
    attributes: {},
    ...overrides,
  };
}

function makeQueryResult(overrides: Partial<QueryResult> = {}): QueryResult {
  return {
    variables: ['s', 'p', 'o'],
    bindings: [],
    nodes: [],
    edges: [],
    meta: {
      durationMs: 100,
      truncated: false,
      limitApplied: 500,
      backend: 'wikidata',
    },
    ...overrides,
  };
}

describe('DashboardPersistenceService', () => {
  let service: DashboardPersistenceService;
  let layout: DashboardLayoutService;
  let selection: SelectionService;
  let queryState: SparqlQueryStateService;
  let viewState: DashboardViewStateService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [MatSnackBarModule, NoopAnimationsModule],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    });

    service = TestBed.inject(DashboardPersistenceService);
    layout = TestBed.inject(DashboardLayoutService);
    selection = TestBed.inject(SelectionService);
    queryState = TestBed.inject(SparqlQueryStateService);
    viewState = TestBed.inject(DashboardViewStateService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  describe('serialize', () => {
    it('should produce a frozen payload with default state', () => {
      const payload = service.serialize();
      expect(payload.query).toBe('');
      expect(payload.backend).toBe('wikidata');
      expect(payload.layout.slotsCount).toBe(4);
      expect(payload.layout.slots.length).toBe(4);
      expect(Object.isFrozen(payload)).toBe(true);
    });

    it('should include query and backend from SparqlQueryStateService', () => {
      queryState.query.set('SELECT * WHERE { ?s ?p ?o }');
      queryState.backend.set('millenniumdb');

      const payload = service.serialize();
      expect(payload.query).toBe('SELECT * WHERE { ?s ?p ?o }');
      expect(payload.backend).toBe('millenniumdb');
    });

    it('should reflect current layout configuration', () => {
      layout.setLayout('triple');
      layout.setSlot(0, 'map');
      layout.setSlot(1, 'table');

      const payload = service.serialize();
      expect(payload.layout.slotsCount).toBe(3);
      expect(payload.layout.slots[0].view).toBe('map');
      expect(payload.layout.slots[1].view).toBe('table');
    });

    it('should include view states when present', () => {
      viewState.mapState.set({ center: [10, 20], zoom: 8, activeLayers: ['osm'] });
      viewState.timelineState.set({ rangeStart: '2020-01-01', rangeEnd: '2020-12-31' });
      viewState.graphState.set({ layout: 'dagre' });
      viewState.tableState.set({ quickFilter: 'test', pageSize: 100 });

      const payload = service.serialize();
      expect(payload.filters.map).toEqual({ center: [10, 20], zoom: 8, activeLayers: ['osm'] });
      expect(payload.filters.timeline).toEqual({ rangeStart: '2020-01-01', rangeEnd: '2020-12-31' });
      expect(payload.filters.graph).toEqual({ layout: 'dagre' });
      expect(payload.filters.table).toEqual({ quickFilter: 'test', pageSize: 100 });
    });

    it('should include selection when focus is active', () => {
      const node = makeNode({ uri: 'urn:a' });
      selection.setQueryResult(makeQueryResult({ nodes: [node] }));
      selection.setFocus(['urn:a', 'urn:b'], 'map');

      const payload = service.serialize();
      expect(payload.selection).toBeDefined();
      expect(payload.selection!.selectedIds).toContain('urn:a');
      expect(payload.selection!.selectedIds).toContain('urn:b');
    });

    it('should include pinnedId when a node is selected', () => {
      const node = makeNode({ uri: 'urn:pinned' });
      selection.setQueryResult(makeQueryResult({ nodes: [node] }));
      selection.select(node, 'table');

      const payload = service.serialize();
      expect(payload.selection).toBeDefined();
      expect(payload.selection!.pinnedId).toBe('urn:pinned');
    });
  });

  describe('deserialize', () => {
    it('should restore query and layout state', () => {
      const payload: GisDashboardPayload = {
        query: 'SELECT ?s WHERE { ?s a <http://example.org/City> }',
        backend: 'millenniumdb',
        layout: {
          slotsCount: 2,
          slots: [
            { id: 'slot-0', view: 'map' },
            { id: 'slot-1', view: 'table' },
          ],
        },
        filters: {},
      };

      const mockResult = makeQueryResult({
        nodes: [makeNode({ uri: 'urn:city1' })],
      });

      let completed = false;
      service.deserialize(payload).subscribe(() => {
        completed = true;
      });

      const req = httpMock.expectOne('http://localhost:3000/query/execute');
      expect(req.request.body).toEqual({ sparql: payload.query, limit: 500 });
      req.flush(mockResult);

      expect(completed).toBe(true);
      expect(queryState.query()).toBe(payload.query);
      expect(queryState.backend()).toBe('millenniumdb');
      expect(layout.preset()).toBe('split-h');
      expect(layout.slots()[0]).toBe('map');
    });

    it('should restore view states', () => {
      const payload: GisDashboardPayload = {
        query: 'SELECT * WHERE { ?s ?p ?o }',
        backend: 'wikidata',
        layout: { slotsCount: 1, slots: [{ id: 'slot-0', view: 'map' }] },
        filters: {
          map: { center: [-34.6, -58.4], zoom: 12 },
          timeline: { rangeStart: '2021-01-01', rangeEnd: '2021-12-31' },
          graph: { layout: 'circle' },
          table: { quickFilter: 'filter', pageSize: 200 },
        },
      };

      let completed = false;
      service.deserialize(payload).subscribe(() => {
        completed = true;
      });

      httpMock.expectOne('http://localhost:3000/query/execute').flush(makeQueryResult());

      expect(completed).toBe(true);
      expect(viewState.mapState()).toEqual({ center: [-34.6, -58.4], zoom: 12 });
      expect(viewState.timelineState()).toEqual({ rangeStart: '2021-01-01', rangeEnd: '2021-12-31' });
      expect(viewState.graphState()).toEqual({ layout: 'circle' });
      expect(viewState.tableState()).toEqual({ quickFilter: 'filter', pageSize: 200 });
    });

    it('should restore selection after query execution', () => {
      const node = makeNode({ uri: 'urn:selected' });
      const payload: GisDashboardPayload = {
        query: 'SELECT * WHERE { ?s ?p ?o }',
        backend: 'wikidata',
        layout: { slotsCount: 1, slots: [{ id: 'slot-0', view: 'table' }] },
        filters: {},
        selection: {
          selectedIds: ['urn:selected'],
          pinnedId: 'urn:selected',
        },
      };

      const mockResult = makeQueryResult({ nodes: [node] });

      let completed = false;
      service.deserialize(payload).subscribe(() => {
        completed = true;
      });

      httpMock.expectOne('http://localhost:3000/query/execute').flush(mockResult);

      expect(completed).toBe(true);
      const selected = selection.getSelectedNodeSnapshot();
      expect(selected.node?.uri).toBe('urn:selected');
    });

    it('should set isHydrating during execution and clear on success', () => {
      const payload: GisDashboardPayload = {
        query: 'SELECT * WHERE { ?s ?p ?o }',
        backend: 'wikidata',
        layout: { slotsCount: 1, slots: [{ id: 'slot-0', view: 'table' }] },
        filters: {},
      };

      expect(service.isHydrating()).toBe(false);

      let completed = false;
      service.deserialize(payload).subscribe(() => {
        completed = true;
      });

      expect(service.isHydrating()).toBe(true);
      httpMock.expectOne('http://localhost:3000/query/execute').flush(makeQueryResult());

      expect(completed).toBe(true);
      expect(service.isHydrating()).toBe(false);
    });

    it('should set isHydrating to false on query error', () => {
      const payload: GisDashboardPayload = {
        query: 'INVALID',
        backend: 'wikidata',
        layout: { slotsCount: 1, slots: [{ id: 'slot-0', view: 'table' }] },
        filters: {},
      };

      let errored = false;
      service.deserialize(payload).subscribe({
        error: () => {
          errored = true;
        },
      });

      httpMock.expectOne('http://localhost:3000/query/execute').flush(
        { message: 'Bad Request' },
        { status: 400, statusText: 'Bad Request' },
      );

      expect(errored).toBe(true);
      expect(service.isHydrating()).toBe(false);
    });
  });

  describe('round-trip', () => {
    it('serialize → deserialize → serialize should produce deep-equal payloads', () => {
      // Setup state
      queryState.query.set('SELECT ?city WHERE { ?city a <http://example.org/City> }');
      queryState.backend.set('wikidata');
      layout.setLayout('triple');
      layout.setSlot(0, 'map');
      layout.setSlot(1, 'timeline');
      layout.setSlot(2, 'graph');

      viewState.mapState.set({ center: [40.7, -74], zoom: 10 });
      viewState.timelineState.set({ rangeStart: '1900-01-01', rangeEnd: '2000-01-01' });
      viewState.graphState.set({ layout: 'cola' });
      viewState.tableState.set({ quickFilter: 'NYC', pageSize: 100 });

      const node = makeNode({ uri: 'urn:nyc' });
      selection.setQueryResult(makeQueryResult({ nodes: [node] }));
      selection.select(node, 'map');
      selection.setFocus(['urn:nyc'], 'map');

      const first = service.serialize();

      const mockResult = makeQueryResult({ nodes: [node] });
      let completed = false;
      service.deserialize(first).subscribe(() => {
        completed = true;
      });
      httpMock.expectOne('http://localhost:3000/query/execute').flush(mockResult);

      expect(completed).toBe(true);
      const second = service.serialize();

      expect(second.query).toBe(first.query);
      expect(second.backend).toBe(first.backend);
      expect(second.layout).toEqual(first.layout);
      expect(second.filters).toEqual(first.filters);
      expect(second.selection).toEqual(first.selection);
    });
  });

  describe('save', () => {
    it('should create a new dashboard when no current dashboard exists', () => {
      queryState.query.set('SELECT * WHERE { ?s ?p ?o }');

      let received: { name: string; kind: string } | undefined;
      service.save('Demo', 'copy').subscribe((dashboard) => {
        received = dashboard;
      });

      const req = httpMock.expectOne('http://localhost:3000/api/dashboards');
      expect(req.request.method).toBe('POST');
      expect(req.request.body.kind).toBe('gis');
      expect(req.request.body.name).toBe('Demo');
      expect((req.request.body.payload as GisDashboardPayload).query).toBe('SELECT * WHERE { ?s ?p ?o }');

      req.flush({
        id: 'dash-123',
        kind: 'gis',
        name: 'Demo',
        payload: req.request.body.payload,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      expect(received?.name).toBe('Demo');
      expect(received?.kind).toBe('gis');
      expect(service.currentDashboardId()).toBe('dash-123');
      expect(service.currentDashboardName()).toBe('Demo');
    });

    it('should update existing dashboard on overwrite', () => {
      service.currentDashboardId.set('dash-456');
      service.currentDashboardName.set('Old Name');
      queryState.query.set('SELECT ?x WHERE { ?x a <Test> }');

      let received: { name: string } | undefined;
      service.save('Updated', 'overwrite').subscribe((dashboard) => {
        received = dashboard;
      });

      const req = httpMock.expectOne('http://localhost:3000/api/dashboards/dash-456');
      expect(req.request.method).toBe('PUT');
      expect(req.request.body.name).toBe('Updated');

      req.flush({
        id: 'dash-456',
        kind: 'gis',
        name: 'Updated',
        payload: req.request.body.payload,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      expect(received?.name).toBe('Updated');
      expect(service.currentDashboardId()).toBe('dash-456');
      expect(service.currentDashboardName()).toBe('Updated');
    });

    it('should create a copy when mode is copy even if current dashboard exists', () => {
      service.currentDashboardId.set('dash-789');
      queryState.query.set('SELECT * WHERE { ?s ?p ?o }');

      let received: { id: string } | undefined;
      service.save('Copy', 'copy').subscribe((dashboard) => {
        received = dashboard;
      });

      const req = httpMock.expectOne('http://localhost:3000/api/dashboards');
      expect(req.request.method).toBe('POST');

      req.flush({
        id: 'dash-new',
        kind: 'gis',
        name: 'Copy',
        payload: req.request.body.payload,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      expect(received?.id).toBe('dash-new');
      expect(service.currentDashboardId()).toBe('dash-new');
    });
  });

  describe('load', () => {
    it('should fetch and deserialize a dashboard', () => {
      const payload: GisDashboardPayload = {
        query: 'SELECT ?s WHERE { ?s a <City> }',
        backend: 'wikidata',
        layout: { slotsCount: 2, slots: [{ id: 'slot-0', view: 'map' }, { id: 'slot-1', view: 'table' }] },
        filters: {},
      };

      let completed = false;
      service.load('dash-abc').subscribe(() => {
        completed = true;
      });

      const getReq = httpMock.expectOne('http://localhost:3000/api/dashboards/dash-abc');
      getReq.flush({
        id: 'dash-abc',
        kind: 'gis',
        name: 'Test Dashboard',
        payload,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      httpMock.expectOne('http://localhost:3000/query/execute').flush(makeQueryResult());

      expect(completed).toBe(true);
      expect(service.currentDashboardId()).toBe('dash-abc');
      expect(service.currentDashboardName()).toBe('Test Dashboard');
      expect(queryState.query()).toBe('SELECT ?s WHERE { ?s a <City> }');
    });

    it('should reject non-gis dashboards', () => {
      let errored = false;
      service.load('dash-explorer').subscribe({
        error: () => {
          errored = true;
        },
      });

      const getReq = httpMock.expectOne('http://localhost:3000/api/dashboards/dash-explorer');
      getReq.flush({
        id: 'dash-explorer',
        kind: 'explorer',
        name: 'Explorer',
        payload: {},
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      expect(errored).toBe(true);
    });

    it('should handle HTTP errors when loading', () => {
      let errored = false;
      service.load('dash-missing').subscribe({
        error: () => {
          errored = true;
        },
      });

      const getReq = httpMock.expectOne('http://localhost:3000/api/dashboards/dash-missing');
      getReq.flush(
        { error: 'DASHBOARD_NOT_FOUND', message: 'Not found' },
        { status: 404, statusText: 'Not Found' },
      );

      expect(errored).toBe(true);
    });
  });

  describe('clearCurrent', () => {
    it('should reset current dashboard id and name', () => {
      service.currentDashboardId.set('dash-1');
      service.currentDashboardName.set('Test');

      service.clearCurrent();

      expect(service.currentDashboardId()).toBeNull();
      expect(service.currentDashboardName()).toBeNull();
    });
  });

  describe('error handling', () => {
    it('should handle API errors during save', () => {
      let errored = false;
      service.save('Fail', 'copy').subscribe({
        error: () => {
          errored = true;
        },
      });

      const req = httpMock.expectOne('http://localhost:3000/api/dashboards');
      req.flush({ message: 'Server Error' }, { status: 500, statusText: 'Internal Server Error' });

      expect(errored).toBe(true);
    });
  });
});
