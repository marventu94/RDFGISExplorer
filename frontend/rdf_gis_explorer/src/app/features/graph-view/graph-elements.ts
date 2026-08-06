import type cytoscape from 'cytoscape';
import type { NormalizedEdge, QueryResult } from '@shared/models';
import { bindingGraphId } from '@shared/stats/lots';
import { aggregateParallelEdges } from './graph-abstraction';

export type GraphInclusionReason = 'selected' | 'query-entity' | 'intermediate' | 'context' | 'degree';

/**
 * Construcción pura de los ElementDefinition de Cytoscape a partir de un
 * QueryResult: no toca la instancia de cytoscape, así es testeable y medible
 * (benchmark) sin DOM.
 *
 * Reglas:
 * - Si los nodos superan `maxNodes`, primero entran los `pinnedUris` que
 *   existan en el resultado (aunque tengan grado cero: lo seleccionado nunca
 *   se cae del dibujo) y el resto del presupuesto se completa por grado total
 *   descendente. Empates: se conserva el orden de entrada (sort estable), sin
 *   aleatoriedad.
 * - Una arista se dibuja solo si sus dos extremos sobrevivieron al corte; las
 *   que tenían ambos extremos en el resultado pero perdieron se cuentan en
 *   `edgesHiddenByTruncation`.
 * - No muta el QueryResult ni sus nodos/aristas.
 */
export interface GraphElementsOptions {
  maxNodes: number;
  /** URIs que entran siempre al presupuesto de nodos (p. ej. la selección actual). */
  pinnedUris?: readonly string[];
  expandedSuperEdgeIds?: readonly string[];
}

/** Resultado de `buildGraphElements`: los elementos y qué quedó afuera del dibujo. */
export interface BuiltGraph {
  elements: cytoscape.ElementDefinition[];
  drawnNodes: number;
  totalNodes: number;
  /** Aristas cuyos dos extremos existen en el resultado pero no sobrevivieron al corte. */
  edgesHiddenByTruncation: number;
  inclusionReasons: Record<GraphInclusionReason, number>;
}

export function buildGraphElements(
  result: QueryResult,
  options: GraphElementsOptions,
): BuiltGraph {
  const { maxNodes } = options;
  const pinned = new Set(options.pinnedUris ?? []);

  const totalDegree = new Map<string, number>();
  for (const edge of result.edges) {
    totalDegree.set(edge.source, (totalDegree.get(edge.source) ?? 0) + 1);
    totalDegree.set(edge.target, (totalDegree.get(edge.target) ?? 0) + 1);
  }

  const allUris = new Set(result.nodes.map((n) => n.uri));
  const queryEntities = new Set<string>();
  for (const row of result.bindings) {
    for (const value of Object.values(row)) {
      const id = bindingGraphId(value);
      if (id) queryEntities.add(id);
    }
  }

  const adjacentToQuery = new Set<string>();
  for (const edge of result.edges) {
    if (queryEntities.has(edge.source)) adjacentToQuery.add(edge.target);
    if (queryEntities.has(edge.target)) adjacentToQuery.add(edge.source);
  }

  let visibleNodes = result.nodes;
  if (result.nodes.length > maxNodes) {
    // Prioridad query-aware: selección, entidades de las filas, intermediarios
    // conectores y recién después contexto ordenado por grado.
    const pinnedNodes = result.nodes.filter((n) => pinned.has(n.uri));
    const queryNodes = result.nodes.filter((n) => queryEntities.has(n.uri) && !pinned.has(n.uri));
    const intermediateNodes = result.nodes.filter(
      (n) => adjacentToQuery.has(n.uri) && !queryEntities.has(n.uri) && !pinned.has(n.uri),
    );
    const contextNodes = result.nodes
      .filter((n) => !pinned.has(n.uri) && !queryEntities.has(n.uri) && !adjacentToQuery.has(n.uri))
      .sort((a, b) => (totalDegree.get(b.uri) ?? 0) - (totalDegree.get(a.uri) ?? 0));
    visibleNodes = [...pinnedNodes, ...queryNodes, ...intermediateNodes, ...contextNodes].slice(
      0,
      Math.max(0, maxNodes),
    );
  }

  const visibleUris = new Set(visibleNodes.map((n) => n.uri));

  // El grado dibujado es el que manda el tamaño del nodo: con el grado total un
  // hub recortado se veía gordo pero con pocas aristas.
  const drawnEdges: NormalizedEdge[] = [];
  const drawnDegree = new Map<string, number>();
  let edgesHiddenByTruncation = 0;

  for (const edge of result.edges) {
    if (visibleUris.has(edge.source) && visibleUris.has(edge.target)) {
      drawnEdges.push(edge);
      drawnDegree.set(edge.source, (drawnDegree.get(edge.source) ?? 0) + 1);
      drawnDegree.set(edge.target, (drawnDegree.get(edge.target) ?? 0) + 1);
    } else if (allUris.has(edge.source) && allUris.has(edge.target)) {
      // Los dos extremos venían en el resultado: se perdió por el truncado.
      edgesHiddenByTruncation++;
    }
  }

  const elements: cytoscape.ElementDefinition[] = [];
  const inclusionReasons: Record<GraphInclusionReason, number> = {
    selected: 0,
    'query-entity': 0,
    intermediate: 0,
    context: 0,
    degree: 0,
  };

  for (const node of visibleNodes) {
    const reason: GraphInclusionReason = pinned.has(node.uri)
      ? 'selected'
      : queryEntities.has(node.uri)
        ? 'query-entity'
        : adjacentToQuery.has(node.uri)
          ? 'intermediate'
          : 'context';
    inclusionReasons[reason]++;
    elements.push({
      data: {
        id: node.uri,
        label: node.label,
        classUri: node.classes?.[0] ?? '',
        classes: node.classes ?? [],
        queryVariable: node.queryVariable ?? '',
        degree: drawnDegree.get(node.uri) ?? 0,
        totalDegree: totalDegree.get(node.uri) ?? 0,
        inclusionReason: reason,
      },
    });
  }

  const expanded = new Set(options.expandedSuperEdgeIds ?? []);
  for (const edge of aggregateParallelEdges(drawnEdges)) {
    if (expanded.has(edge.id)) {
      for (const memberId of edge.memberEdgeIds) {
        const member = drawnEdges.find((candidate) => candidate.id === memberId);
        if (!member) continue;
        elements.push({
          data: { ...member, aggregate: false, multiplicity: 1, superEdgeId: edge.id },
        });
      }
      continue;
    }
    elements.push({
      data: {
        id: edge.id,
        source: edge.source,
        target: edge.target,
        predicate: edge.predicate,
        predicateLabel: edge.predicateLabel ?? '',
        aggregate: edge.multiplicity > 1,
        multiplicity: edge.multiplicity,
        memberEdgeIds: edge.memberEdgeIds,
        predicates: edge.predicates,
      },
    });
  }

  return {
    elements,
    drawnNodes: visibleNodes.length,
    totalNodes: result.nodes.length,
    edgesHiddenByTruncation,
    inclusionReasons,
  };
}
