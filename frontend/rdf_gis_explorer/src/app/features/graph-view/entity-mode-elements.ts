import type cytoscape from 'cytoscape';
import type {
  BranchDirection,
  EntitySubgraph,
  SubgraphBranch,
  SubgraphNode,
} from './entity-subgraph';

/**
 * Etapa 5 del plan de mejoras del graph-view: capa de PRESENTACIÓN del modo
 * entidad. Traduce el subgrafo puro de la etapa 3 (`EntitySubgraph`) a los
 * `ElementDefinition` de Cytoscape y a los textos de los controles.
 *
 * Sigue siendo código puro —sin Angular, sin instancia de Cytoscape, sin DOM—
 * para que el componente quede como glue y todo lo que se ve se pueda testear
 * sin renderizar. Nada acá muta el subgrafo ni consulta al backend.
 */

/**
 * Papel visual de un nodo en el modo entidad. El orden de resolución es
 * jerárquico: raíz > activo > fijado > frontera > hub > miembro, de modo que un
 * nodo nunca cambia de aspecto por dos motivos a la vez.
 */
export type EntityNodeRole = 'root' | 'active' | 'pinned' | 'boundary' | 'hub' | 'member';

export interface EntityModeGraph {
  elements: cytoscape.ElementDefinition[];
  nodeCount: number;
  edgeCount: number;
}

export interface EntityBranchItem {
  id: string;
  nodeUri: string;
  nodeLabel: string;
  direction: BranchDirection;
  /** Predicado legible, con la flecha del sentido. */
  label: string;
  /** Conteos: visibles, disponibles y tripletas representadas. */
  detail: string;
  includedCount: number;
  pendingCount: number;
  tripleCount: number;
  expanded: boolean;
  /** La rama llega a un recurso compartido: se avisa antes de expandir. */
  reachesHub: boolean;
  canExpand: boolean;
  canCollapse: boolean;
  /** Texto completo para lectores de pantalla. */
  ariaLabel: string;
}

export interface EntityCrumb {
  uri: string;
  label: string;
  shortUri: string;
  /** Última raíz del recorrido: es la vigente. */
  current: boolean;
}

/** Flecha del sentido de una rama respecto del nodo que la origina. */
const DIRECTION_MARK: Record<BranchDirection, string> = {
  outgoing: '→',
  incoming: '←',
};

/**
 * URI abreviada para los encabezados. No reemplaza al identificador completo:
 * el valor entero sigue viajando en el `title`/tooltip del control.
 */
export function shortenUri(uri: string): string {
  if (!uri) return '';
  if (uri.startsWith('_:')) return uri;
  const hash = uri.lastIndexOf('#');
  if (hash >= 0 && hash < uri.length - 1) return `…#${uri.slice(hash + 1)}`;
  const parts = uri.split('/').filter(Boolean);
  if (parts.length <= 2) return uri;
  return `…/${parts.slice(-2).join('/')}`;
}

export function entityNodeRole(node: SubgraphNode): EntityNodeRole {
  if (node.isRoot) return 'root';
  if (node.isActive) return 'active';
  if (node.isPinned) return 'pinned';
  if (node.isBoundary) return 'boundary';
  if (node.isHub) return 'hub';
  return 'member';
}

function cssClassesFor(node: SubgraphNode, pending: number): string {
  const classes = ['entity-node', `entity-role-${entityNodeRole(node)}`];
  if (node.isPinned) classes.push('entity-pinned');
  if (node.isHub) classes.push('entity-hub');
  if (node.isBoundary) classes.push('entity-boundary');
  if (pending > 0) classes.push('entity-expandable');
  return classes.join(' ');
}

/**
 * Elementos de Cytoscape del subgrafo explorado.
 *
 * A diferencia de `buildGraphElements` (vista de resultado) acá **no se recorta
 * nada**: el presupuesto ya lo aplicó la etapa 3 y lo que no entró está en
 * `subgraph.omitted`. Tampoco se agregan aristas paralelas: en el modo entidad
 * cada relación RDF se dibuja tal cual, que es lo que el usuario vino a leer.
 */
