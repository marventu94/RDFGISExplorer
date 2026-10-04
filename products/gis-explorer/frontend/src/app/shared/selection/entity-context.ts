import type { NormalizedNode, QueryResult, ResultBinding } from '@shared/models';
import { bindingGraphId } from '@shared/stats/lots';
import { pickRowEntity, rowUris } from './row-index';

export interface EntityContextIndex {
  nodes: ReadonlyMap<string, NormalizedNode>;
  primaryByRow: ReadonlyMap<ResultBinding, string>;
  membersByPrimary: ReadonlyMap<string, ReadonlySet<string>>;
  ownersByUri: ReadonlyMap<string, ReadonlySet<string>>;
}

/** Build once per query. RDF direction and row provenance delimit an object;
 * an undirected connected component would merge all houses through their city.
 * Shared resources retain several owners and never arbitrarily choose one.
 */
export function buildEntityContext(
  result: QueryResult | null,
  primaryVariable: string | null = null,
): EntityContextIndex {
  const nodes = new Map(result?.nodes.map((node) => [node.uri, node]) ?? []);
  const primaryByRow = new Map<ResultBinding, string>();
  const membersByPrimary = new Map<string, Set<string>>();
  const ownersByUri = new Map<string, Set<string>>();
  if (!result) return { nodes, primaryByRow, membersByPrimary, ownersByUri };

  const outgoing = new Map<string, string[]>();
  const incoming = new Set<string>();
  for (const edge of result.edges) {
    if (edge.source === edge.target || edge.predicate === 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type') continue;
    const targets = outgoing.get(edge.source) ?? [];
    targets.push(edge.target);
    outgoing.set(edge.source, targets);
    incoming.add(edge.target);
  }
  const projected = new Set(result.bindings.flatMap(rowUris));
  for (const row of result.bindings) {
    const ids = rowUris(row).filter((id) => nodes.has(id));
    const explicit = primaryVariable ? bindingGraphId(row[primaryVariable]) : null;
    const roots = ids.filter((id) => !incoming.has(id) && outgoing.has(id));
    // A unique directed root is independent of SELECT column order. For flat
    // or ambiguous results retain the data-bearing row fallback, overridable
    // by the user through the primary-variable selector.
    const primary = explicit ?? (roots.length === 1 ? roots[0] : pickRowEntity(ids, nodes)?.uri);
    if (primary && nodes.has(primary)) primaryByRow.set(row, primary);
  }
  const primaries = new Set(primaryByRow.values());
  for (const [row, primary] of primaryByRow) {
    const members = membersByPrimary.get(primary) ?? new Set<string>();
    const rowIds = new Set(rowUris(row));
    const visited = new Set<string>();
    const queue = [...rowIds];
    for (let i = 0; i < queue.length; i++) {
      const id = queue[i];
      if (visited.has(id) || (id !== primary && primaries.has(id))) continue;
      visited.add(id);
      members.add(id);
      for (const target of outgoing.get(id) ?? []) {
        // Follow unprojected structural paths, stopping at other rows.
        if (nodes.has(target) && (!projected.has(target) || rowIds.has(target))) queue.push(target);
      }
    }
    membersByPrimary.set(primary, members);
  }
  for (const [primary, members] of membersByPrimary) {
    for (const id of members) {
      const owners = ownersByUri.get(id) ?? new Set<string>();
      owners.add(primary);
      ownersByUri.set(id, owners);
    }
  }
  return { nodes, primaryByRow, membersByPrimary, ownersByUri };
}

export function resolveEntityContext(index: EntityContextIndex, uri: string, row?: ResultBinding): {
  primaryUri: string;
  relatedUris: ReadonlySet<string>;
} {
  const owners = index.ownersByUri.get(uri);
  const rowPrimary = row ? index.primaryByRow.get(row) : undefined;
  const primaryUri = rowPrimary && owners?.has(rowPrimary)
    ? rowPrimary
    : owners?.size === 1 ? owners.values().next().value! : uri;
  return {
    primaryUri,
    relatedUris: index.membersByPrimary.get(primaryUri) ?? new Set([uri]),
  };
}

export function resolveEntityFocus(index: EntityContextIndex, uris: Iterable<string>): Set<string> {
  const resolved = new Set<string>();
  const expanded = new Set<string>();
  for (const uri of uris) {
    const context = resolveEntityContext(index, uri);
    if (expanded.has(context.primaryUri)) continue;
    expanded.add(context.primaryUri);
    for (const member of context.relatedUris) resolved.add(member);
  }
  return resolved;
}
