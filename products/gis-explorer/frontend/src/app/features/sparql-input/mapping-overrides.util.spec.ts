import { applyMappingOverrides } from './mapping-overrides.util';
import type { QueryResult } from '@shared/models';

function result(): QueryResult {
  return {
    variables: ['item', 'when', 'unused'],
    bindings: [{
      item: { type: 'uri', value: 'https://example.test/item/1' },
      when: { type: 'literal', value: '2024-01-02' },
      unused: { type: 'literal', value: 'x' },
    }],
    nodes: [{
      uri: 'https://example.test/item/1',
      label: 'Item 1',
      classes: ['https://example.test/Class'],
      attributes: {
        when: { type: 'literal', value: '2024-01-02' },
        unused: { type: 'literal', value: 'x' },
      },
    }],
    edges: [{
      id: 'original-edge',
      source: 'https://example.test/item/1',
      target: '_:b1',
      predicate: 'https://example.test/predicate',
    }],
    meta: { durationMs: 1, truncated: false, limitApplied: 100, backend: 'test' },
  };
}

describe('applyMappingOverrides', () => {
  it('preserves the RDF topology and node metadata when mapping a date', () => {
    const source = result();
    const mapped = applyMappingOverrides(source, { when: 'date' });

    expect(mapped.edges).toBe(source.edges);
    expect(mapped.nodes[0].classes).toEqual(source.nodes[0].classes);
    expect(mapped.nodes[0].temporalEvents).toEqual([
      { field: 'when', isoDate: '2024-01-02T00:00:00.000Z' },
    ]);
  });

  it('really removes ignored variables from rows and attributes', () => {
    const mapped = applyMappingOverrides(result(), { unused: 'ignore' });

    expect(mapped.variables).toEqual(['item', 'when']);
    expect(mapped.bindings[0]['unused']).toBeUndefined();
    expect(mapped.nodes[0].attributes['unused']).toBeUndefined();
  });
});
