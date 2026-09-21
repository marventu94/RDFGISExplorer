import type { BindingValue } from '@shared/models';
import { aggregateParallelEdges, type SuperEdge } from './graph-abstraction';
import type { EntitySubgraph, SubgraphBranch, SubgraphNode } from './entity-subgraph';

/**
 * Etapa 6 del plan de mejoras del graph-view (parte 2 de 2): generador PURO
 * del texto que se copia al portapapeles.
 *
 * Invariantes (§10 del plan):
 * - **Determinismo.** Sin `Date.now()`, sin `Math.random()`, sin recorrer
 *   objetos en orden no definido: el mismo subgrafo produce siempre el mismo
 *   texto, byte a byte. Eso permite snapshots estables en los tests.
 * - **Identificadores inequívocos.** Las tripletas se escriben con URIs
 *   completas entre `<>` y blank nodes opacos (`_:b0`). Las etiquetas
 *   acompañan, nunca reemplazan.
 * - **No se inventan tripletas.** `NormalizedNode.attributes` está indexado por
 *   *variable SPARQL*, no por predicado: esos valores se listan en una sección
 *   aparte, explícitamente marcada como "no son tripletas".
 * - **Conteos exactos.** Cada arista RDF incluida cuenta como una tripleta
 *   representada; las aristas paralelas se informan además como super-arista
 *   con su multiplicidad, de modo que la suma de multiplicidades es igual al
 *   total de tripletas.
 * - **El alcance se anuncia.** El encabezado distingue vista explorada de
 *   estructura disponible, y de qué resultado se calculó (lote visible o
 *   resultado completo).
 */

/** Qué porción se está copiando. */
export type SummaryScope = 'view' | 'structure';

/** Contexto de lote del resultado, tal como lo publica `SelectionService`. */
export interface SummaryLotInfo {
  /** Lote actual, 1-based. */
  currentLot: number;
  lotCount: number;
  /** Filas del resultado filtrado completo. */
  totalRows?: number;
  /** Filas del lote visible. */
  visibleRows?: number;
  /** `meta.truncated`: el backend recortó el resultado. */
  truncated?: boolean;
}

export interface EntitySummaryOptions {
  scope: SummaryScope;
  lot?: SummaryLotInfo | null;
  /**
   * Sólo para `scope: 'structure'`: `false` marca el alcance como incompleto
   * (presupuesto agotado). Ver `buildAvailableStructure`.
   */
  structureComplete?: boolean;
  /** Qué atributos listar. `'root'` por defecto. */
  attributes?: 'root' | 'all' | 'none';
  /** Tope de URIs listadas en las secciones de omisión. Default 20. */
  maxListedOmissions?: number;
  /** Separador de línea. Default `'\n'`. */
  eol?: string;
}

/** Números exactos que declara el texto, para asserts y para la UI. */
export interface EntitySummaryMetrics {
  /** Nodos incluidos en el alcance. */
  nodes: number;
  /** Nodos incluidos + frontera conocida en el resultado. */
  availableNodes: number;
  /** Arcos dibujados: aristas paralelas agrupadas en una sola. */
  drawnEdges: number;
  /** Grupos con más de una tripleta (las super-aristas propiamente dichas). */
  superEdges: number;
  /** Aristas RDF explícitas incluidas. */
  triples: number;
  /** Nodos admitidos como paso intermedio de un camino. */
  intermediates: number;
  /** Nodos vecinos conocidos que quedaron fuera del alcance. */
  frontierNodes: number;
  /** Recursos compartidos (hubs) incluidos. */
  hubs: number;
  /** Filas del resultado que mencionan la raíz. */
  rows: number;
  omittedNodes: number;
  omittedEdges: number;
  /** Ramas con vecinos disponibles todavía sin expandir. */
  pendingBranches: number;
}

