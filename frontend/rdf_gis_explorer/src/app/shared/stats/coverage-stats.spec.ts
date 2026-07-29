import { computeCoverageStats } from './coverage-stats';
import type { QueryResult, NormalizedNode } from '@shared/models';

function makeNode(overrides: Partial<NormalizedNode> = {}): NormalizedNode {
  return {
    uri: 'http://www.wikidata.org/entity/Q1',
    label: 'Nodo',
    attributes: {},
    ...overrides,
  };
}

function makeResult(nodes: NormalizedNode[]): QueryResult {
  return {
    variables: [],
    bindings: [],
    nodes,
    edges: [],
    meta: { durationMs: 0, truncated: false, limitApplied: 500, backend: 'wikidata' },
  };
}

describe('computeCoverageStats', () => {
  it('returns zeros for null/undefined result', () => {
    expect(computeCoverageStats(null)).toEqual({
      total: 0,
      withCoordinate: 0,
      withoutCoordinate: 0,
      withTemporalEvents: 0,
      withoutTemporalEvents: 0,
      primary: 0,
      primaryWithCoordinate: 0,
      primaryWithoutCoordinate: 0,
      primaryWithTemporalEvents: 0,
      primaryWithoutTemporalEvents: 0,
    });
    expect(computeCoverageStats(undefined).total).toBe(0);
  });

  it('returns zeros for an empty result', () => {
    expect(computeCoverageStats(makeResult([])).total).toBe(0);
  });

  it('counts nodes with and without coordinate', () => {
    const result = makeResult([
      makeNode({ uri: 'a', coordinate: { lat: -34.6, lng: -58.4 } }),
      makeNode({ uri: 'b' }),
      makeNode({ uri: 'c', coordinate: { lat: 0, lng: 0 } }),
    ]);
    const stats = computeCoverageStats(result);
    expect(stats.total).toBe(3);
    expect(stats.withCoordinate).toBe(2);
    expect(stats.withoutCoordinate).toBe(1);
  });

  it('counts nodes with and without temporal events', () => {
    const result = makeResult([
      makeNode({ uri: 'a', temporalEvents: [{ field: 'inception', isoDate: '1946-06-04T00:00:00Z' }] }),
      makeNode({ uri: 'b', temporalEvents: [] }),
      makeNode({ uri: 'c' }),
    ]);
    const stats = computeCoverageStats(result);
    expect(stats.withTemporalEvents).toBe(1);
    expect(stats.withoutTemporalEvents).toBe(2);
  });

  it('counts coordinate and temporal coverage independently', () => {
    const result = makeResult([
      makeNode({
        uri: 'a',
        coordinate: { lat: 1, lng: 1 },
        temporalEvents: [{ field: 'date', isoDate: '2000-01-01T00:00:00Z' }],
      }),
      makeNode({ uri: 'b', coordinate: { lat: 2, lng: 2 } }),
      makeNode({ uri: 'c', temporalEvents: [{ field: 'date', isoDate: '2001-01-01T00:00:00Z' }] }),
    ]);
    expect(computeCoverageStats(result)).toEqual({
      total: 3,
      withCoordinate: 2,
      withoutCoordinate: 1,
      withTemporalEvents: 2,
      withoutTemporalEvents: 1,
      primary: 3,
      primaryWithCoordinate: 2,
      primaryWithoutCoordinate: 1,
      primaryWithTemporalEvents: 2,
      primaryWithoutTemporalEvents: 1,
    });
  });

  it('counts as primary only nodes carrying their own data (attributes, coordinate or temporal events)', () => {
    const result = makeResult([
      // Entidad principal completa (ancla con atributos, coordenada y fecha).
      makeNode({
        uri: 'anchor',
        attributes: { precio: { type: 'literal', value: '100' } },
        coordinate: { lat: -34.9, lng: -57.9 },
        temporalEvents: [{ field: 'fecha', isoDate: '2024-01-01T00:00:00Z' }],
      }),
      // Entidad principal sin coordenada ni fecha (solo atributos): alerta real.
      makeNode({ uri: 'rich', attributes: { precio: { type: 'literal', value: '200' } } }),
      // Nodos estructurales del modelo (features, direcciones, geometrías):
      // nunca tienen coordenada/fecha y no deben contar como "sin coordenada".
      makeNode({ uri: 'feature' }),
      makeNode({ uri: 'geom' }),
    ]);
    const stats = computeCoverageStats(result);
    expect(stats.total).toBe(4);
    expect(stats.primary).toBe(2);
    expect(stats.primaryWithCoordinate).toBe(1);
    expect(stats.primaryWithoutCoordinate).toBe(1);
    expect(stats.primaryWithTemporalEvents).toBe(1);
    expect(stats.primaryWithoutTemporalEvents).toBe(1);
  });
});
