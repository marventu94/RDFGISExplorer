import type { QueryResult } from '@shared/models';

/** Reassemble a resource's paged rows and graph without changing the visible lot. */
export function mergePages(pages: readonly QueryResult[]): QueryResult {
  if (!pages.length) throw new Error('No se recuperaron páginas de la entidad.');
  const nodes = new Map<string, QueryResult['nodes'][number]>();
  const edges = new Map<string, QueryResult['edges'][number]>();
  for (const page of pages) {
    for (const node of page.nodes) {
      const previous = nodes.get(node.uri);
      if (!previous) {
        nodes.set(node.uri, node);
        continue;
      }
      const events = [...(previous.temporalEvents ?? []), ...(node.temporalEvents ?? [])];
      nodes.set(node.uri, {
        ...previous,
        ...node,
        attributes: { ...previous.attributes, ...node.attributes },
        directAttributes: { ...previous.directAttributes, ...node.directAttributes },
        coordinate: previous.coordinate ?? node.coordinate,
        temporalEvents: [...new Map(events.map((event) =>
          [JSON.stringify([event.field, event.isoDate]), event])).values()],
      });
    }
    for (const edge of page.edges) edges.set(edge.id, edge);
  }
  return {
    ...pages[0],
    bindings: pages.flatMap((page) => page.bindings),
    nodes: [...nodes.values()],
    edges: [...edges.values()],
    meta: { ...pages[0].meta, truncated: false, limitApplied: pages.reduce((sum, page) => sum + page.bindings.length, 0) },
  };
}