export interface EntitySummaryDocument {
  scope: SummaryScope;
  rootUri: string;
  rootLabel: string;
  /** Texto final, listo para el portapapeles. */
  text: string;
  /** Mismas líneas sin unir: cómodo para asserts puntuales. */
  lines: string[];
  metrics: EntitySummaryMetrics;
  /** `true` cuando la raíz no tiene estructura en el resultado. */
  empty: boolean;
}

const DEFAULT_MAX_LISTED_OMISSIONS = 20;

const SCOPE_LABEL: Record<SummaryScope, string> = {
  view: 'vista explorada',
  structure: 'estructura disponible',
};

/** Etiqueta en español del alcance, reutilizable por la UI. */
export function summaryScopeLabel(scope: SummaryScope): string {
  return SCOPE_LABEL[scope];
}

/** `true` si el identificador es un blank node normalizado (`_:b0`). */
export function isBlankNode(id: string): boolean {
  return id.startsWith('_:');
}

/**
 * Identificador inequívoco para una línea de tripleta: URIs entre `<>`,
 * blank nodes opacos sin envolver (sintaxis N-Triples).
 */
export function formatTerm(id: string): string {
  return isBlankNode(id) ? id : `<${id}>`;
}

/** Escape mínimo para que un literal no rompa la línea ni sus comillas. */
function escapeLiteral(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\r/g, '\\r')
    .replace(/\n/g, '\\n')
    .replace(/\t/g, '\\t');
}

/** Representación textual estable de un valor de binding. */
export function formatBindingValue(value: BindingValue): string {
  switch (value.type) {
    case 'uri':
      return `<${value.value}>`;
    case 'bnode':
      return value.value.startsWith('_:') ? value.value : `_:${value.value}`;
    case 'coordinate':
      return `"${escapeLiteral(value.raw)}"`;
    case 'date':
      return `"${escapeLiteral(value.value)}"`;
    case 'literal': {
      const base = `"${escapeLiteral(value.value)}"`;
      if (value.lang) return `${base}@${value.lang}`;
      if (value.datatype) return `${base}^^<${value.datatype}>`;
      return base;
    }
  }
}

/** Marca principal de un nodo; una sola, por prioridad. */
function nodeMark(node: SubgraphNode): string {
  if (node.isRoot) return 'raíz';
  if (node.isActive) return 'activo';
  if (node.isPinned) return 'fijado';
  switch (node.reason) {
    case 'co-row':
      return 'co-fila';
    case 'path':
      return 'intermedio';
    case 'expanded':
      return 'expandido';
    case 'context':
      return 'contexto';
    default:
      return node.reason;
  }
}

/** Detalles secundarios del nodo, siempre en el mismo orden. */
function nodeDetails(node: SubgraphNode): string[] {
  const details: string[] = [];
  if (node.node.queryVariable) details.push(`var ${node.node.queryVariable}`);
  const classes = node.node.classes ?? [];
  if (classes.length > 0) {
    details.push(`clase ${[...classes].sort().map((uri) => `<${uri}>`).join(', ')}`);
  }
  if (node.depth != null) details.push(`prof ${node.depth}`);
  details.push(`grado ${node.degree}`);
  if (node.rowCount > 0) details.push(`filas ${node.rowCount}`);
  if (node.isPinned && !node.isRoot && !node.isActive) details.push('fijado');
  if (node.isHub) details.push('recurso compartido');
  if (node.isBoundary) details.push('frontera');
  if (node.node.coordinate) details.push('con coordenada');
  const events = node.node.temporalEvents?.length ?? 0;
  if (events > 0) details.push(`eventos ${events}`);
  return details;
}

function nodeLine(node: SubgraphNode): string {
  const label = node.node.label;
  const identity = label && label !== node.uri ? `${label} — ${formatTerm(node.uri)}` : formatTerm(node.uri);
  return `- [${nodeMark(node)}] ${identity} (${nodeDetails(node).join('; ')})`;
}