export function buildEntityModeElements(subgraph: EntitySubgraph): EntityModeGraph {
  const drawnDegree = new Map<string, number>();
  for (const edge of subgraph.edges) {
    drawnDegree.set(edge.source, (drawnDegree.get(edge.source) ?? 0) + 1);
    if (edge.target !== edge.source) {
      drawnDegree.set(edge.target, (drawnDegree.get(edge.target) ?? 0) + 1);
    }
  }

  const pendingByNode = new Map<string, number>();
  for (const branch of subgraph.branches) {
    if (branch.pendingUris.length === 0) continue;
    pendingByNode.set(
      branch.nodeUri,
      (pendingByNode.get(branch.nodeUri) ?? 0) + branch.pendingUris.length,
    );
  }

  const elements: cytoscape.ElementDefinition[] = [];

  for (const node of subgraph.nodes) {
    const pending = pendingByNode.get(node.uri) ?? 0;
    elements.push({
      data: {
        id: node.uri,
        label: node.node.label,
        classUri: node.node.classes?.[0] ?? '',
        classes: node.node.classes ?? [],
        queryVariable: node.node.queryVariable ?? '',
        degree: drawnDegree.get(node.uri) ?? 0,
        totalDegree: node.degree,
        inclusionReason: node.reason,
        entityRole: entityNodeRole(node),
        entityDepth: node.depth,
        entityRowCount: node.rowCount,
        entityPending: pending,
        entityHub: node.isHub,
        entityBoundary: node.isBoundary,
        entityPinned: node.isPinned,
      },
      classes: cssClassesFor(node, pending),
    });
  }

  for (const edge of subgraph.edges) {
    elements.push({
      data: {
        id: edge.id,
        source: edge.source,
        target: edge.target,
        predicate: edge.predicate,
        predicateLabel: edge.predicateLabel,
        multiplicity: 1,
      },
      classes: 'entity-edge',
    });
  }

  // Semilla geométrica determinista: Cytoscape se crea con layout `preset`, así
  // que sin posiciones los nodos nuevos del camino incremental arrancarían
  // todos en (0,0). Mismo criterio que `graph-elements.ts`.
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
    nodeCount: subgraph.nodes.length,
    edgeCount: subgraph.edges.length,
  };
}

/** Índice uri → etiqueta del subgrafo, con la URI como fallback. */
export function entityLabelResolver(subgraph: EntitySubgraph | null): (uri: string) => string {
  const labels = new Map<string, string>();
  for (const node of subgraph?.nodes ?? []) labels.set(node.uri, node.node.label || node.uri);
  return (uri: string) => labels.get(uri) ?? uri;
}

function branchItem(
  branch: SubgraphBranch,
  labelOf: (uri: string) => string,
  options: { withNode: boolean },
): EntityBranchItem {
  const mark = DIRECTION_MARK[branch.direction];
  const predicate = branch.predicateLabel || branch.predicate;
  const nodeLabel = labelOf(branch.nodeUri);
  const label = options.withNode ? `${nodeLabel} ${mark} ${predicate}` : `${mark} ${predicate}`;

  const detail: string[] = [];
  if (branch.includedUris.length > 0) detail.push(`${branch.includedUris.length} visibles`);
  if (branch.pendingUris.length > 0) detail.push(`${branch.pendingUris.length} disponibles`);
  detail.push(`${branch.tripleCount} ${branch.tripleCount === 1 ? 'tripleta' : 'tripletas'}`);
  if (branch.reachesHub) detail.push('recurso compartido');

  return {
    id: branch.id,
    nodeUri: branch.nodeUri,
    nodeLabel,
    direction: branch.direction,
    label,
    detail: detail.join(' · '),
    includedCount: branch.includedUris.length,
    pendingCount: branch.pendingUris.length,
    tripleCount: branch.tripleCount,
    expanded: branch.expanded,
    reachesHub: branch.reachesHub,
    canExpand: branch.pendingUris.length > 0 && !branch.expanded,
    canCollapse: branch.expanded,
    ariaLabel:
      `${branch.direction === 'outgoing' ? 'Sale' : 'Entra'} por ${predicate} desde ${nodeLabel}. ` +
      `${detail.join(', ')}.`,
  };
}

