import { TestBed } from '@angular/core/testing';
import { Subscription } from 'rxjs';
import { SelectionService } from './selection.service';
import type {
  NormalizedNode,
  QueryResult,
  Selection,
  Filter,
  GeoFilter,
  TemporalFilter,
} from '@shared/models';
import type { Polygon } from 'geojson';

function makeNode(overrides: Partial<NormalizedNode> = {}): NormalizedNode {
  return {
    uri: 'http://example.org/node/1',
    label: 'Node 1',
    attributes: {},
    ...overrides,
  };
}

function makeGeoFilter(overrides: Partial<GeoFilter> = {}): GeoFilter {
  return {
    id: 'geo-1',
    kind: 'geo',
    label: 'Test Polygon',
    polygon: {
      type: 'Polygon',
      coordinates: [
        [
          [-10, -10],
          [10, -10],
          [10, 10],
          [-10, 10],
          [-10, -10],
        ],
      ],
    },
    ...overrides,
  };
}

function makeTemporalFilter(overrides: Partial<TemporalFilter> = {}): TemporalFilter {
  return {
    id: 'time-1',
    kind: 'temporal',
    from: '2020-01-01T00:00:00.000Z',
    to: '2020-12-31T23:59:59.999Z',
    label: '2020',
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

describe('SelectionService', () => {
  let service: SelectionService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(SelectionService);
  });

  describe('initial state', () => {
    it('should emit { node: null, source: "external" } on selectedNode$ initially', () => {
      let received: Selection | undefined;
      service.selectedNode$.subscribe((s) => (received = s));
      expect(received).toEqual({ node: null, source: 'external' } as Selection);
    });

    it('should emit empty array on activeFilters$ initially', () => {
      let received: Filter[] | undefined;
      service.activeFilters$.subscribe((f) => (received = f));
      expect(received).toEqual([]);
    });

    it('should emit null on queryResult$ initially', () => {
      let received: QueryResult | null | undefined;
      service.queryResult$.subscribe((r) => (received = r));
      expect(received).toBeNull();
    });

    it('should emit null on filteredQueryResult$ initially', () => {
      let received: QueryResult | null | undefined;
      service.filteredQueryResult$.subscribe((r) => (received = r));
      expect(received).toBeNull();
    });
  });

  describe('select()', () => {
    it('should emit selected node with given source', () => {
      const node = makeNode({ uri: 'http://example.org/node/a', label: 'Node A' });
      const results: Selection[] = [];
      service.selectedNode$.subscribe((s) => results.push(s));
      service.select(node, 'table');
      expect(results.length).toBeGreaterThanOrEqual(2);
      const last = results[results.length - 1];
      expect(last.node).toEqual(node);
      expect(last.source).toBe('table');
    });

    it('should default source to "external"', () => {
      const node = makeNode({ uri: 'http://example.org/node/a', label: 'Node A' });
      let received: Selection | undefined;
      service.selectedNode$.subscribe((s) => (received = s));
      service.select(node);
      expect(received?.source).toBe('external');
    });

    it('should support null node', () => {
      const results: Selection[] = [];
      service.selectedNode$.subscribe((s) => results.push(s));
      service.select(makeNode(), 'graph');
      service.select(null, 'graph');
      const last = results[results.length - 1];
      expect(last.node).toBeNull();
      expect(last.source).toBe('graph');
    });
  });

  describe('clearSelection()', () => {
    it('should reset selection to { node: null, source: "external" }', () => {
      service.select(makeNode(), 'table');
      let received: Selection | undefined;
      service.selectedNode$.subscribe((s) => (received = s));
      service.clearSelection();
      expect(received).toEqual({ node: null, source: 'external' } as Selection);
    });
  });

  describe('addFilter()', () => {
    it('should add a new filter to the active list', () => {
      const filter = makeGeoFilter();
      let received: Filter[] | undefined;
      service.activeFilters$.subscribe((f) => (received = f));
      service.addFilter(filter);
      expect(received).toEqual([filter]);
    });

    it('should replace filter when adding with duplicate id', () => {
      const f1 = makeGeoFilter({ id: 'dup', label: 'First' });
      const f2 = makeGeoFilter({ id: 'dup', label: 'Second' });
      let received: Filter[] | undefined;
      service.activeFilters$.subscribe((f) => (received = f));
      service.addFilter(f1);
      service.addFilter(f2);
      expect(received!.length).toBe(1);
      expect(received![0].label).toBe('Second');
    });

    it('should accept multiple filters with different ids', () => {
      const f1 = makeGeoFilter({ id: 'g1' });
      const f2 = makeTemporalFilter({ id: 't1' });
      let received: Filter[] | undefined;
      service.activeFilters$.subscribe((f) => (received = f));
      service.addFilter(f1);
      service.addFilter(f2);
      expect(received!.length).toBe(2);
    });
  });

  describe('removeFilter()', () => {
    it('should remove a filter by id', () => {
      const f1 = makeGeoFilter({ id: 'keep' });
      const f2 = makeGeoFilter({ id: 'remove' });
      service.addFilter(f1);
      service.addFilter(f2);
      let received: Filter[] | undefined;
      service.activeFilters$.subscribe((f) => (received = f));
      service.removeFilter('remove');
      expect(received!.length).toBe(1);
      expect(received![0].id).toBe('keep');
    });

    it('should do nothing when removing non-existent id', () => {
      const f1 = makeGeoFilter({ id: 'only' });
      service.addFilter(f1);
      let received: Filter[] | undefined;
      service.activeFilters$.subscribe((f) => (received = f));
      service.removeFilter('nonexistent');
      expect(received!.length).toBe(1);
    });
  });

  describe('clearFilters()', () => {
    it('should empty the active filters array', () => {
      service.addFilter(makeGeoFilter({ id: 'f1' }));
      service.addFilter(makeTemporalFilter({ id: 'f2' }));
      let received: Filter[] | undefined;
      service.activeFilters$.subscribe((f) => (received = f));
      service.clearFilters();
      expect(received).toEqual([]);
    });
  });

  describe('setQueryResult()', () => {
    it('should emit the query result', () => {
      const qr = makeQueryResult({ variables: ['x', 'y'] });
      let received: QueryResult | null | undefined;
      service.queryResult$.subscribe((r) => (received = r));
      service.setQueryResult(qr);
      expect(received).toEqual(qr);
    });

    it('should clear selection when setting a new query result', () => {
      service.select(makeNode(), 'table');
      const selResult: Selection[] = [];
      service.selectedNode$.subscribe((s) => selResult.push(s));
      service.setQueryResult(makeQueryResult());
      const last = selResult[selResult.length - 1];
      expect(last.node).toBeNull();
      expect(last.source).toBe('external');
    });

    it('should clear filters when setting a new query result', () => {
      service.addFilter(makeGeoFilter({ id: 'f1' }));
      let received: Filter[] | undefined;
      service.activeFilters$.subscribe((f) => (received = f));
      service.setQueryResult(makeQueryResult());
      expect(received).toEqual([]);
    });

    it('should handle null result (clears selection and filters)', () => {
      service.select(makeNode(), 'table');
      service.addFilter(makeGeoFilter({ id: 'f1' }));
      service.setQueryResult(null);

      let sel: Selection | undefined;
      service.selectedNode$.subscribe((s) => (sel = s));
      expect(sel!.node).toBeNull();
      expect(sel!.source).toBe('external');

      let fil: Filter[] | undefined;
      service.activeFilters$.subscribe((f) => (fil = f));
      expect(fil).toEqual([]);
    });
  });

  describe('filteredQueryResult$', () => {
    it('should emit null when query result is null', () => {
      let received: QueryResult | null | undefined;
      service.filteredQueryResult$.subscribe((r) => (received = r));
      service.setQueryResult(null);
      expect(received).toBeNull();
    });

    it('should emit unchanged result when no filters are active', () => {
      const qr = makeQueryResult({
        nodes: [makeNode({ uri: 'urn:a', label: 'A' })],
        edges: [],
      });
      let received: QueryResult | null | undefined;
      service.filteredQueryResult$.subscribe((r) => (received = r));
      service.setQueryResult(qr);
      expect(received).toEqual(qr);
    });

    describe('geo filter', () => {
      const polygonInside: Polygon = {
        type: 'Polygon',
        coordinates: [
          [
            [-5, -5],
            [5, -5],
            [5, 5],
            [-5, 5],
            [-5, -5],
          ],
        ],
      };

      const polygonFar: Polygon = {
        type: 'Polygon',
        coordinates: [
          [
            [50, 50],
            [60, 50],
            [60, 60],
            [50, 60],
            [50, 50],
          ],
        ],
      };

      it('should exclude nodes without coordinates when a geo filter is active', () => {
        const nodeNoCoord = makeNode({ uri: 'urn:nc', label: 'No Coord', coordinate: undefined });
        const qr = makeQueryResult({ nodes: [nodeNoCoord] });
        service.setQueryResult(qr);

        let received: QueryResult | null | undefined;
        service.filteredQueryResult$.subscribe((r) => (received = r));
        service.addFilter(makeGeoFilter({ polygon: polygonInside }));
        expect(received!.nodes.length).toBe(0);
      });

      it('should include nodes with coordinate inside the polygon', () => {
        const nodeInside = makeNode({
          uri: 'urn:inside',
          label: 'Inside',
          coordinate: { lat: 0, lng: 0 },
        });
        const qr = makeQueryResult({ nodes: [nodeInside] });
        service.setQueryResult(qr);

        let received: QueryResult | null | undefined;
        service.filteredQueryResult$.subscribe((r) => (received = r));
        service.addFilter(makeGeoFilter({ polygon: polygonInside }));
        expect(received!.nodes.length).toBe(1);
        expect(received!.nodes[0].uri).toBe('urn:inside');
      });

      it('should exclude nodes with coordinate outside the polygon', () => {
        const nodeOutside = makeNode({
          uri: 'urn:outside',
          label: 'Outside',
          coordinate: { lat: 0, lng: 0 },
        });
        const qr = makeQueryResult({ nodes: [nodeOutside] });
        service.setQueryResult(qr);

        let received: QueryResult | null | undefined;
        service.filteredQueryResult$.subscribe((r) => (received = r));
        service.addFilter(makeGeoFilter({ polygon: polygonFar }));
        expect(received!.nodes.length).toBe(0);
      });
    });

    describe('temporal filter', () => {
      it('should exclude nodes without temporal events when a temporal filter is active', () => {
        const nodeNoEvents = makeNode({
          uri: 'urn:ne',
          label: 'No Events',
          temporalEvents: [],
        });
        const qr = makeQueryResult({ nodes: [nodeNoEvents] });
        service.setQueryResult(qr);

        let received: QueryResult | null | undefined;
        service.filteredQueryResult$.subscribe((r) => (received = r));
        service.addFilter(makeTemporalFilter());
        expect(received!.nodes.length).toBe(0);
      });

      it('should exclude nodes with undefined temporalEvents when temporal filter is active', () => {
        const node = makeNode({ uri: 'urn:nu', label: 'Undefined Events', temporalEvents: undefined });
        const qr = makeQueryResult({ nodes: [node] });
        service.setQueryResult(qr);

        let received: QueryResult | null | undefined;
        service.filteredQueryResult$.subscribe((r) => (received = r));
        service.addFilter(makeTemporalFilter());
        expect(received!.nodes.length).toBe(0);
      });

      it('should include nodes with temporal events inside the range', () => {
        const node = makeNode({
          uri: 'urn:in',
          label: 'In Range',
          temporalEvents: [{ field: 'created', isoDate: '2020-06-15T12:00:00.000Z' }],
        });
        const qr = makeQueryResult({ nodes: [node] });
        service.setQueryResult(qr);

        let received: QueryResult | null | undefined;
        service.filteredQueryResult$.subscribe((r) => (received = r));
        service.addFilter(makeTemporalFilter());
        expect(received!.nodes.length).toBe(1);
        expect(received!.nodes[0].uri).toBe('urn:in');
      });

      it('should include nodes with events exactly at the boundary', () => {
        const nodeAtStart = makeNode({
          uri: 'urn:boundary',
          label: 'At Start',
          temporalEvents: [{ field: 'created', isoDate: '2020-01-01T00:00:00.000Z' }],
        });
        const nodeAtEnd = makeNode({
          uri: 'urn:boundary2',
          label: 'At End',
          temporalEvents: [{ field: 'created', isoDate: '2020-12-31T23:59:59.999Z' }],
        });
        const qr = makeQueryResult({ nodes: [nodeAtStart, nodeAtEnd] });
        service.setQueryResult(qr);

        let received: QueryResult | null | undefined;
        service.filteredQueryResult$.subscribe((r) => (received = r));
        service.addFilter(makeTemporalFilter());
        expect(received!.nodes.length).toBe(2);
      });

      it('should exclude nodes with all temporal events outside the range', () => {
        const node = makeNode({
          uri: 'urn:out',
          label: 'Out of Range',
          temporalEvents: [
            { field: 'created', isoDate: '2019-12-31T23:59:59.000Z' },
            { field: 'updated', isoDate: '2021-01-01T00:00:00.000Z' },
          ],
        });
        const qr = makeQueryResult({ nodes: [node] });
        service.setQueryResult(qr);

        let received: QueryResult | null | undefined;
        service.filteredQueryResult$.subscribe((r) => (received = r));
        service.addFilter(makeTemporalFilter());
        expect(received!.nodes.length).toBe(0);
      });

      it('should include node if at least one event is within the range', () => {
        const node = makeNode({
          uri: 'urn:mixed',
          label: 'Mixed',
          temporalEvents: [
            { field: 'created', isoDate: '2019-01-01T00:00:00.000Z' },
            { field: 'updated', isoDate: '2020-06-15T00:00:00.000Z' },
          ],
        });
        const qr = makeQueryResult({ nodes: [node] });
        service.setQueryResult(qr);

        let received: QueryResult | null | undefined;
        service.filteredQueryResult$.subscribe((r) => (received = r));
        service.addFilter(makeTemporalFilter());
        expect(received!.nodes.length).toBe(1);
      });
    });

    describe('combined filters', () => {
      it('should apply both geo and temporal filters simultaneously', () => {
        const insidePolygon: Polygon = {
          type: 'Polygon',
          coordinates: [
            [
              [-5, -5],
              [5, -5],
              [5, 5],
              [-5, 5],
              [-5, -5],
            ],
          ],
        };

        const nodePassesBoth = makeNode({
          uri: 'urn:both',
          label: 'Passes Both',
          coordinate: { lat: 0, lng: 0 },
          temporalEvents: [{ field: 'created', isoDate: '2020-06-15T00:00:00.000Z' }],
        });
        const nodeOutside = makeNode({
          uri: 'urn:outside',
          label: 'Outside geo',
          coordinate: { lat: 55, lng: 55 },
          temporalEvents: [{ field: 'created', isoDate: '2020-06-15T00:00:00.000Z' }],
        });
        const nodeOutOfTime = makeNode({
          uri: 'urn:outtime',
          label: 'Out of time',
          coordinate: { lat: 0, lng: 0 },
          temporalEvents: [{ field: 'created', isoDate: '2019-01-01T00:00:00.000Z' }],
        });
        const nodeNoneMatch = makeNode({
          uri: 'urn:none',
          label: 'No match',
          coordinate: { lat: 55, lng: 55 },
          temporalEvents: [{ field: 'created', isoDate: '2019-01-01T00:00:00.000Z' }],
        });

        const qr = makeQueryResult({
          nodes: [nodePassesBoth, nodeOutside, nodeOutOfTime, nodeNoneMatch],
        });
        service.setQueryResult(qr);

        let received: QueryResult | null | undefined;
        service.filteredQueryResult$.subscribe((r) => (received = r));
        service.addFilter(makeGeoFilter({ polygon: insidePolygon }));
        service.addFilter(makeTemporalFilter());
        expect(received!.nodes.length).toBe(1);
        expect(received!.nodes[0].uri).toBe('urn:both');
      });
    });

    describe('edges filtering', () => {
      it('should keep neighbour nodes and edges connected to nodes that pass the filter', () => {
        const insidePolygon: Polygon = {
          type: 'Polygon',
          coordinates: [
            [
              [-5, -5],
              [5, -5],
              [5, 5],
              [-5, 5],
              [-5, -5],
            ],
          ],
        };

        const nodeA = makeNode({
          uri: 'urn:a',
          label: 'A',
          coordinate: { lat: 0, lng: 0 },
        });
        const nodeB = makeNode({
          uri: 'urn:b',
          label: 'B',
          coordinate: { lat: 55, lng: 55 },
        });

        const qr = makeQueryResult({
          nodes: [nodeA, nodeB],
          edges: [
            { id: 'e1', source: 'urn:a', target: 'urn:b', predicate: 'p:knows' },
          ],
        });
        service.setQueryResult(qr);

        let received: QueryResult | null | undefined;
        service.filteredQueryResult$.subscribe((r) => (received = r));
        service.addFilter(makeGeoFilter({ polygon: insidePolygon }));
        expect(received!.nodes.length).toBe(2);
        expect(received!.edges.length).toBe(1);
      });

      it('should keep neighbour nodes and edges when source survives but target does not', () => {
        const insidePolygon: Polygon = {
          type: 'Polygon',
          coordinates: [
            [
              [-5, -5],
              [5, -5],
              [5, 5],
              [-5, 5],
              [-5, -5],
            ],
          ],
        };

        const nodeInside = makeNode({
          uri: 'urn:inside',
          label: 'Inside',
          coordinate: { lat: 0, lng: 0 },
        });
        const nodeOutside = makeNode({
          uri: 'urn:outside',
          label: 'Outside',
          coordinate: { lat: 55, lng: 55 },
        });

        const qr = makeQueryResult({
          nodes: [nodeInside, nodeOutside],
          edges: [
            { id: 'e1', source: 'urn:inside', target: 'urn:outside', predicate: 'p:knows' },
          ],
        });
        service.setQueryResult(qr);

        let received: QueryResult | null | undefined;
        service.filteredQueryResult$.subscribe((r) => (received = r));
        service.addFilter(makeGeoFilter({ polygon: insidePolygon }));
        expect(received!.nodes.length).toBe(2);
        expect(received!.edges.length).toBe(1);
      });

      it('should keep edges between nodes that both survive filtering', () => {
        const insidePolygon: Polygon = {
          type: 'Polygon',
          coordinates: [
            [
              [-5, -5],
              [5, -5],
              [5, 5],
              [-5, 5],
              [-5, -5],
            ],
          ],
        };

        const nodeA = makeNode({
          uri: 'urn:a',
          label: 'A',
          coordinate: { lat: 0, lng: 0 },
        });
        const nodeB = makeNode({
          uri: 'urn:b',
          label: 'B',
          coordinate: { lat: 1, lng: 1 },
        });

        const qr = makeQueryResult({
          nodes: [nodeA, nodeB],
          edges: [
            { id: 'e1', source: 'urn:a', target: 'urn:b', predicate: 'p:knows' },
          ],
        });
        service.setQueryResult(qr);

        let received: QueryResult | null | undefined;
        service.filteredQueryResult$.subscribe((r) => (received = r));
        service.addFilter(makeGeoFilter({ polygon: insidePolygon }));
        expect(received!.nodes.length).toBe(2);
        expect(received!.edges.length).toBe(1);
      });
    });
  });

  describe('latency', () => {
    it('should emit selectedNode$ synchronously from select() call (<50ms)', () => {
      const node = makeNode({ uri: 'urn:latency' });
      let emitted = false;
      const start = performance.now();

      const sub: Subscription = service.selectedNode$.subscribe(() => {
        emitted = true;
      });

      service.select(node, 'table');
      const delta = performance.now() - start;

      expect(emitted).toBe(true);
      expect(delta).toBeLessThan(50);

      sub.unsubscribe();
    });

    it('should emit filteredQueryResult$ synchronously after addFilter (<50ms)', () => {
      const qr = makeQueryResult({
        nodes: [makeNode({ uri: 'urn:a', label: 'A', coordinate: { lat: 0, lng: 0 } })],
      });
      service.setQueryResult(qr);

      let emitted = false;
      const polygon: Polygon = {
        type: 'Polygon',
        coordinates: [
          [
            [-5, -5],
            [5, -5],
            [5, 5],
            [-5, 5],
            [-5, -5],
          ],
        ],
      };

      const sub: Subscription = service.filteredQueryResult$.subscribe(() => {
        emitted = true;
      });

      const start = performance.now();
      service.addFilter(makeGeoFilter({ polygon }));
      const delta = performance.now() - start;

      expect(emitted).toBe(true);
      expect(delta).toBeLessThan(50);

      sub.unsubscribe();
    });
  });

  describe('source traceability for loop prevention', () => {
    it('should emit Selection with correct source for each select call', () => {
      const sources: string[] = [];
      service.selectedNode$.subscribe((s) => sources.push(s.source));
      service.select(makeNode(), 'table');
      service.select(makeNode(), 'graph');
      service.select(makeNode(), 'map');
      service.select(makeNode(), 'timeline');
      // Last two entries should be: 'table', 'graph', 'map', 'timeline'
      // (plus initial 'external')
      expect(sources).toContain('table');
      expect(sources).toContain('graph');
      expect(sources).toContain('map');
      expect(sources).toContain('timeline');
    });

    it('should allow views to filter out their own events by source', () => {
      const fromTable: Selection[] = [];
      service.selectedNode$.subscribe((s) => {
        if (s.source !== 'table') fromTable.push(s);
      });
      service.select(makeNode({ uri: 'urn:fromtable' }), 'table');
      service.select(makeNode({ uri: 'urn:fromgraph' }), 'graph');
      // The table-originated event should be filtered out
      expect(fromTable.some((s) => s.source === 'table')).toBe(false);
      expect(fromTable.some((s) => s.source === 'graph')).toBe(true);
    });
  });

  describe('nodePassesFilter fallback (defensive)', () => {
    it('should return true for unrecognized filter kind', () => {
      const node = makeNode();
      const unknownFilter = { id: 'x', kind: 'unknown', label: 'test' } as unknown as Filter;
      // Access private method via type cast for coverage
      const result = (service as unknown as { nodePassesFilter: (n: NormalizedNode, f: Filter) => boolean }).nodePassesFilter(node, unknownFilter);
      expect(result).toBe(true);
    });
  });
});
