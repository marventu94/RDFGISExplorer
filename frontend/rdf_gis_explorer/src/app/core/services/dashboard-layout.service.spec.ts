import { TestBed } from '@angular/core/testing';
import { DashboardLayoutService } from './dashboard-layout.service';
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

describe('DashboardLayoutService', () => {
  let service: DashboardLayoutService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(DashboardLayoutService);
  });

  it('supports three views with the first one spanning the vertical axis', () => {
    service.setLayout('triple-v');

    expect(service.preset()).toBe('triple-v');
    expect(service.slotCount()).toBe(3);
    expect(service.visibleSlots()).toHaveLength(3);
  });

  it('supports the mirrored vertical three-view layout', () => {
    service.setLayout('triple-v-inv');

    expect(service.preset()).toBe('triple-v-inv');
    expect(service.slotCount()).toBe(3);
    expect(service.visibleSlots()).toHaveLength(3);
  });

  it('supports two vertically stacked views', () => {
    service.setLayout('split-v');

    expect(service.preset()).toBe('split-v');
    expect(service.slotCount()).toBe(2);
    expect(service.visibleSlots()).toHaveLength(2);
  });

  describe('applyLayoutForResult', () => {
    it('should use quad layout when result has both geo and temporal data', () => {
      service.applyLayoutForResult(
        makeQueryResult({
          nodes: [
            makeNode({
              coordinate: { lat: 10, lng: 20 },
              temporalEvents: [{ field: 'date', isoDate: '2020-01-01' }],
            }),
          ],
        }),
      );

      expect(service.preset()).toBe('quad');
      expect(service.slots()).toEqual(['table', 'graph', 'map', 'timeline']);
    });

    it('should use split-h with table and map when result has only geo data', () => {
      service.applyLayoutForResult(
        makeQueryResult({
          nodes: [makeNode({ coordinate: { lat: 10, lng: 20 } })],
        }),
      );

      expect(service.preset()).toBe('split-h');
      expect(service.slots()).toEqual(['table', 'map']);
    });

    it('should use split-h with table and timeline when result has only temporal data', () => {
      service.applyLayoutForResult(
        makeQueryResult({
          nodes: [makeNode({ temporalEvents: [{ field: 'date', isoDate: '2020-01-01' }] })],
        }),
      );

      expect(service.preset()).toBe('split-h');
      expect(service.slots()).toEqual(['table', 'timeline']);
    });

    it('should use split-h with table and graph when result has neither geo nor temporal data', () => {
      service.applyLayoutForResult(makeQueryResult({ nodes: [makeNode()] }));

      expect(service.preset()).toBe('split-h');
      expect(service.slots()).toEqual(['table', 'graph']);
    });
  });
});
