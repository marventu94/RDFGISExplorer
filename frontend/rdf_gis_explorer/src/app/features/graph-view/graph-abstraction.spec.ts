import { aggregateParallelEdges } from './graph-abstraction';

describe('aggregateParallelEdges', () => {
  it('groups parallel relations with exact reversible provenance', () => {
    const result = aggregateParallelEdges([
      { id: 'e1', source: 'a', target: 'b', predicate: 'p1', predicateLabel: 'p1' },
      { id: 'e2', source: 'a', target: 'b', predicate: 'p2', predicateLabel: 'p2' },
      { id: 'e3', source: 'b', target: 'a', predicate: 'p3', predicateLabel: 'p3' },
    ]);

    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({
      source: 'a',
      target: 'b',
      multiplicity: 2,
      memberEdgeIds: ['e1', 'e2'],
      predicates: ['p1', 'p2'],
    });
    expect(result[1].memberEdgeIds).toEqual(['e3']);
  });

  it('does not merge opposite directions', () => {
    const result = aggregateParallelEdges([
      { id: 'e1', source: 'a', target: 'b', predicate: 'p', predicateLabel: 'p' },
      { id: 'e2', source: 'b', target: 'a', predicate: 'p', predicateLabel: 'p' },
    ]);

    expect(result).toHaveLength(2);
  });
});
