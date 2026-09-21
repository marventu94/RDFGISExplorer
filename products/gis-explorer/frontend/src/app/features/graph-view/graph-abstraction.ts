import type { NormalizedEdge } from '@shared/models';

export interface SuperEdge {
  id: string;
  source: string;
  target: string;
  predicate: string;
  predicateLabel: string;
  memberEdgeIds: string[];
  predicates: string[];
  multiplicity: number;
  direction: 'outgoing' | 'self-loop';
}

/**
 * Collapses parallel RDF relations without inventing connectivity. Every
 * member edge is retained in the super-edge provenance, so the operation is
 * reversible when the user asks for detail.
 */
export function aggregateParallelEdges(edges: readonly NormalizedEdge[]): SuperEdge[] {
  const groups = new Map<string, NormalizedEdge[]>();
  for (const edge of edges) {
    const key = `${edge.source}\u0000${edge.target}`;
    const group = groups.get(key) ?? [];
    group.push(edge);
    groups.set(key, group);
  }

  return [...groups.values()].map((members) => {
    const first = members[0];
    const predicates = [...new Set(members.map((edge) => edge.predicate))];
    const id =
      members.length === 1
        ? first.id
        : `super-edge:${first.source}|${first.target}`;
    return {
      id,
      source: first.source,
      target: first.target,
      predicate: predicates.length === 1 ? predicates[0] : `${predicates.length} predicados`,
      predicateLabel:
        predicates.length === 1
          ? first.predicateLabel ?? first.predicate
          : `${predicates.length} relaciones`,
      memberEdgeIds: members.map((edge) => edge.id),
      predicates,
      multiplicity: members.length,
      direction: first.source === first.target ? 'self-loop' : 'outgoing',
    };
  });
}
