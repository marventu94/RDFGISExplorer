import type cytoscape from 'cytoscape';
import type { NormalizedEdge, QueryResult } from '@shared/models';
import { bindingGraphId } from '@shared/stats/lots';
import { aggregateParallelEdges } from './graph-abstraction';

/**
 * Por qué un nodo entró al presupuesto. No hay razón "grado": el grado ordena
 * el bucket `context` (ver `buildGraphElements`), no es una categoría propia.
 */
export type GraphInclusionReason = 'selected' | 'query-entity' | 'intermediate' | 'context';

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
  detailLevel?: 'summary' | 'exploration' | 'detail';
  expandedMotifIds?: readonly string[];
}

/** Resultado de `buildGraphElements`: los elementos y qué quedó afuera del dibujo. */
export interface BuiltGraph {
  elements: cytoscape.ElementDefinition[];
  drawnNodes: number;
  totalNodes: number;
  /** Aristas cuyos dos extremos existen en el resultado pero no sobrevivieron al corte. */
  edgesHiddenByTruncation: number;
  inclusionReasons: Record<GraphInclusionReason, number>;
  /** Nodos originales representados mediante motivos agregados reversibles. */
  abstractedNodes: number;
  /** Glifos de nodo usados para representar los motivos agregados. */
  aggregateNodes: number;
  /** Cantidad de firmas de motivo agregadas en el resumen. */
  motifCount: number;
}

interface RepeatedComponentSummary {
  elements: cytoscape.ElementDefinition[];
  claimedNodeIds: Set<string>;
  claimedEdgeIds: Set<string>;
  expandedEdgeMotifIds: Map<string, string>;
  abstractedNodes: number;
  aggregateNodes: number;
  motifCount: number;
}

function motifGrouping(node: QueryResult['nodes'][number]): {
  source: 'query-variable' | 'rdf-class' | 'fallback';
  value: string;
} {
  if (node.queryVariable) return { source: 'query-variable', value: node.queryVariable };
  if (node.classes?.[0]) return { source: 'rdf-class', value: node.classes[0] };
  return { source: 'fallback', value: 'entity' };
}

function motifRole(node: QueryResult['nodes'][number]): string {
  const group = motifGrouping(node);
  return `${group.source}:${group.value}`;
}

