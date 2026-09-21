import { computeLotCount, restrictResultToUris, sliceLot } from './lots';
import type { NormalizedEdge, NormalizedNode, QueryResult, ResultBinding } from '@shared/models';

function makeNode(uri: string): NormalizedNode {
  return { uri, label: uri, attributes: {} };
}

function makeEdge(source: string, target: string): NormalizedEdge {
  return { id: `${source}->${target}`, source, target, predicate: 'p' };
}

function makeRow(...uris: string[]): ResultBinding {
  const row: ResultBinding = { s: { type: 'uri', value: uris[0] ?? 'x' } };
  if (uris[1]) row['extra'] = { type: 'uri', value: uris[1] };
  return row;
}

function makeResult(
  nodes: NormalizedNode[],
  edges: NormalizedEdge[] = [],
  bindings: QueryResult['bindings'] = [],
): QueryResult {
  return {
    variables: ['s'],
    bindings,
    nodes,
    edges,
    meta: { durationMs: 0, truncated: false, limitApplied: 500, backend: 'wikidata' },
  };
}

describe('computeLotCount', () => {
  it('returns 1 for null or empty results', () => {
    expect(computeLotCount(null, 300)).toBe(1);
    expect(computeLotCount(makeResult([]), 300)).toBe(1);
  });

  it('rounds up row count over lot size', () => {
    const bindings = Array.from({ length: 7 }, (_, i) => makeRow(`n${i}`));
    expect(computeLotCount(makeResult([], [], bindings), 3)).toBe(3);
    expect(computeLotCount(makeResult([], [], bindings), 300)).toBe(1);
  });
});

describe('restrictResultToUris', () => {
  it('keeps only nodes, internal edges and bindings touching visible URIs', () => {
    const result = makeResult(
      [makeNode('a'), makeNode('b'), makeNode('c')],
      [makeEdge('a', 'b'), makeEdge('b', 'c')],
      [
        { s: { type: 'uri', value: 'a' } },
        { s: { type: 'uri', value: 'c' } },
        { s: { type: 'literal', value: 'sin uri' } },
      ],
    );
    const restricted = restrictResultToUris(result, new Set(['a', 'b']));
    expect(restricted.nodes.map((n) => n.uri)).toEqual(['a', 'b']);
    expect(restricted.edges.map((e) => e.id)).toEqual(['a->b']);
    expect(restricted.bindings).toEqual([{ s: { type: 'uri', value: 'a' } }]);
    expect(restricted.meta).toBe(result.meta);
  });
});

