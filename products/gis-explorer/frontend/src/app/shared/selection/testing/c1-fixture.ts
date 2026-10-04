import type { NormalizedNode, QueryResult, ResultBinding } from '@shared/models';

/** Synthetic C1 shape: no private GraphDB identifiers or property data. */
export function c1Fixture(): QueryResult {
  const nodes: NormalizedNode[] = [];
  const edges: QueryResult['edges'] = [];
  const bindings: ResultBinding[] = [];
  const uri = (value: string) => ({ type: 'uri' as const, value });
  for (const suffix of ['a', 'b']) {
    for (const role of ['listing', 'estate', 'geometry', 'date', 'address']) {
      nodes.push({ uri: `${role}-${suffix}`, label: `${role} ${suffix}`, attributes: {},
        ...(role === 'geometry' ? { coordinate: { lat: 0, lng: suffix === 'a' ? 0 : 1 } } : {}),
        ...(role === 'date' ? { temporalEvents: [{ field: 'date', isoDate: '2024-01-01T00:00:00Z' }] } : {}),
      });
    }
    nodes.push({ uri: `_:site-${suffix}`, label: 'Site', attributes: {} });
    for (const [from, to] of [
      [`listing-${suffix}`, `estate-${suffix}`],
      [`listing-${suffix}`, `date-${suffix}`],
      [`estate-${suffix}`, `_:site-${suffix}`],
      [`_:site-${suffix}`, `geometry-${suffix}`],
      [`estate-${suffix}`, `address-${suffix}`],
      [`address-${suffix}`, 'city'],
      [`address-${suffix}`, 'origin'],
    ]) edges.push({ id: `${from}->${to}`, source: from, target: to, predicate: 'urn:related' });
    bindings.push({ geometry: uri(`geometry-${suffix}`), listing: uri(`listing-${suffix}`),
      estate: uri(`estate-${suffix}`), dateNode: uri(`date-${suffix}`),
      address: uri(`address-${suffix}`), city: uri('city'), origin: uri('origin') });
  }
  nodes.push({ uri: 'city', label: 'Berisso', attributes: {} }, { uri: 'origin', label: 'Source', attributes: {} });
  return { variables: Object.keys(bindings[0]), bindings, nodes, edges,
    meta: { backend: 'graphdb', durationMs: 1, truncated: false, limitApplied: 1000 } };
}