function branchLine(branch: SubgraphBranch): string {
  const direction = branch.direction === 'outgoing' ? 'salida' : 'entrada';
  const marks: string[] = [];
  if (branch.fromHub) marks.push('nace en un recurso compartido');
  if (branch.reachesHub) marks.push('llega a un recurso compartido');
  const suffix = marks.length > 0 ? ` [${marks.join('; ')}]` : '';
  return (
    `- ${direction} ${formatTerm(branch.nodeUri)} <${branch.predicate}>` +
    ` · disponibles ${branch.pendingUris.length}` +
    ` · tripletas ${branch.tripleCount}${suffix}`
  );
}

/** Tripleta única con su multiplicidad de aristas en el resultado. */
interface TripleGroup {
  source: string;
  predicate: string;
  target: string;
  label: string;
  count: number;
}

function groupTriples(subgraph: EntitySubgraph): TripleGroup[] {
  const groups = new Map<string, TripleGroup>();
  for (const edge of subgraph.edges) {
    const key = `${edge.source}\u0000${edge.predicate}\u0000${edge.target}`;
    const existing = groups.get(key);
    if (existing) {
      existing.count++;
      continue;
    }
    groups.set(key, {
      source: edge.source,
      predicate: edge.predicate,
      target: edge.target,
      label: edge.predicateLabel,
      count: 1,
    });
  }
  return [...groups.values()];
}

function tripleLine(group: TripleGroup): string {
  const base = `- ${formatTerm(group.source)} <${group.predicate}> ${formatTerm(group.target)}`;
  const notes: string[] = [];
  if (group.label && group.label !== group.predicate) notes.push(group.label);
  if (group.count > 1) notes.push(`×${group.count}`);
  return notes.length > 0 ? `${base}  # ${notes.join(' · ')}` : base;
}

function superEdgeLine(superEdge: SuperEdge): string {
  const arrow = superEdge.direction === 'self-loop' ? '->(self)' : '->';
  const predicates = [...superEdge.predicates].sort().map((uri) => `<${uri}>`).join(', ');
  return (
    `- ${formatTerm(superEdge.source)} ${arrow} ${formatTerm(superEdge.target)}:` +
    ` ${superEdge.multiplicity} tripletas · ${superEdge.predicates.length} predicado(s): ${predicates}`
  );
}

function attributeLines(node: SubgraphNode): string[] {
  const entries = Object.entries(node.node.attributes ?? {}).sort(([a], [b]) =>
    a < b ? -1 : a > b ? 1 : 0,
  );
  return entries.map(([variable, value]) => `  - ${variable}: ${formatBindingValue(value)}`);
}

function listWithCap(values: readonly string[], cap: number): string[] {
  const shown = values.slice(0, cap).map((value) => `- ${formatTerm(value)}`);
  if (values.length > cap) shown.push(`- … y ${values.length - cap} más`);
  return shown;
}

function computeMetrics(subgraph: EntitySubgraph, superEdges: readonly SuperEdge[]): EntitySummaryMetrics {
  return {
    nodes: subgraph.nodes.length,
    availableNodes: subgraph.metrics.availableNodeCount,
    drawnEdges: superEdges.length,
    superEdges: superEdges.filter((superEdge) => superEdge.multiplicity > 1).length,
    triples: subgraph.edges.length,
    intermediates: subgraph.metrics.intermediateCount,
    frontierNodes: subgraph.metrics.frontierNodeCount,
    hubs: subgraph.hubs.length,
    rows: subgraph.metrics.rowCount,
    omittedNodes: subgraph.omitted.nodes.length,
    omittedEdges: subgraph.omitted.edges.length,
    pendingBranches: subgraph.branches.filter((branch) => branch.pendingUris.length > 0).length,
  };
}

function scopeLine(options: EntitySummaryOptions): string {
  const base = SCOPE_LABEL[options.scope];
  if (options.scope !== 'structure' || options.structureComplete !== false) {
    return `Alcance: ${base}`;
  }
  return `Alcance: ${base} (incompleta: se agotó el presupuesto de la copia)`;
}