describe('sliceLot', () => {
  const nodes = Array.from({ length: 10 }, (_, i) => makeNode(`n${i}`));
  const bindings = Array.from({ length: 10 }, (_, i) => makeRow(`n${i}`));

  it('returns the result untouched when everything fits in one lot', () => {
    const result = makeResult(nodes, [], bindings);
    const slice = sliceLot(result, 300, 1);
    expect(slice.result).toBe(result);
    expect(slice.lotCount).toBe(1);
    expect(slice.currentLot).toBe(1);
  });

  it('chunks rows in the original query order, without reordering', () => {
    // n0 has high degree, but query order wins: batch 1 is the first four rows,
    // not the top nodes by connection count.
    const edges = [makeEdge('n0', 'n5'), makeEdge('n0', 'n6')];
    const result = makeResult(nodes, edges, bindings);
    const slice = sliceLot(result, 4, 1);
    expect(slice.lotCount).toBe(3);
    expect(slice.result.bindings).toEqual(bindings.slice(0, 4));
    expect(slice.result.nodes.map((n) => n.uri)).toEqual(['n0', 'n1', 'n2', 'n3', 'n5', 'n6']);
  });

  it('keeps the lot rows as-is, even rows without visible URIs', () => {
    const rows: QueryResult['bindings'] = [
      makeRow('n0'),
      { s: { type: 'literal', value: 'sin uri' } },
      ...Array.from({ length: 5 }, (_, i) => makeRow(`n${i + 1}`)),
    ];
    const result = makeResult(nodes, [], rows);
    const slice = sliceLot(result, 4, 1);
    expect(slice.result.bindings).toEqual(rows.slice(0, 4));
    expect(slice.result.bindings).toContainEqual({ s: { type: 'literal', value: 'sin uri' } });
  });

  it('includes bnodes referenced by the lot rows (raw id in rows, _:id in nodes)', () => {
    // Bindings carry raw bnode 'b0' while nodes/edges use '_:b0'; normalization
    // prevents the bnode from falling out of the visible batch.
    const rows: QueryResult['bindings'] = [
      { s: { type: 'bnode', value: 'b0' } },
      ...Array.from({ length: 5 }, (_, i) => makeRow(`n${i}`)),
    ];
    const allNodes = [makeNode('_:b0'), ...nodes];
    const result = makeResult(allNodes, [], rows);
    const slice = sliceLot(result, 2, 1);
    expect(slice.result.nodes.map((n) => n.uri)).toContain('_:b0');
  });

  it('a projected bnode belongs to the correct lot, with its edges', () => {
    // In a multi-batch result, batch 2 rows reference raw 'b0'; node '_:b0' and
    // its edges must appear only in that batch.
    const rows: QueryResult['bindings'] = [
      makeRow('n0'),
      makeRow('n1'),
      { s: { type: 'bnode', value: 'b0' } },
      makeRow('n3'),
    ];
    const allNodes = [makeNode('_:b0'), ...nodes];
    // The edge connects the bnode to n3 in batch 2; neither endpoint touches
    // batch 1 rows, so neighbor expansion must not include it.
    const edges = [makeEdge('_:b0', 'n3')];
    const result = makeResult(allNodes, edges, rows);

    const lot1 = sliceLot(result, 2, 1);
    expect(lot1.result.nodes.map((n) => n.uri)).not.toContain('_:b0');
    expect(lot1.result.edges).toEqual([]);

    const lot2 = sliceLot(result, 2, 2);
    expect(lot2.result.nodes.map((n) => n.uri)).toContain('_:b0');
    expect(lot2.result.edges.map((e) => e.id)).toEqual(['_:b0->n3']);
  });

  it('keeps bindings that only mention a visible bnode (restrictResultToUris)', () => {
    const result = makeResult(
      [makeNode('_:b0'), makeNode('n0')],
      [],
      [{ s: { type: 'bnode', value: 'b0' } }, makeRow('n1')],
    );
    const restricted = restrictResultToUris(result, new Set(['_:b0']));
    expect(restricted.bindings).toEqual([{ s: { type: 'bnode', value: 'b0' } }]);
  });

  it('adds 1-hop neighbors of the row URIs (intermediate nodes not in bindings)', () => {
    // mid is absent from bindings and recovered through the edge.
    const allNodes = [...nodes, makeNode('mid')];
    const edges = [makeEdge('n0', 'mid'), makeEdge('mid', 'n9')];
    const result = makeResult(allNodes, edges, bindings);
    const slice = sliceLot(result, 4, 1);
    expect(slice.result.nodes.map((n) => n.uri)).toContain('mid');
    expect(slice.result.edges.map((e) => e.id)).toContain('n0->mid');
    // mid->n9 is excluded because n9 is not visible in batch 1; expansion is
    // one hop from rows and is not recursive.
    expect(slice.result.edges.map((e) => e.id)).not.toContain('mid->n9');
  });

  it('clamps currentLot into the valid range', () => {
    const result = makeResult(nodes, [], bindings);
    expect(sliceLot(result, 4, 99).currentLot).toBe(3);
    expect(sliceLot(result, 4, 0).currentLot).toBe(1);
  });

  it('injects pinned URIs from other lots, with their edges to visible nodes', () => {
    // n4 and n9 are outside batch 1 and are not neighbors of its rows.
    const edges = [makeEdge('n4', 'n9')];
    const result = makeResult(nodes, edges, bindings);
    const unpinned = sliceLot(result, 4, 1);
    expect(unpinned.result.nodes.map((n) => n.uri)).toEqual(['n0', 'n1', 'n2', 'n3']);

    // Pinning only n9 injects the node but not the edge because n4 is hidden.
    const pinnedOne = sliceLot(result, 4, 1, ['n9']);
    expect(pinnedOne.result.nodes.map((n) => n.uri)).toContain('n9');
    expect(pinnedOne.result.edges.map((e) => e.id)).not.toContain('n4->n9');

    // The edge appears when both endpoints are visible.
    const pinnedBoth = sliceLot(result, 4, 1, ['n4', 'n9']);
    expect(pinnedBoth.result.edges.map((e) => e.id)).toContain('n4->n9');
    // Pinning adds no rows; bindings remain those of the batch.
    expect(pinnedBoth.result.bindings).toEqual(bindings.slice(0, 4));
  });

  it('ignores pinned URIs that are not in the result', () => {
    const result = makeResult(nodes, [], bindings);
    const slice = sliceLot(result, 4, 1, ['fantasma']);
    expect(slice.result.nodes.map((n) => n.uri)).toEqual(['n0', 'n1', 'n2', 'n3']);
  });
});