/** Ramas del nodo activo: son las que los controles contextuales operan. */
export function activeBranchItems(subgraph: EntitySubgraph | null): EntityBranchItem[] {
  if (!subgraph) return [];
  const labelOf = entityLabelResolver(subgraph);
  return subgraph.branches
    .filter((branch) => branch.nodeUri === subgraph.activeUri)
    .map((branch) => branchItem(branch, labelOf, { withNode: false }));
}

/**
 * Ramas expandibles del resto de la estructura, para que el usuario vea qué
 * más hay sin tener que activar cada nodo. Ordenadas por cercanía a la raíz
 * (el orden determinista que ya trae `subgraph.branches`) y acotadas.
 */
export function otherBranchItems(
  subgraph: EntitySubgraph | null,
  limit = 6,
): EntityBranchItem[] {
  if (!subgraph) return [];
  const labelOf = entityLabelResolver(subgraph);
  const depthByUri = new Map(
    subgraph.nodes.map((node) => [node.uri, node.depth ?? Number.MAX_SAFE_INTEGER]),
  );
  return subgraph.branches
    .filter(
      (branch) =>
        branch.nodeUri !== subgraph.activeUri &&
        branch.pendingUris.length > 0 &&
        !branch.expanded,
    )
    .map((branch, index) => ({ branch, index }))
    .sort((a, b) => {
      const depthA = depthByUri.get(a.branch.nodeUri) ?? Number.MAX_SAFE_INTEGER;
      const depthB = depthByUri.get(b.branch.nodeUri) ?? Number.MAX_SAFE_INTEGER;
      if (depthA !== depthB) return depthA - depthB;
      return a.index - b.index;
    })
    .slice(0, limit)
    .map(({ branch }) => branchItem(branch, labelOf, { withNode: true }));
}

/** Breadcrumb de raíces recorridas; la última es la vigente. */
export function entityBreadcrumb(
  uris: readonly string[],
  labelOf: (uri: string) => string,
): EntityCrumb[] {
  return uris.map((uri, index) => ({
    uri,
    label: labelOf(uri),
    shortUri: shortenUri(uri),
    current: index === uris.length - 1,
  }));
}

/**
 * Indicadores de elementos visibles, disponibles y omitidos (§9 del plan).
 * Nunca se calla lo que quedó afuera: si el presupuesto recortó algo, aparece.
 */
export function entityMetricsLabel(subgraph: EntitySubgraph | null): string {
  if (!subgraph) return '';
  const { metrics, omitted } = subgraph;
  const parts = [
    `${metrics.nodeCount} ${metrics.nodeCount === 1 ? 'nodo' : 'nodos'}`,
    `${metrics.edgeCount} ${metrics.edgeCount === 1 ? 'relación' : 'relaciones'}`,
    `${metrics.tripleCount} ${metrics.tripleCount === 1 ? 'tripleta' : 'tripletas'}`,
  ];
  if (metrics.availableNodeCount > metrics.nodeCount) {
    parts.push(`${metrics.availableNodeCount} disponibles`);
  }
  if (omitted.nodes.length > 0 || omitted.edges.length > 0) {
    const omittedParts: string[] = [];
    if (omitted.nodes.length > 0) omittedParts.push(`${omitted.nodes.length} nodos`);
    if (omitted.edges.length > 0) omittedParts.push(`${omitted.edges.length} relaciones`);
    parts.push(`omitidos: ${omittedParts.join(' y ')}`);
  }
  return parts.join(' · ');
}

/** Advertencias del subgrafo en un solo texto accesible. */
export function entityWarningsLabel(subgraph: EntitySubgraph | null): string {
  if (!subgraph || subgraph.warnings.length === 0) return '';
  return subgraph.warnings.map((warning) => warning.message).join(' ');
}
