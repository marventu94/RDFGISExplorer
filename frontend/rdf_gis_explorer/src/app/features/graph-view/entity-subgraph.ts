import type { NormalizedEdge, NormalizedNode, QueryResult } from '@shared/models';
import { bindingGraphId } from '@shared/stats/lots';

/**
 * Etapa 3 del plan de mejoras del graph-view: modelo PURO del subgrafo de una
 * entidad seleccionada. No depende de Angular ni de Cytoscape y no ejecuta
 * consultas: opera exclusivamente sobre el `QueryResult` ya recuperado.
 *
 * Invariantes:
 * - **Determinismo total.** El mismo input produce el mismo subgrafo y el mismo
 *   orden. Todos los desempates terminan en una comparación por URI/id.
 * - **No se atraviesan hubs.** Un recurso compartido (ciudad, clase RDF,
 *   función comercial) se incluye como frontera, pero jamás sirve de nodo
 *   intermedio para arrastrar otras entidades. Sólo una expansión explícita
 *   del usuario atraviesa un hub.
 * - **Nada se recorta en silencio.** Lo que no entra al presupuesto queda
 *   listado en `omitted` y produce una advertencia en `warnings`.
 * - **Inmutabilidad.** No se mutan el `QueryResult` ni sus nodos/aristas.
 */

/** Sentido de una rama respecto del nodo que la origina. */
export type BranchDirection = 'outgoing' | 'incoming';

/**
 * Por qué un nodo entró al subgrafo. El orden de este union es también el
 * orden de prioridad de admisión (ver `buildEntitySubgraph`).
 */
export type SubgraphInclusionReason =
  | 'root'
  | 'active'
  | 'pinned'
  | 'co-row'
  | 'path'
  | 'expanded'
  | 'context';

export type SubgraphWarningCode =
  /** La raíz no existe en ningún resultado disponible: el subgrafo va vacío. */
  | 'root-missing'
  /** La raíz no estaba en el resultado visible y se resolvió con el completo. */
  | 'root-from-full-result'
  /** El nodo activo pedido no existe en el resultado: se usa la raíz. */
  | 'active-missing'
  /** Se agotó el presupuesto de nodos; hay candidatos en `omitted.nodes`. */
  | 'node-budget-exhausted'
  /** Se agotó el presupuesto de aristas; hay aristas en `omitted.edges`. */
  | 'edge-budget-exhausted'
  /** Entidad de la misma fila que la raíz sin camino en el resultado. */
  | 'disconnected-co-row'
  /** Hubs incluidos como frontera: no se atravesaron automáticamente. */
  | 'hub-not-traversed'
  /** Una rama expandida ya no existe (nodo fuera del subgrafo o sin aristas). */
  | 'stale-branch';

export interface SubgraphWarning {
  code: SubgraphWarningCode;
  /** Mensaje listo para UI (español, sin identificadores técnicos). */
  message: string;
  /** URIs o ids involucrados, en orden determinista. Puede ir vacío. */
  refs: string[];
}

export interface SubgraphBudget {
  /** Tope de nodos del subgrafo, incluida la raíz. */
  maxNodes: number;
  /** Tope de aristas dibujables entre nodos admitidos. */
  maxEdges: number;
  /** Largo máximo (en aristas) de un camino raíz ↔ entidad de la misma fila. */
  maxPathLength: number;
  /** Vecinos distintos a partir de los cuales un nodo se considera hub. */
  hubDegreeThreshold: number;
  /** Saltos desde la raíz que se incorporan como contexto automático. */
  initialDepth: number;
}

/**
 * Decisiones cerradas de la etapa 3 (ver §13 del plan):
 *
 * - **Umbral de hub = 8 vecinos distintos.** Una entidad de dominio del
 *   resultado (inmueble, aviso, persona) rara vez supera 8 vecinos distintos
 *   dentro de un lote; los recursos compartidos (partido, clase RDF, función
 *   comercial) los superan siempre. La raíz nunca se trata como hub.
 * - **Presupuesto = 60 nodos / 120 aristas.** Alcanza para raíz + atributos +
 *   una expansión amplia sin volver al hairball, muy por debajo del cap global
 *   de la vista (`limits.graphMaxNodes`, 300).
 * - **Profundidad inicial = 1 salto.** Precio, fecha, dirección y geometría se
 *   recuperan por co-fila + camino (no por profundidad), así que un salto de
 *   contexto alcanza sin arrastrar el componente conexo.
 * - **Largo máximo de camino = 4 aristas.** Cubre cadenas del tipo
 *   aviso → inmueble → dirección → localidad sin degenerar en búsqueda global.
 */