function lotLines(lot: SummaryLotInfo | null | undefined): string[] {
  if (!lot) return [];
  const lines: string[] = [];
  const rows: string[] = [];
  if (lot.visibleRows != null) rows.push(`${lot.visibleRows} filas en el lote`);
  if (lot.totalRows != null) rows.push(`${lot.totalRows} filas filtradas`);
  const suffix = rows.length > 0 ? ` (${rows.join(' de ')})` : '';
  lines.push(
    lot.lotCount > 1
      ? `Lote: ${lot.currentLot} de ${lot.lotCount}${suffix}`
      : `Lote: único${suffix}`,
  );
  if (lot.truncated) {
    lines.push('Resultado: truncado por el backend (hay filas que la consulta no devolvió)');
  }
  return lines;
}

/**
 * Construye el documento de resumen de un subgrafo. `renderEntitySummaryText`
 * es el atajo cuando sólo interesa el texto.
 */
export function buildEntitySummary(
  subgraph: EntitySubgraph,
  options: EntitySummaryOptions,
): EntitySummaryDocument {
  const eol = options.eol ?? '\n';
  const cap = options.maxListedOmissions ?? DEFAULT_MAX_LISTED_OMISSIONS;
  const attributesMode = options.attributes ?? 'root';
  const superEdges = aggregateParallelEdges(subgraph.edges.map((edge) => edge.edge));
  const metrics = computeMetrics(subgraph, superEdges);
  const root = subgraph.nodes.find((node) => node.isRoot);
  const rootLabel = root?.node.label ?? subgraph.rootUri;
  const empty = subgraph.nodes.length === 0;

  const lines: string[] = [];

  // --- Encabezado ---------------------------------------------------------
  lines.push(`Entidad raíz: ${rootLabel}`);
  lines.push(`URI: ${subgraph.rootUri}`);
  lines.push(scopeLine(options));
  lines.push(
    `Origen: ${
      subgraph.sourceScope === 'full'
        ? 'resultado completo (la raíz no está en el lote visible)'
        : subgraph.sourceScope === 'visible'
          ? 'lote visible del resultado'
          : 'sin resultado para la raíz'
    }`,
  );
  lines.push(...lotLines(options.lot));
  if (!empty && subgraph.activeUri !== subgraph.rootUri) {
    const active = subgraph.nodes.find((node) => node.uri === subgraph.activeUri);
    const activeLabel = active?.node.label;
    lines.push(
      `Nodo activo: ${
        activeLabel && activeLabel !== subgraph.activeUri
          ? `${activeLabel} — ${subgraph.activeUri}`
          : subgraph.activeUri
      }`,
    );
  }

  if (empty) {
    lines.push('');
    lines.push('Sin estructura disponible para esta entidad en el resultado actual.');
    if (subgraph.warnings.length > 0) {
      lines.push('');
      lines.push('Advertencias');
      for (const warning of subgraph.warnings) lines.push(`- ${warning.message}`);
    }
    const text = lines.join(eol);
    return { scope: options.scope, rootUri: subgraph.rootUri, rootLabel, text, lines, metrics, empty };
  }

  // --- Resumen ------------------------------------------------------------
  lines.push('');
  lines.push('Resumen');
  lines.push(`- Nodos visibles: ${metrics.nodes}`);
  lines.push(`- Nodos disponibles: ${metrics.availableNodes}`);
  lines.push(`- Aristas visibles: ${metrics.drawnEdges}`);
  lines.push(`- Tripletas representadas: ${metrics.triples}`);
  lines.push(`- Nodos intermedios: ${metrics.intermediates}`);
  lines.push(`- Nodos frontera: ${metrics.frontierNodes}`);
  lines.push(`- Recursos compartidos: ${metrics.hubs}`);
  lines.push(`- Super-aristas: ${metrics.superEdges}`);
  lines.push(`- Filas que mencionan la raíz: ${metrics.rows}`);
  lines.push(`- Ramas sin expandir: ${metrics.pendingBranches}`);
  lines.push(`- Nodos omitidos por presupuesto: ${metrics.omittedNodes}`);
  lines.push(`- Relaciones omitidas por presupuesto: ${metrics.omittedEdges}`);

  // --- Nodos --------------------------------------------------------------
  lines.push('');
  lines.push(`Nodos (${metrics.nodes})`);
  for (const node of subgraph.nodes) {
    lines.push(nodeLine(node));
    if (attributesMode === 'all' || (attributesMode === 'root' && node.isRoot)) {
      lines.push(...attributeLines(node));
    }
  }
  if (attributesMode !== 'none') {
    lines.push('');
    lines.push(
      'Nota: los atributos listados bajo cada nodo provienen de variables de la ' +
        'consulta y no tienen predicado disponible en el resultado: no se cuentan ' +
        'como tripletas.',
    );
  }

  // --- Relaciones ---------------------------------------------------------
  const triples = groupTriples(subgraph);
  lines.push('');
  lines.push(
    `Relaciones (${metrics.triples} tripleta(s) en ${metrics.drawnEdges} arista(s) dibujada(s))`,
  );
  if (triples.length === 0) {
    lines.push('- (sin relaciones en este alcance)');
  } else {
    for (const group of triples) lines.push(tripleLine(group));
  }

  // --- Super-aristas ------------------------------------------------------
  const collapsed = superEdges.filter((superEdge) => superEdge.multiplicity > 1);
  if (collapsed.length > 0) {
    lines.push('');
    lines.push(`Super-aristas (${collapsed.length})`);
    for (const superEdge of collapsed) lines.push(superEdgeLine(superEdge));
  }

  // --- Ramas sin expandir -------------------------------------------------
  const pending = subgraph.branches.filter((branch) => branch.pendingUris.length > 0);
  if (pending.length > 0) {
    lines.push('');
    lines.push(`Ramas sin expandir (${pending.length})`);
    for (const branch of pending) lines.push(branchLine(branch));
  }

  // --- Recursos compartidos -----------------------------------------------
  if (subgraph.hubs.length > 0) {
    lines.push('');
    lines.push(`Recursos compartidos (${subgraph.hubs.length})`);
    for (const hub of subgraph.hubs) {
      const identity = hub.label && hub.label !== hub.uri ? `${hub.label} — ${formatTerm(hub.uri)}` : formatTerm(hub.uri);
      lines.push(
        `- ${identity} · grado ${hub.degree} · vecinos incluidos ${hub.includedNeighbours}` +
          ` · vecinos no incorporados ${hub.hiddenNeighbours}`,
      );
    }
  }

  // --- Omisiones ----------------------------------------------------------
  if (metrics.omittedNodes > 0) {
    lines.push('');
    lines.push(`Nodos omitidos por presupuesto (${metrics.omittedNodes})`);
    lines.push(...listWithCap(subgraph.omitted.nodes, cap));
  }
  if (metrics.omittedEdges > 0) {
    lines.push('');
    lines.push(
      `Relaciones omitidas por presupuesto: ${metrics.omittedEdges} ` +
        '(no se listan: sus extremos quedaron fuera del alcance)',
    );
  }

  // --- Advertencias -------------------------------------------------------
  if (subgraph.warnings.length > 0) {
    lines.push('');
    lines.push('Advertencias');
    for (const warning of subgraph.warnings) lines.push(`- ${warning.message}`);
  }

  return {
    scope: options.scope,
    rootUri: subgraph.rootUri,
    rootLabel,
    text: lines.join(eol),
    lines,
    metrics,
    empty,
  };
}

/** Atajo: sólo el texto del documento. */
export function renderEntitySummaryText(
  subgraph: EntitySubgraph,
  options: EntitySummaryOptions,
): string {
  return buildEntitySummary(subgraph, options).text;
}
