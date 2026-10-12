import type {
  BindingValue,
  DiscoveryConnections,
  QueryResult,
  QuerySummary,
  ResultBinding,
} from '@rdfgis/contracts';

/**
 * Lógica pura de las herramientas de grafo del MCP: arma las consultas SPARQL
 * y da forma a los resultados para el agente. Sin red ni Nest, para testearla
 * con fixtures.
 */

export const RDF_TYPE = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type';
const OWL_SAME_AS = 'http://www.w3.org/2002/07/owl#sameAs';
const WKT_LITERAL = 'http://www.opengis.net/ont/geosparql#wktLiteral';
/** Clases tope que los razonadores agregan a todo recurso: no aportan estructura. */
const GENERIC_CLASSES = new Set([
  'http://www.w3.org/2002/07/owl#Thing',
  'http://www.w3.org/2000/01/rdf-schema#Resource',
]);
export const BLANK_NODE = '(nodo en blanco)';

/** IRI absoluto apto para interpolar como `<...>` en SPARQL. */
export function sparqlIri(value: string): string {
  if (!/^[a-z][a-z0-9+.-]*:[^\s<>"{}|^`\\]+$/i.test(value)) {
    throw new Error(`URI inválida: ${value}`);
  }
  return `<${value}>`;
}

function langFilter(variable: string, lang: string): string {
  const safe = /^[a-z]{2,3}(-[a-z0-9]+)*$/i.test(lang) ? lang : 'en';
  return `FILTER(isLiteral(${variable}) && (LANG(${variable}) = "" || LANGMATCHES(LANG(${variable}), "${safe}")))`;
}

export interface ResourceQueries {
  head: string;
  outgoing: string;
  blankNodes: string;
  incoming: string;
}

export const RESOURCE_SECTIONS = ['head', 'outgoing', 'blankNodes', 'incoming'] as const;
/** Filas de propiedades de nodos en blanco por cada tripleta pedida. */
const BLANK_ROWS_PER_TRIPLE = 20;

/**
 * Cuatro consultas acotadas: etiqueta y tipos (aparte, para no perderlos por
 * el límite), salientes sin nodos en blanco, nodos en blanco salientes con sus
 * propiedades (un nivel, agrupados dentro de la misma consulta, porque los IDs
 * de nodos en blanco no valen entre consultas) y entrantes. Salientes y
 * entrantes limitan antes de buscar etiquetas para no recorrer hubs. La de
 * nodos en blanco va plana: con subconsulta, Blazegraph (Wikidata) la planifica
 * empezando por `?b ?bp ?bo` y no termina.
 */
export function resourceQueries(
  uri: string,
  options: { labelUri: string; lang: string; limit: number },
): ResourceQueries {
  const node = sparqlIri(uri);
  const label = sparqlIri(options.labelUri);
  const take = options.limit + 1;
  return {
    head: `SELECT ?kind ?v WHERE {
  { ${node} ${label} ?v . ${langFilter('?v', options.lang)} BIND("label" AS ?kind) }
  UNION { ${node} a ?v . BIND("type" AS ?kind) }
} LIMIT 50`,
    outgoing: `SELECT ?p ?o (SAMPLE(?l) AS ?label) WHERE {
  { SELECT ?p ?o WHERE { ${node} ?p ?o . FILTER(!isBlank(?o)) } ORDER BY ?p LIMIT ${take} }
  OPTIONAL { ?o ${label} ?l . ${langFilter('?l', options.lang)} }
} GROUP BY ?p ?o ORDER BY ?p`,
    blankNodes: `SELECT ?p ?b ?bp ?bo WHERE { ${node} ?p ?b . FILTER(isBlank(?b)) ?b ?bp ?bo . } LIMIT ${take * BLANK_ROWS_PER_TRIPLE}`,
    incoming: `SELECT ?s ?p (SAMPLE(?l) AS ?label) WHERE {
  { SELECT ?s ?p WHERE { ?s ?p ${node} } ORDER BY ?p LIMIT ${take} }
  OPTIONAL { ?s ${label} ?l . ${langFilter('?l', options.lang)} }
} GROUP BY ?s ?p ORDER BY ?p`,
  };
}

/** Valor legible de un binding: coordenadas y fechas vuelven a su literal original. */
export function bindingText(binding: BindingValue): string {
  switch (binding.type) {
    case 'coordinate':
    case 'date':
      return binding.raw;
    case 'bnode':
      return `_:${binding.value.replace(/^_:/, '')}`;
    case 'literal':
      return binding.lang ? `${binding.value}@${binding.lang}` : binding.value;
    default:
      return binding.value;
  }
}

export interface ValueOut {
  value: string;
  label?: string;
  datatype?: string;
}

function valueOut(binding: BindingValue, label?: BindingValue): ValueOut {
  const out: ValueOut = { value: binding.type === 'bnode' ? BLANK_NODE : bindingText(binding) };
  if (label && label.type === 'literal') out.label = label.value;
  if (binding.type === 'literal' && binding.datatype) out.datatype = binding.datatype;
  if (binding.type === 'coordinate') out.datatype = WKT_LITERAL;
  return out;
}

export interface ResourceDescription {
  uri: string;
  label?: string;
  types: string[];
  outgoing: Array<
    { predicate: string } & ValueOut & { properties?: Array<{ predicate: string } & ValueOut> }
  >;
  incoming: Array<{ predicate: string; subject: string; label?: string }>;
  outgoingTruncated: boolean;
  incomingTruncated: boolean;
  failed: string[];
}

export function shapeResource(
  uri: string,
  options: { labelUri: string; limit: number },
  results: Partial<Record<(typeof RESOURCE_SECTIONS)[number], QueryResult>>,
): ResourceDescription {
  const failed = RESOURCE_SECTIONS.filter((k) => !results[k]);
  const outgoing: ResourceDescription['outgoing'] = [];
  for (const row of results.outgoing?.bindings ?? []) {
    if (!row.p || !row.o) continue;
    // owl:sameAs reflexivo: lo agrega el razonador y no dice nada.
    if (row.p.value === OWL_SAME_AS && row.o.value === uri) continue;
    outgoing.push({ predicate: row.p.value as string, ...valueOut(row.o, row.label) });
  }
  const blanks = new Map<string, ResourceDescription['outgoing'][number]>();
  for (const row of results.blankNodes?.bindings ?? []) {
    if (!row.p || !row.b || !row.bp || !row.bo) continue;
    const key = `${String(row.p.value)} ${String(row.b.value)}`;
    let entry = blanks.get(key);
    if (!entry) {
      entry = { predicate: row.p.value as string, value: BLANK_NODE, properties: [] };
      blanks.set(key, entry);
    }
    if (row.bp.value === OWL_SAME_AS && row.bo.type === 'bnode') continue;
    entry.properties!.push({ predicate: row.bp.value as string, ...valueOut(row.bo) });
  }
  const incoming = (results.incoming?.bindings ?? [])
    .filter((row) => row.s && row.p && !(row.p.value === OWL_SAME_AS && row.s.value === uri))
    .map((row) => ({
      predicate: row.p.value as string,
      subject: row.s.type === 'bnode' ? BLANK_NODE : bindingText(row.s),
      ...(row.label?.type === 'literal' ? { label: row.label.value } : {}),
    }));
  const head = (kind: string) =>
    (results.head?.bindings ?? []).filter((row) => row.kind?.value === kind && row.v).map((row) => row.v);
  const types = results.head
    ? head('type').map((v) => bindingText(v))
    : outgoing.filter((t) => t.predicate === RDF_TYPE).map((t) => t.value);
  const label = results.head
    ? head('label').map((v) => v.value as string)[0]
    : outgoing.find((t) => t.predicate === options.labelUri)?.value;
  const blankRows = results.blankNodes?.bindings.length ?? 0;
  const all = [...outgoing, ...blanks.values()];
  return {
    uri,
    ...(label ? { label } : {}),
    types,
    outgoing: all.slice(0, options.limit),
    incoming: incoming.slice(0, options.limit),
    outgoingTruncated: all.length > options.limit || blankRows >= (options.limit + 1) * BLANK_ROWS_PER_TRIPLE,
    incomingTruncated: incoming.length > options.limit,
    failed,
  };
}

export function overviewQueries(limit: number): { classes: string; properties: string } {
  return {
    classes: `SELECT ?class (COUNT(?s) AS ?instances) WHERE { ?s a ?class } GROUP BY ?class ORDER BY DESC(?instances) LIMIT ${limit}`,
    properties: `SELECT ?property (COUNT(*) AS ?triples) WHERE { ?s ?property ?o } GROUP BY ?property ORDER BY DESC(?triples) LIMIT ${limit}`,
  };
}

/** Tipos observados por variable (`uri`, `literal`, `coordinate`, `date`, `bnode`), unidos con `|`. */
export function variableTypes(result: Pick<QueryResult, 'variables' | 'bindings'>): Record<string, string> {
  const seen = new Map<string, Set<string>>(result.variables.map((v) => [v, new Set<string>()]));
  for (const row of result.bindings) {
    for (const [variable, binding] of Object.entries(row)) {
      if (!seen.has(variable)) seen.set(variable, new Set());
      seen.get(variable)!.add(binding.type);
    }
  }
  return Object.fromEntries(
    [...seen].map(([variable, types]) => [
      variable,
      types.size ? [...types].sort().join('|') : 'sin valores',
    ]),
  );
}

/**
 * Saca de una vista de conexiones los duplicados por clases tope inferidas
 * (owl:Thing) cuando la misma propiedad ya tiene una clase específica, y
 * nombra los ejemplos que son nodos en blanco (llegan sin valor).
 */
export function compactConnections(result: DiscoveryConnections): DiscoveryConnections {
  const specific = new Set(
    result.connections
      .filter((c) => c.targetClass && !GENERIC_CLASSES.has(c.targetClass))
      .map((c) => `${c.direction} ${c.predicate}`),
  );
  return {
    ...result,
    connections: result.connections
      .filter(
        (c) =>
          !(
            c.targetClass &&
            GENERIC_CLASSES.has(c.targetClass) &&
            specific.has(`${c.direction} ${c.predicate}`)
          ),
      )
      .map((c) => ({
        ...c,
        examples: c.examples.map((e) => (e.kind === 'bnode' ? { ...e, value: BLANK_NODE } : e)),
      })),
  };
}

export interface DashboardPreview {
  rows: { retrieved: number; total: number | null; distinct: number; truncatedByBackend: boolean };
  durationMs: number;
  variables: Record<string, string>;
  map: { variables: string[]; entitiesWithCoordinate: number };
  timeline: { variables: string[]; entitiesWithDate: number; from?: string; to?: string };
  graph: { nodes: number; edges: number };
  warnings: string[];
}

function rowKey(row: ResultBinding): string {
  return JSON.stringify(
    Object.entries(row)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => [k, bindingText(v)]),
  );
}