export const DEFAULT_SUBGRAPH_BUDGET: SubgraphBudget = {
  maxNodes: 60,
  maxEdges: 120,
  maxPathLength: 4,
  hubDegreeThreshold: 8,
  initialDepth: 1,
};

/** Resultados sobre los que se construye el subgrafo. */
export interface EntitySubgraphSource {
  /**
   * Resultado visible (lote actual + filtros). Es la fuente primaria: el
   * subgrafo describe lo que el usuario está viendo.
   */
  visibleResult: QueryResult;
  /**
   * Resultado completo, opcional. Sólo se usa si la raíz no existe en el
   * visible (p. ej. la selección quedó fuera del lote); en ese caso todo el
   * subgrafo se calcula sobre él y se emite `root-from-full-result`.
   */
  fullResult?: QueryResult | null;
}

export interface EntitySubgraphInput extends EntitySubgraphSource {
  /** URI de la entidad raíz. Los bnodes usan el id de grafo (`_:b0`). */
  rootUri: string;
  /** Nodo inspeccionado. Por defecto, la raíz. */
  activeUri?: string | null;
  /** Ramas expandidas explícitamente por el usuario (ids de `SubgraphBranch`). */
  expandedBranchIds?: readonly string[];
  /** Nodos fijados: entran siempre, justo detrás de raíz y activo. */
  pinnedUris?: readonly string[];
  /** Sobrescritura parcial de `DEFAULT_SUBGRAPH_BUDGET`. */
  budget?: Partial<SubgraphBudget>;
}

export interface SubgraphNode {
  uri: string;
  /** Nodo original del `QueryResult` (misma referencia, no se clona ni muta). */
  node: NormalizedNode;
  reason: SubgraphInclusionReason;
  /** Saltos desde la raíz por aristas incluidas; `null` si quedó desconectado. */
  depth: number | null;
  /** Filas del resultado donde el nodo aparece junto a la raíz. */
  rowCount: number;
  /**
   * Vecinos distintos del nodo. Se mide sobre `fullResult` cuando se provee
   * (ser hub es una propiedad del recurso, no del lote); si no, sobre el
   * resultado visible.
   */
  degree: number;
  isRoot: boolean;
  isActive: boolean;
  isPinned: boolean;
  isHub: boolean;
  /** Hub incluido como frontera: sus vecinos no se incorporaron solos. */
  isBoundary: boolean;
}

export interface SubgraphEdge {
  id: string;
  source: string;
  target: string;
  predicate: string;
  /** Etiqueta del predicado si el backend la trajo; si no, la URI completa. */
  predicateLabel: string;
  /** Arista original del `QueryResult` (misma referencia). */
  edge: NormalizedEdge;
}

/**
 * Rama expandible: todas las aristas de un nodo que comparten sentido y
 * predicado. **Los predicados se agrupan por URI completa** (nunca por
 * etiqueta: dos URIs distintas pueden compartir label y fusionarlas mentiría
 * sobre la estructura RDF); la etiqueta viaja aparte, sólo para mostrar.
 */
export interface SubgraphBranch {
  /** Id estable y DOM-safe. Ver `makeBranchId` / `parseBranchId`. */
  id: string;
  /** Nodo desde el que sale la rama (siempre un nodo incluido). */
  nodeUri: string;
  direction: BranchDirection;
  predicate: string;
  predicateLabel: string;
  /** Vecinos de la rama ya presentes en el subgrafo, ordenados por URI. */
  includedUris: string[];
  /** Vecinos de la rama que faltan, ordenados por URI. */
  pendingUris: string[];
  /** Tripletas de la rama (aristas del resultado, incluidas y pendientes). */
  tripleCount: number;
  /** La rama figura en `expandedBranchIds`. */
  expanded: boolean;
  /** Algún vecino pendiente es hub: expandirla incorpora un recurso compartido. */
  reachesHub: boolean;
  /** El nodo de origen es hub: la rama sólo se recorre por acción explícita. */
  fromHub: boolean;
}