function compactRoleLabel(value: string): string {
  return value.split(/[#/]/).pop() || value;
}

function stableSignatureId(signature: string): string {
  let first = 0x811c9dc5;
  let second = 5381;
  for (let index = 0; index < signature.length; index++) {
    const code = signature.charCodeAt(index);
    first = Math.imul(first ^ code, 0x01000193);
    second = Math.imul(second, 33) ^ code;
  }
  return `${(first >>> 0).toString(16)}-${(second >>> 0).toString(16)}`;
}

/**
 * Agrupa componentes desconectados con la misma firma estructural: cantidad
 * de nodos por rol y cantidad de aristas por rol de origen, predicado y rol de
 * destino. Los miembros y las multiplicidades quedan registrados para que la
 * abstracción sea explicable y reversible.
 */
function summarizeRepeatedComponents(
  result: QueryResult,
  pinned: ReadonlySet<string>,
  expandedMotifIds: ReadonlySet<string>,
  maxSyntheticNodes: number,
): RepeatedComponentSummary {
  type Node = QueryResult['nodes'][number];
  interface Component {
    nodes: Node[];
    edges: NormalizedEdge[];
    nodesByRole: Map<string, Node[]>;
    edgesByRole: Map<string, NormalizedEdge[]>;
  }

  const nodeById = new Map(result.nodes.map((node) => [node.uri, node]));
  const incident = new Map<string, NormalizedEdge[]>();
  for (const edge of result.edges) {
    const sourceEdges = incident.get(edge.source) ?? [];
    sourceEdges.push(edge);
    incident.set(edge.source, sourceEdges);
    if (edge.target !== edge.source) {
      const targetEdges = incident.get(edge.target) ?? [];
      targetEdges.push(edge);
      incident.set(edge.target, targetEdges);
    }
  }

  const groups = new Map<string, Component[]>();
  const visited = new Set<string>();
  for (const start of result.nodes) {
    if (visited.has(start.uri)) continue;
    const stack = [start.uri];
    const componentNodeIds: string[] = [];
    const componentEdges = new Map<string, NormalizedEdge>();
    visited.add(start.uri);

    while (stack.length > 0) {
      const uri = stack.pop()!;
      componentNodeIds.push(uri);
      for (const edge of incident.get(uri) ?? []) {
        componentEdges.set(edge.id, edge);
        const neighbour = edge.source === uri ? edge.target : edge.source;
        if (nodeById.has(neighbour) && !visited.has(neighbour)) {
          visited.add(neighbour);
          stack.push(neighbour);
        }
      }
    }

    const nodes = componentNodeIds.map((uri) => nodeById.get(uri)!);
    const edges = [...componentEdges.values()];
    if (edges.length === 0 || nodes.some((node) => pinned.has(node.uri))) continue;

    const nodesByRole = new Map<string, Node[]>();
    for (const node of nodes) {
      const role = motifRole(node);
      const members = nodesByRole.get(role) ?? [];
      members.push(node);
      nodesByRole.set(role, members);
    }

    const edgesByRole = new Map<string, NormalizedEdge[]>();
    for (const edge of edges) {
      const source = nodeById.get(edge.source);
      const target = nodeById.get(edge.target);
      if (!source || !target) continue;
      const key = `${motifRole(source)}\u0000${edge.predicate}\u0000${motifRole(target)}`;
      const members = edgesByRole.get(key) ?? [];
      members.push(edge);
      edgesByRole.set(key, members);
    }

    const signature = JSON.stringify({
      roles: [...nodesByRole.entries()]
        .map(([role, members]) => [role, members.length] as const)
        .sort(([left], [right]) => left.localeCompare(right)),
      edges: [...edgesByRole.entries()]
        .map(([role, members]) => [role, members.length] as const)
        .sort(([left], [right]) => left.localeCompare(right)),
    });
    const components = groups.get(signature) ?? [];
    components.push({ nodes, edges, nodesByRole, edgesByRole });
    groups.set(signature, components);
  }

  const elements: cytoscape.ElementDefinition[] = [];
  const claimedNodeIds = new Set<string>();
  const claimedEdgeIds = new Set<string>();
  const expandedEdgeMotifIds = new Map<string, string>();
  let abstractedNodes = 0;
  let aggregateNodes = 0;
  let motifCount = 0;

  const repeated = [...groups.entries()]
    .filter(([, components]) => components.length >= 2)
    .sort(([, left], [, right]) => right.length - left.length);

  for (const [signature, components] of repeated) {
    const first = components[0];
    if (aggregateNodes + first.nodesByRole.size > maxSyntheticNodes) continue;
    const motifId = `component-motif:${stableSignatureId(signature)}`;
    if (expandedMotifIds.has(motifId)) {
      components.forEach((component) =>
        component.edges.forEach((edge) => expandedEdgeMotifIds.set(edge.id, motifId)),
      );
      continue;
    }

    const aggregateIdByRole = new Map<string, string>();
    [...first.nodesByRole.keys()].sort().forEach((role, index) => {
      const firstNode = first.nodesByRole.get(role)![0];
      const group = motifGrouping(firstNode);
      const id = `${motifId}:node:${index}`;
      const memberNodeIds = components.flatMap((component) =>
        component.nodesByRole.get(role)!.map((node) => node.uri),
      );
      aggregateIdByRole.set(role, id);
      elements.push({
        data: {
          id,
          label: `${compactRoleLabel(group.value)} (${memberNodeIds.length})`,
          aggregate: true,
          aggregateKind: 'repeated-component',
          motifId,
          role,
          groupingSource: group.source,
          groupingValue: group.value,
          memberNodeIds,
          degree: first.edges.filter((edge) => {
            const source = nodeById.get(edge.source);
            const target = nodeById.get(edge.target);
            return (source && motifRole(source) === role) || (target && motifRole(target) === role);
          }).length,
          multiplicity: memberNodeIds.length,
        },
      });
    });

    [...first.edgesByRole.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .forEach(([edgeRole, firstEdges], index) => {
        const [sourceRole, predicate, targetRole] = edgeRole.split('\u0000');
        const memberEdgeIds = components.flatMap((component) =>
          component.edgesByRole.get(edgeRole)!.map((edge) => edge.id),
        );
        const firstEdge = firstEdges[0];
        const predicateLabel =
          firstEdge.predicateLabel ?? predicate.split(/[#/]/).pop() ?? predicate;
        elements.push({
          data: {
            id: `${motifId}:edge:${index}`,
            source: aggregateIdByRole.get(sourceRole)!,
            target: aggregateIdByRole.get(targetRole)!,
            predicate,
            predicateLabel: `${predicateLabel} ×${memberEdgeIds.length}`,
            aggregate: true,
            aggregateKind: 'repeated-component-edge',
            motifId,
            componentCount: components.length,
            multiplicity: memberEdgeIds.length,
            representedTriples: memberEdgeIds.length,
            direction: 'directed',
            memberEdgeIds,
            predicates: [predicate],
          },
        });
      });

    components.forEach((component) => {
      component.nodes.forEach((node) => claimedNodeIds.add(node.uri));
      component.edges.forEach((edge) => claimedEdgeIds.add(edge.id));
      abstractedNodes += component.nodes.length;
    });
    aggregateNodes += first.nodesByRole.size;
    motifCount++;
  }

  return {
    elements,
    claimedNodeIds,
    claimedEdgeIds,
    expandedEdgeMotifIds,
    abstractedNodes,
    aggregateNodes,
    motifCount,
  };
}

export function buildGraphElements(
  result: QueryResult,
  options: GraphElementsOptions,
): BuiltGraph {
  const { maxNodes } = options;
  const pinned = new Set(options.pinnedUris ?? []);
  const motifSummary =
    options.detailLevel === 'summary'
      ? summarizeRepeatedComponents(
          result,
          pinned,
          new Set(options.expandedMotifIds ?? []),
          maxNodes,
        )
      : {
          elements: [],
          claimedNodeIds: new Set<string>(),
          claimedEdgeIds: new Set<string>(),
          expandedEdgeMotifIds: new Map<string, string>(),
          abstractedNodes: 0,
          aggregateNodes: 0,
          motifCount: 0,
        };
  const workingNodes = result.nodes.filter(
    (node) => !motifSummary.claimedNodeIds.has(node.uri),
  );
  const workingEdges = result.edges.filter(
    (edge) => !motifSummary.claimedEdgeIds.has(edge.id),
  );
  const explicitNodeBudget = Math.max(0, maxNodes - motifSummary.aggregateNodes);

  const totalDegree = new Map<string, number>();
  for (const edge of workingEdges) {
    totalDegree.set(edge.source, (totalDegree.get(edge.source) ?? 0) + 1);
    totalDegree.set(edge.target, (totalDegree.get(edge.target) ?? 0) + 1);
  }

  const allUris = new Set(workingNodes.map((node) => node.uri));
  const queryEntities = new Set<string>();
  for (const row of result.bindings) {
    for (const value of Object.values(row)) {
      const id = bindingGraphId(value);
      if (id) queryEntities.add(id);
    }
  }

  const adjacentToQuery = new Set<string>();
  for (const edge of workingEdges) {
    if (queryEntities.has(edge.source)) adjacentToQuery.add(edge.target);
    if (queryEntities.has(edge.target)) adjacentToQuery.add(edge.source);
  }

  let visibleNodes = workingNodes;
  if (workingNodes.length > explicitNodeBudget) {
    const pinnedNodes = workingNodes.filter((node) => pinned.has(node.uri));
    const queryNodes = workingNodes.filter(
      (node) => queryEntities.has(node.uri) && !pinned.has(node.uri),
    );
    const intermediateNodes = workingNodes.filter(
      (node) =>
        adjacentToQuery.has(node.uri) &&
        !queryEntities.has(node.uri) &&
        !pinned.has(node.uri),
    );
    const contextNodes = workingNodes
      .filter(
        (node) =>
          !pinned.has(node.uri) &&
          !queryEntities.has(node.uri) &&
          !adjacentToQuery.has(node.uri),
      )
      .sort(
        (left, right) =>
          (totalDegree.get(right.uri) ?? 0) - (totalDegree.get(left.uri) ?? 0),
      );
    visibleNodes = [...pinnedNodes, ...queryNodes, ...intermediateNodes, ...contextNodes].slice(
      0,
      explicitNodeBudget,
    );
  }

  const visibleUris = new Set(visibleNodes.map((node) => node.uri));
  const drawnEdges: NormalizedEdge[] = [];
  const drawnDegree = new Map<string, number>();
  let edgesHiddenByTruncation = 0;

  for (const edge of workingEdges) {
    if (visibleUris.has(edge.source) && visibleUris.has(edge.target)) {
      drawnEdges.push(edge);
      drawnDegree.set(edge.source, (drawnDegree.get(edge.source) ?? 0) + 1);
      drawnDegree.set(edge.target, (drawnDegree.get(edge.target) ?? 0) + 1);
    } else if (allUris.has(edge.source) && allUris.has(edge.target)) {
      edgesHiddenByTruncation++;
    }
  }

  const elements: cytoscape.ElementDefinition[] = [...motifSummary.elements];
  const inclusionReasons: Record<GraphInclusionReason, number> = {
    selected: 0,
    'query-entity': 0,
    intermediate: 0,
    context: 0,
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
    const motifId = edge.memberEdgeIds
      .map((memberId) => motifSummary.expandedEdgeMotifIds.get(memberId))
      .find((id): id is string => !!id);
    if (expanded.has(edge.id)) {
      for (const memberId of edge.memberEdgeIds) {
        const member = drawnEdges.find((candidate) => candidate.id === memberId);
        if (member) {
          elements.push({
            data: {
              ...member,
              multiplicity: 1,
              superEdgeId: edge.id,
              ...(motifId ? { motifId } : {}),
            },
          });
        }
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
        ...(edge.multiplicity > 1 ? { aggregate: true } : {}),
        multiplicity: edge.multiplicity,
        memberEdgeIds: edge.memberEdgeIds,
        predicates: edge.predicates,
        ...(motifId ? { motifId } : {}),
      },
    });
  }

  // El layout `preset` usado al crear Cytoscape deja todos los nodos en el mismo
  // punto, así que se entrega una semilla geométrica determinista antes de correr
  // el layout real.
  //
  // Qué hace hoy, para no confundir a quien la lea: en el dibujo inicial NO
  // decide nada. cola arranca con `randomize: true`
  // (`GraphViewComponent.getInitialLayoutOptions`) y descarta estas posiciones,
  // y dagre/grid calculan las suyas. Donde sí manda es en el camino incremental:
  // los nodos que `patchGraph` agrega y que no tienen ningún vecino ya colocado
  // del que colgarse (`placeNewNodes`) conservan esta posición, y el layout
  // incremental corre con `randomize: false`.
  const nodeElements = elements.filter((element) => !('source' in element.data));
  const columns = Math.max(1, Math.ceil(Math.sqrt(nodeElements.length)));
  nodeElements.forEach((element, index) => {
    element.position = {
      x: (index % columns) * 120,
      y: Math.floor(index / columns) * 120,
    };
  });

  return {
    elements,
    drawnNodes: visibleNodes.length + motifSummary.aggregateNodes,
    totalNodes: result.nodes.length,
    edgesHiddenByTruncation,
    inclusionReasons,
    abstractedNodes: motifSummary.abstractedNodes,
    aggregateNodes: motifSummary.aggregateNodes,
    motifCount: motifSummary.motifCount,
  };
}