/**
 * Qué va a mostrar cada vista del tablero GIS con esta consulta, con
 * advertencias accionables. `summary` llega solo cuando el backend truncó (el
 * total y el rango temporal salen del resultado completo).
 */
export function previewDashboard(
  result: QueryResult,
  options: { hasLimit: boolean; summary?: QuerySummary | null },
): DashboardPreview {
  const types = variableTypes(result);
  const withType = (type: string) =>
    Object.entries(types)
      .filter(([, t]) => t.split('|').includes(type))
      .map(([v]) => v);
  const coordinateVars = withType('coordinate');
  const dateVars = withType('date');
  const unparsedWkt = result.variables.filter((v) =>
    result.bindings.some(
      (row) => row[v]?.type === 'literal' && (row[v] as { datatype?: string }).datatype === WKT_LITERAL,
    ),
  );

  const dates = result.bindings.flatMap((row) =>
    dateVars
      .map((v) => row[v])
      .filter((b): b is Extract<BindingValue, { type: 'date' }> => b?.type === 'date'),
  );
  const local = dates.map((d) => d.value).sort();
  const summaryRange = options.summary?.temporal.filter((t) => t.min || t.max) ?? [];
  const from = summaryRange.length
    ? (summaryRange
        .map((t) => t.min)
        .filter(Boolean)
        .sort()[0] ?? undefined)
    : local[0];
  const to = summaryRange.length
    ? (summaryRange
        .map((t) => t.max)
        .filter(Boolean)
        .sort()
        .at(-1) ?? undefined)
    : local.at(-1);

  const truncated = result.meta.truncated;
  const total = truncated ? (options.summary?.totalRows ?? null) : result.bindings.length;
  const distinct = new Set(result.bindings.map(rowKey)).size;
  const entitiesWithCoordinate = result.nodes.filter((n) => n.coordinate).length;
  const entitiesWithDate = result.nodes.filter((n) => n.temporalEvents?.length).length;

  const warnings: string[] = [];
  if (!result.bindings.length) warnings.push('La consulta no devuelve filas: el tablero quedaría vacío.');
  if (!coordinateVars.length) {
    warnings.push(
      unparsedWkt.length
        ? `Hay WKT en ${unparsedWkt.map((v) => `?${v}`).join(', ')} pero no se pudo leer como POINT: el mapa solo dibuja puntos.`
        : 'Ninguna variable trae geometría WKT (POINT): el mapa quedaría vacío.',
    );
  } else if (unparsedWkt.length) {
    warnings.push(
      `Algunas geometrías de ${unparsedWkt.map((v) => `?${v}`).join(', ')} no son POINT válidos y no se dibujan.`,
    );
  }
  if (!dateVars.length)
    warnings.push('Ninguna variable trae fechas (xsd:date/xsd:dateTime): la línea de tiempo quedaría vacía.');
  if (result.bindings.length && !result.edges.length) {
    warnings.push(
      'El grafo no tiene aristas: proyectá también las entidades intermedias que conectan los recursos.',
    );
  }
  if (distinct < result.bindings.length) {
    warnings.push(
      `${result.bindings.length - distinct} de ${result.bindings.length} filas recuperadas están repetidas: usá SELECT DISTINCT o revisá las uniones (owl:sameAs o tipos inferidos suelen multiplicar filas).`,
    );
  }
  if (truncated) {
    warnings.push(
      `El backend devuelve ${result.bindings.length}${total !== null ? ` de ${total}` : ''} filas: la interfaz pagina en lotes sobre lo recuperado. Si querés ver todo, filtrá la consulta.`,
    );
  }
  if (options.hasLimit) warnings.push('La consulta tiene LIMIT: el tablero mostrará solo esa muestra.');

  return {
    rows: { retrieved: result.bindings.length, total, distinct, truncatedByBackend: truncated },
    durationMs: result.meta.durationMs,
    variables: types,
    map: { variables: coordinateVars, entitiesWithCoordinate },
    timeline: { variables: dateVars, entitiesWithDate, ...(from ? { from } : {}), ...(to ? { to } : {}) },
    graph: { nodes: result.nodes.length, edges: result.edges.length },
    warnings,
  };
}