export interface SubgraphHub {
  uri: string;
  label: string;
  degree: number;
  /** Vecinos del hub presentes en el subgrafo. */
  includedNeighbours: number;
  /** Vecinos del hub que quedaron fuera (no se atraviesa automáticamente). */
  hiddenNeighbours: number;
}

export interface SubgraphOmission {
  /** URIs candidatas que no entraron al presupuesto, en orden de evaluación. */
  nodes: string[];
  /** Ids de aristas descartadas (por presupuesto o por extremo ausente). */
  edges: string[];
  nodeBudgetExceeded: boolean;
  edgeBudgetExceeded: boolean;
}

export interface SubgraphMetrics {
  nodeCount: number;
  edgeCount: number;
  /** Tripletas representadas: una por arista RDF incluida. */
  tripleCount: number;
  /** Nodos incluidos sólo por ser intermedios de un camino. */
  intermediateCount: number;
  /** Nodos vecinos del subgrafo que no están incluidos (frontera a 1 salto). */
  frontierNodeCount: number;
  /** Nodos incluidos + frontera: tamaño de la estructura disponible inmediata. */
  availableNodeCount: number;
  hubCount: number;
  /** Filas del resultado fuente que mencionan la raíz. */
  rowCount: number;
  /** Entidades distintas que comparten fila con la raíz. */
  coRowEntityCount: number;
  /** Profundidad máxima alcanzada desde la raíz (0 si sólo está la raíz). */
  maxDepth: number;
}

export interface EntitySubgraph {
  rootUri: string;
  /** Nodo activo efectivo (puede diferir del pedido si no existía). */
  activeUri: string;
  /** `'visible'` salvo que la raíz sólo exista en el resultado completo. */
  sourceScope: 'visible' | 'full' | 'none';
  nodes: SubgraphNode[];
  edges: SubgraphEdge[];
  branches: SubgraphBranch[];
  hubs: SubgraphHub[];
  omitted: SubgraphOmission;
  metrics: SubgraphMetrics;
  warnings: SubgraphWarning[];
  /** Presupuesto efectivamente aplicado (defaults + overrides). */
  budget: SubgraphBudget;
}

/** Id de rama estable: DOM-safe, sin ambigüedad ante URIs con separadores. */
export function makeBranchId(
  nodeUri: string,
  direction: BranchDirection,
  predicate: string,
): string {
  return `branch:${direction}:${encodeURIComponent(predicate)}:${encodeURIComponent(nodeUri)}`;
}

/** Inverso de `makeBranchId`. Devuelve `null` si el id no tiene ese formato. */
export function parseBranchId(
  id: string,
): { nodeUri: string; direction: BranchDirection; predicate: string } | null {
  const parts = id.split(':');
  if (parts.length !== 4 || parts[0] !== 'branch') return null;
  const direction = parts[1];
  if (direction !== 'outgoing' && direction !== 'incoming') return null;
  try {
    return {
      direction,
      predicate: decodeURIComponent(parts[2]),
      nodeUri: decodeURIComponent(parts[3]),
    };
  } catch {
    return null;
  }
}

