import type { QueryResult } from '@shared/models';
import { buildGraphElements } from './graph-elements';
import {
  makeDenseSmall,
  makeDirectedTree,
  makeHubWithLeaves,
  makeWideSparse,
} from './testing/graph-fixtures';

/**
 * Benchmark estructural de buildGraphElements (M0): mide la mediana de 30
 * corridas por fixture y la imprime con console.table. No hay assertions de
 * tiempo absoluto (flakiness); sí de estructura: pinned preservado,
 * determinismo entre corridas y aristas sin extremos colgados.
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
    name: 'wide-sparse (300 nodos, 30 aristas)',
    build: () => makeWideSparse(300, 30),
    maxNodes: 300,
  },
  {
    name: 'dense-small (100 nodos, 3000 aristas)',
    build: () => makeDenseSmall(100, 30),
    maxNodes: 300,
    pinned: 'http://example.org/d99',
  },
  {
    name: 'hub con 500 hojas (cap 300, hoja pinned)',
    build: () => makeHubWithLeaves(500),
    maxNodes: 300,
    pinned: 'http://example.org/leaf499',
  },
  {
    name: 'árbol dirigido (364 nodos, cap 300)',
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
        nodos: result.nodes.length,
        aristas: result.edges.length,
        dibujados: last.drawnNodes,
        'aristas ocultas': last.edgesHiddenByTruncation,
        'mediana ms': Number(median(times).toFixed(3)),
      });

      // Estructura: el pinned siempre sobrevive al cap.
      if (benchCase.pinned) {
        expect(drawnNodeIds(last)).toContain(benchCase.pinned);
      }
      // Determinismo: dos corridas dibujan exactamente los mismos ids.
      const again = buildGraphElements(result, options);
      expect(drawnNodeIds(again)).toEqual(drawnNodeIds(last));
      // Ninguna arista dibujada cuelga de un nodo recortado.
      const drawn = new Set(drawnNodeIds(last));
      for (const el of last.elements) {
        if (!('source' in el.data)) continue;
        expect(drawn.has(String(el.data['source']))).toBe(true);
        expect(drawn.has(String(el.data['target']))).toBe(true);
      }
    });
  }
});
