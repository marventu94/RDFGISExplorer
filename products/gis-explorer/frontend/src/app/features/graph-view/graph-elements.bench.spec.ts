import type { QueryResult } from '@shared/models';
import { buildGraphElements } from './graph-elements';
import {
  makeDenseSmall,
  makeDirectedTree,
  makeHubWithLeaves,
  makeWideSparse,
} from './testing/graph-fixtures';

/**
 * Structural buildGraphElements benchmark (M0): measures the median of 30 runs
 * per fixture. It avoids flaky absolute-time assertions but checks preserved
 * pins, determinism, and edges without dangling endpoints.
 */

const ITERATIONS = 30;

interface BenchCase {
  name: string;
  build: () => QueryResult;
  maxNodes: number;
  pinned?: string;
}

const CASES: BenchCase[] = [
  {
    name: 'wide-sparse (300 nodes, 30 edges)',
    build: () => makeWideSparse(300, 30),
    maxNodes: 300,
  },
  {
    name: 'dense-small (100 nodes, 3000 edges)',
    build: () => makeDenseSmall(100, 30),
    maxNodes: 300,
    pinned: 'http://example.org/d99',
  },
  {
    name: 'hub with 500 leaves (cap 300, pinned leaf)',
    build: () => makeHubWithLeaves(500),
    maxNodes: 300,
    pinned: 'http://example.org/leaf499',
  },
  {
    name: 'directed tree (364 nodes, cap 300)',
    build: () => makeDirectedTree(6, 3),
    maxNodes: 300,
    pinned: 'http://example.org/t363',
  },
];

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function drawnNodeIds(built: ReturnType<typeof buildGraphElements>): string[] {
  return built.elements.filter((e) => !('source' in e.data)).map((e) => String(e.data.id));
}

describe('buildGraphElements benchmark', () => {
  const table: Record<string, unknown>[] = [];

  afterAll(() => {
    // eslint-disable-next-line no-console
    console.table(table);
  });

  for (const benchCase of CASES) {
    it(`mide y verifica: ${benchCase.name}`, () => {
      const result = benchCase.build();
      const pinned = benchCase.pinned ? [benchCase.pinned] : [];
      const options = { maxNodes: benchCase.maxNodes, pinnedUris: pinned };

      const times: number[] = [];
      let last = buildGraphElements(result, options);
      for (let i = 0; i < ITERATIONS; i++) {
        const t0 = performance.now();
        last = buildGraphElements(result, options);
        times.push(performance.now() - t0);
      }

      table.push({
        fixture: benchCase.name,
        nodes: result.nodes.length,
        edges: result.edges.length,
        dibujados: last.drawnNodes,
        'hidden edges': last.edgesHiddenByTruncation,
        'mediana ms': Number(median(times).toFixed(3)),
      });

      // Structure: the pinned node always survives the cap.
      if (benchCase.pinned) {
        expect(drawnNodeIds(last)).toContain(benchCase.pinned);
      }
      // Determinism: two runs draw exactly the same ids.
      const again = buildGraphElements(result, options);
      expect(drawnNodeIds(again)).toEqual(drawnNodeIds(last));
      // No drawn edge references a trimmed node.
      const drawn = new Set(drawnNodeIds(last));
      for (const el of last.elements) {
        if (!('source' in el.data)) continue;
        expect(drawn.has(String(el.data['source']))).toBe(true);
        expect(drawn.has(String(el.data['target']))).toBe(true);
      }
    });
  }
});