function compareUri(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function emptySubgraph(
  rootUri: string,
  budget: SubgraphBudget,
  warnings: SubgraphWarning[],
): EntitySubgraph {
  return {
    rootUri,
    activeUri: rootUri,
    sourceScope: 'none',
    nodes: [],
    edges: [],
    branches: [],
    hubs: [],
    omitted: { nodes: [], edges: [], nodeBudgetExceeded: false, edgeBudgetExceeded: false },
    metrics: {
      nodeCount: 0,
      edgeCount: 0,
      tripleCount: 0,
      intermediateCount: 0,
      frontierNodeCount: 0,
      availableNodeCount: 0,
      hubCount: 0,
      rowCount: 0,
      coRowEntityCount: 0,
      maxDepth: 0,
    },
    warnings,
    budget,
  };
}

interface Incidence {
  /** Aristas incidentes por nodo, en el orden original del resultado. */
  edges: Map<string, NormalizedEdge[]>;
  /** Vecinos distintos por nodo (excluye el propio nodo). */
  neighbours: Map<string, Set<string>>;
}

/** Vecinos distintos por nodo (excluye self-loops y extremos ausentes). */
function computeDegrees(result: QueryResult): Map<string, number> {
  const uris = new Set(result.nodes.map((node) => node.uri));
  const neighbours = new Map<string, Set<string>>();
  const link = (from: string, to: string): void => {
    if (from === to) return;
    const set = neighbours.get(from);
    if (set) set.add(to);
    else neighbours.set(from, new Set([to]));
  };
  for (const edge of result.edges) {
    if (!uris.has(edge.source) || !uris.has(edge.target)) continue;
    link(edge.source, edge.target);
    link(edge.target, edge.source);
  }
  const degrees = new Map<string, number>();
  for (const [uri, set] of neighbours) degrees.set(uri, set.size);
  return degrees;
}

function indexIncidence(result: QueryResult, nodeUris: ReadonlySet<string>): Incidence {
  const edges = new Map<string, NormalizedEdge[]>();
  const neighbours = new Map<string, Set<string>>();
  const push = (uri: string, edge: NormalizedEdge): void => {
    const list = edges.get(uri);
    if (list) list.push(edge);
    else edges.set(uri, [edge]);
  };
  const link = (uri: string, other: string): void => {
    if (uri === other) return;
    const set = neighbours.get(uri);
    if (set) set.add(other);
    else neighbours.set(uri, new Set([other]));
  };

  for (const edge of result.edges) {
    // Una arista con un extremo fuera de `nodes` no es dibujable ni recorrible.
    if (!nodeUris.has(edge.source) || !nodeUris.has(edge.target)) continue;
    push(edge.source, edge);
    if (edge.target !== edge.source) push(edge.target, edge);
    link(edge.source, edge.target);
    link(edge.target, edge.source);
  }
  return { edges, neighbours };
}

/**
 * Construye el subgrafo de la entidad `rootUri`.
 *
 * Orden de prioridad de admisión (§7 del plan):
 * 1. raíz;
 * 2. nodo activo y nodos fijados (prioridad absoluta, §8);
 * 3. entidades que aparecen en las mismas filas que la raíz;
 * 4. nodos intermedios de los caminos que las conectan (sin atravesar hubs);
 * 5. vecinos de las ramas expandidas explícitamente (a punto fijo, para que
 *    una expansión encadenada sobre un nodo recién admitido también valga);
 * 6. contexto: vecinos de la raíz hasta `budget.initialDepth` saltos.
 *
 * Lo que no entra al presupuesto queda en `omitted` con su advertencia.
 */
export function buildEntitySubgraph(input: EntitySubgraphInput): EntitySubgraph {
  const budget: SubgraphBudget = { ...DEFAULT_SUBGRAPH_BUDGET, ...input.budget };
  const warnings: SubgraphWarning[] = [];
  const { rootUri } = input;

  const visibleHasRoot = input.visibleResult.nodes.some((n) => n.uri === rootUri);
  let source: QueryResult;
  let sourceScope: 'visible' | 'full';
  if (visibleHasRoot) {
    source = input.visibleResult;
    sourceScope = 'visible';
  } else if (input.fullResult?.nodes.some((n) => n.uri === rootUri)) {
    source = input.fullResult;
    sourceScope = 'full';
    warnings.push({
      code: 'root-from-full-result',
      message:
        'La entidad no está en el lote visible: la estructura se calculó sobre el resultado completo.',
      refs: [rootUri],
    });
  } else {
    warnings.push({
      code: 'root-missing',
      message: 'La entidad seleccionada no existe en el resultado: no hay estructura para mostrar.',
      refs: [rootUri],
    });
    return emptySubgraph(rootUri, budget, warnings);
  }

  const nodeByUri = new Map<string, NormalizedNode>();
  for (const node of source.nodes) {
    if (!nodeByUri.has(node.uri)) nodeByUri.set(node.uri, node);
  }
  const nodeUris = new Set(nodeByUri.keys());
  const { edges: incidentEdges, neighbours } = indexIncidence(source, nodeUris);

  // El grado que define un hub se mide sobre el resultado completo cuando
  // existe: un partido compartido por 200 inmuebles sigue siendo un recurso
  // compartido aunque el lote visible sólo muestre tres de sus direcciones.
  const globalDegrees =
    input.fullResult && input.fullResult !== source ? computeDegrees(input.fullResult) : null;
  const degreeOf = (uri: string): number =>
    globalDegrees?.get(uri) ?? neighbours.get(uri)?.size ?? 0;
  const isHub = (uri: string): boolean =>
    uri !== rootUri && degreeOf(uri) >= budget.hubDegreeThreshold;

  // --- Filas relacionadas -------------------------------------------------
  // Todas las filas que mencionan la raíz cuentan: una entidad que comparte
  // varias filas con la raíz pesa más que una que comparte una sola.
  const coRowCount = new Map<string, number>();
  const coRowFirstIndex = new Map<string, number>();
  let rowCount = 0;
  source.bindings.forEach((row, index) => {
    const ids: string[] = [];
    let mentionsRoot = false;
    for (const value of Object.values(row)) {
      const id = bindingGraphId(value);
      if (id === null) continue;
      if (id === rootUri) mentionsRoot = true;
      else ids.push(id);
    }
    if (!mentionsRoot) return;
    rowCount++;
    for (const id of new Set(ids)) {
      if (!nodeUris.has(id)) continue;
      coRowCount.set(id, (coRowCount.get(id) ?? 0) + 1);
      if (!coRowFirstIndex.has(id)) coRowFirstIndex.set(id, index);
    }
  });

  const coRowUris = [...coRowCount.keys()].sort((a, b) => {
    const byCount = (coRowCount.get(b) ?? 0) - (coRowCount.get(a) ?? 0);
    if (byCount !== 0) return byCount;
    const byRow = (coRowFirstIndex.get(a) ?? 0) - (coRowFirstIndex.get(b) ?? 0);
    if (byRow !== 0) return byRow;
    return compareUri(a, b);
  });

  // --- Caminos sin atravesar hubs ----------------------------------------
  // BFS desde la raíz sobre el grafo no dirigido, con vecinos ordenados por URI
  // (primer visitante gana → camino mínimo y determinista). Los hubs pueden ser
  // destino, pero nunca nodo interior: así un partido compartido no sirve de
  // atajo entre dos inmuebles.
  const parents = new Map<string, string | null>([[rootUri, null]]);
  const distance = new Map<string, number>([[rootUri, 0]]);
  let frontier = [rootUri];
  for (let hop = 1; hop <= budget.maxPathLength && frontier.length > 0; hop++) {
    const next: string[] = [];
    for (const uri of frontier) {
      // La raíz siempre se recorre; un hub interior, nunca.
      if (uri !== rootUri && isHub(uri)) continue;
      const adjacent = [...(neighbours.get(uri) ?? [])].sort(compareUri);
      for (const neighbour of adjacent) {
        if (parents.has(neighbour)) continue;
        parents.set(neighbour, uri);
        distance.set(neighbour, hop);
        next.push(neighbour);
      }
    }
    frontier = next;
  }
  const pathTo = (uri: string): string[] | null => {
    if (!parents.has(uri)) return null;
    const path: string[] = [];
    let cursor: string | null | undefined = uri;
    while (cursor != null) {
      path.unshift(cursor);
      cursor = parents.get(cursor) ?? null;
    }
    return path;
  };

  // --- Admisión por presupuesto ------------------------------------------
  const admitted = new Map<string, SubgraphInclusionReason>();
  const admissionOrder: string[] = [];
  const omittedNodes: string[] = [];
  let nodeBudgetExceeded = false;

  const admit = (uri: string, reason: SubgraphInclusionReason): boolean => {
    if (admitted.has(uri)) return true;
    if (!nodeUris.has(uri)) return false;
    if (admitted.size >= budget.maxNodes) {
      nodeBudgetExceeded = true;
      if (!omittedNodes.includes(uri)) omittedNodes.push(uri);
      return false;
    }
    admitted.set(uri, reason);
    admissionOrder.push(uri);
    return true;
  };

  admit(rootUri, 'root');

  const requestedActive = input.activeUri ?? rootUri;
  let activeUri = rootUri;
  if (requestedActive !== rootUri) {
    if (nodeUris.has(requestedActive)) {
      activeUri = requestedActive;
      admit(activeUri, 'active');
    } else {
      warnings.push({
        code: 'active-missing',
        message: 'El nodo activo ya no está en el resultado: se volvió a la raíz.',
        refs: [requestedActive],
      });
    }
  }

  for (const uri of input.pinnedUris ?? []) {
    admit(uri, 'pinned');
  }

  const disconnectedCoRow: string[] = [];
  const pathInteriors: string[] = [];
  for (const uri of coRowUris) {
    admit(uri, 'co-row');
    const path = pathTo(uri);
    if (path === null) {
      disconnectedCoRow.push(uri);
      continue;
    }
    for (const step of path.slice(1, -1)) {
      if (!pathInteriors.includes(step)) pathInteriors.push(step);
    }
  }
  for (const uri of pathInteriors) {
    admit(uri, 'path');
  }

  // Expansiones explícitas, a punto fijo: expandir A→B y luego B→C funciona
  // aunque B sólo exista gracias a la primera expansión.
  const expandedBranchIds = [...new Set(input.expandedBranchIds ?? [])];
  const staleBranches: string[] = [];
  const applyExpansions = (): void => {
    let changed = true;
    while (changed) {
      changed = false;
      for (const branchId of expandedBranchIds) {
        const parsed = parseBranchId(branchId);
        if (!parsed || !admitted.has(parsed.nodeUri)) continue;
        const targets = new Set<string>();
        for (const edge of incidentEdges.get(parsed.nodeUri) ?? []) {
          if (edge.predicate !== parsed.predicate) continue;
          const outgoing = edge.source === parsed.nodeUri;
          const matches = parsed.direction === 'outgoing' ? outgoing : edge.target === parsed.nodeUri;
          if (!matches) continue;
          targets.add(outgoing ? edge.target : edge.source);
        }
        for (const target of [...targets].sort(compareUri)) {
          if (admitted.has(target)) continue;
          if (admit(target, 'expanded')) changed = true;
        }
      }
    }
  };
  applyExpansions();

  // Contexto: vecinos de la raíz hasta `initialDepth` saltos. Primero los que
  // no son hub y con menor grado (atributos y nodos estructurales propios
  // antes que recursos compartidos), desempate por URI.
  const contextUris: string[] = [];
  for (const [uri, dist] of distance) {
    if (dist === 0 || dist > budget.initialDepth) continue;
    if (admitted.has(uri)) continue;
    contextUris.push(uri);
  }
  contextUris.sort((a, b) => {
    const hubDelta = Number(isHub(a)) - Number(isHub(b));
    if (hubDelta !== 0) return hubDelta;
    const degreeDelta = degreeOf(a) - degreeOf(b);
    if (degreeDelta !== 0) return degreeDelta;
    return compareUri(a, b);
  });
  for (const uri of contextUris) {
    admit(uri, 'context');
  }

  // Segunda pasada: ramas expandidas cuyo nodo recién entró como contexto.
  applyExpansions();

  for (const branchId of expandedBranchIds) {
    const parsed = parseBranchId(branchId);
    if (!parsed || !admitted.has(parsed.nodeUri)) staleBranches.push(branchId);
  }

  // --- Aristas ------------------------------------------------------------
  const rankOf = new Map(admissionOrder.map((uri, index) => [uri, index]));
  const candidateEdges = source.edges
    .map((edge, index) => ({ edge, index }))
    .filter(({ edge }) => admitted.has(edge.source) && admitted.has(edge.target))
    .sort((a, b) => {
      const rankA = Math.max(rankOf.get(a.edge.source) ?? 0, rankOf.get(a.edge.target) ?? 0);
      const rankB = Math.max(rankOf.get(b.edge.source) ?? 0, rankOf.get(b.edge.target) ?? 0);
      if (rankA !== rankB) return rankA - rankB;
      return a.index - b.index;
    });

  const includedEdges: SubgraphEdge[] = [];
  const omittedEdges: string[] = [];
  for (const { edge } of candidateEdges) {
    if (includedEdges.length >= budget.maxEdges) {
      omittedEdges.push(edge.id);
      continue;
    }
    includedEdges.push({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      predicate: edge.predicate,
      predicateLabel: edge.predicateLabel ?? edge.predicate,
      edge,
    });
  }
  const edgeBudgetExceeded = omittedEdges.length > 0;
  // Las aristas cuyo otro extremo quedó fuera del presupuesto también se
  // reportan: explican por qué un nodo admitido se ve suelto.
  for (const edge of source.edges) {
    if (admitted.has(edge.source) && admitted.has(edge.target)) continue;
    if (!admitted.has(edge.source) && !admitted.has(edge.target)) continue;
    if (!nodeUris.has(edge.source) || !nodeUris.has(edge.target)) continue;
    omittedEdges.push(edge.id);
  }

  // --- Profundidad sobre las aristas incluidas ---------------------------
  const includedAdjacency = new Map<string, Set<string>>();
  const linkIncluded = (from: string, to: string): void => {
    const set = includedAdjacency.get(from);
    if (set) set.add(to);
    else includedAdjacency.set(from, new Set([to]));
  };
  for (const edge of includedEdges) {
    if (edge.source === edge.target) continue;
    linkIncluded(edge.source, edge.target);
    linkIncluded(edge.target, edge.source);
  }
  const depths = new Map<string, number>([[rootUri, 0]]);
  let depthFrontier = [rootUri];
  let currentDepth = 0;
  while (depthFrontier.length > 0) {
    currentDepth++;
    const next: string[] = [];
    for (const uri of depthFrontier) {
      for (const neighbour of [...(includedAdjacency.get(uri) ?? [])].sort(compareUri)) {
        if (depths.has(neighbour)) continue;
        depths.set(neighbour, currentDepth);
        next.push(neighbour);
      }
    }
    depthFrontier = next;
  }

  // --- Nodos --------------------------------------------------------------
  const pinnedSet = new Set(input.pinnedUris ?? []);
  const nodes: SubgraphNode[] = admissionOrder.map((uri) => {
    const hub = isHub(uri);
    const includedNeighbours = includedAdjacency.get(uri)?.size ?? 0;
    return {
      uri,
      node: nodeByUri.get(uri)!,
      reason: admitted.get(uri)!,
      depth: depths.get(uri) ?? null,
      rowCount: uri === rootUri ? rowCount : (coRowCount.get(uri) ?? 0),
      degree: degreeOf(uri),
      isRoot: uri === rootUri,
      isActive: uri === activeUri,
      isPinned: pinnedSet.has(uri),
      isHub: hub,
      isBoundary: hub && includedNeighbours < degreeOf(uri),
    };
  });

  // --- Ramas --------------------------------------------------------------
  const branches: SubgraphBranch[] = [];
  const expandedSet = new Set(expandedBranchIds);
  for (const uri of admissionOrder) {
    const grouped = new Map<string, { direction: BranchDirection; predicate: string; label: string; targets: Set<string>; triples: number }>();
    for (const edge of incidentEdges.get(uri) ?? []) {
      const directions: BranchDirection[] =
        edge.source === edge.target
          ? ['outgoing']
          : edge.source === uri
            ? ['outgoing']
            : ['incoming'];
      for (const direction of directions) {
        const key = `${direction}\u0000${edge.predicate}`;
        const entry =
          grouped.get(key) ??
          {
            direction,
            predicate: edge.predicate,
            label: edge.predicateLabel ?? edge.predicate,
            targets: new Set<string>(),
            triples: 0,
          };
        entry.targets.add(direction === 'outgoing' ? edge.target : edge.source);
        entry.triples++;
        grouped.set(key, entry);
      }
    }
    const nodeBranches = [...grouped.values()]
      .map((entry) => {
        const targets = [...entry.targets].sort(compareUri);
        const includedUris = targets.filter((target) => admitted.has(target));
        const pendingUris = targets.filter((target) => !admitted.has(target));
        const id = makeBranchId(uri, entry.direction, entry.predicate);
        return {
          id,
          nodeUri: uri,
          direction: entry.direction,
          predicate: entry.predicate,
          predicateLabel: entry.label,
          includedUris,
          pendingUris,
          tripleCount: entry.triples,
          expanded: expandedSet.has(id),
          reachesHub: pendingUris.some((target) => isHub(target)),
          fromHub: isHub(uri),
        } satisfies SubgraphBranch;
      })
      .sort((a, b) => {
        if (a.direction !== b.direction) return a.direction === 'outgoing' ? -1 : 1;
        return compareUri(a.predicate, b.predicate);
      });
    branches.push(...nodeBranches);
  }

  // --- Hubs y frontera ----------------------------------------------------
  const frontierUris = new Set<string>();
  for (const uri of admissionOrder) {
    for (const neighbour of neighbours.get(uri) ?? []) {
      if (!admitted.has(neighbour)) frontierUris.add(neighbour);
    }
  }

  const hubs: SubgraphHub[] = nodes
    .filter((n) => n.isHub)
    .map((n) => {
      const includedNeighbours = includedAdjacency.get(n.uri)?.size ?? 0;
      return {
        uri: n.uri,
        label: n.node.label,
        degree: n.degree,
        includedNeighbours,
        hiddenNeighbours: Math.max(0, n.degree - includedNeighbours),
      };
    })
    .sort((a, b) => b.degree - a.degree || compareUri(a.uri, b.uri));

  // --- Advertencias -------------------------------------------------------
  if (nodeBudgetExceeded) {
    warnings.push({
      code: 'node-budget-exhausted',
      message: `El presupuesto de ${budget.maxNodes} nodos se agotó: ${omittedNodes.length} elemento(s) quedaron fuera.`,
      refs: [...omittedNodes],
    });
  }
  if (edgeBudgetExceeded) {
    warnings.push({
      code: 'edge-budget-exhausted',
      message: `El presupuesto de ${budget.maxEdges} relaciones se agotó: hay relaciones sin dibujar.`,
      refs: [...omittedEdges],
    });
  }
  if (disconnectedCoRow.length > 0) {
    warnings.push({
      code: 'disconnected-co-row',
      message:
        'Hay entidades de las mismas filas sin un camino de relaciones en el resultado: se muestran sueltas.',
      refs: [...disconnectedCoRow],
    });
  }
  const boundaryHubs = hubs.filter((hub) => hub.hiddenNeighbours > 0);
  if (boundaryHubs.length > 0) {
    warnings.push({
      code: 'hub-not-traversed',
      message:
        'Hay recursos compartidos que se muestran como frontera: sus relaciones se incorporan sólo al expandirlos.',
      refs: boundaryHubs.map((hub) => hub.uri),
    });
  }
  if (staleBranches.length > 0) {
    warnings.push({
      code: 'stale-branch',
      message: 'Hay ramas expandidas que ya no existen en el resultado actual.',
      refs: [...staleBranches].sort(compareUri),
    });
  }

  const maxDepth = nodes.reduce((max, n) => (n.depth != null && n.depth > max ? n.depth : max), 0);

  return {
    rootUri,
    activeUri,
    sourceScope,
    nodes,
    edges: includedEdges,
    branches,
    hubs,
    omitted: {
      nodes: omittedNodes,
      edges: omittedEdges,
      nodeBudgetExceeded,
      edgeBudgetExceeded,
    },
    metrics: {
      nodeCount: nodes.length,
      edgeCount: includedEdges.length,
      tripleCount: includedEdges.length,
      intermediateCount: nodes.filter((n) => n.reason === 'path').length,
      frontierNodeCount: frontierUris.size,
      availableNodeCount: nodes.length + frontierUris.size,
      hubCount: hubs.length,
      rowCount,
      coRowEntityCount: coRowUris.length,
      maxDepth,
    },
    warnings,
    budget,
  };
}
