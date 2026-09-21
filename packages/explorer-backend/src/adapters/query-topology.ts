/**
 * Extrae la topología declarada por una consulta SPARQL para poder construir el grafo
 * de resultados con las relaciones REALES en lugar de inventarlas.
 *
 * Contexto: `GenericSparqlAdapter.buildGraph()` armaba una estrella colgando todas las
 * URIs de cada fila de la primera variable URI del SELECT, y etiquetaba las aristas con
 * el nombre de la variable. Eso producía aristas que no existen en el grafo (p. ej.
 * `real_estate --[agente]--> agent_X`, cuando el triple real es
 * `listing foaf:maker agent_X`) y aplanaba las jerarquías: `?barrio rec:locatedIn
 * ?distrito` terminaba dibujado como `real_estate --[distrito]--> distrito`.
 *
 * Este módulo no sabe nada del dominio: lee patrones `?sujeto predicado ?objeto` de
 * cualquier ontología. El mismo código sirve para el grafo inmobiliario del OVS y para
 * Wikidata.
 */
import { Parser, Generator } from 'sparqljs';

/** Relación entre dos variables declarada por la consulta. */
export interface TopologyLink {
  /** Nombre de la variable sujeto (sin `?`). */
  subject: string;
  /** Nombre de la variable objeto (sin `?`). */
  object: string;
  /**
   * Predicado constante: IRI, o expresión de property path (`a/b`, `^a`).
   * Ausente cuando el predicado de la consulta es una variable.
   */
  predicate?: string;
  /** Versión abreviada del predicado para mostrar en la vista. */
  predicateLabel?: string;
  /**
   * Nombre de la variable predicado, cuando la consulta usa `?s ?p ?o`. En ese caso el
   * predicado real se resuelve por fila desde los bindings.
   */
  predicateVar?: string;
}

export interface QueryTopology {
  /** Relaciones variable→variable declaradas en la consulta. */
  links: TopologyLink[];
  /** Variables proyectadas en el SELECT; `null` si es `SELECT *`. */
  projected: string[] | null;
  /**
   * Variables que participan de alguna relación pero no están proyectadas: los nodos
   * intermedios (bnodes de dirección, features, geometrías) que hay que pedirle al
   * endpoint para poder dibujarlos.
   */
  intermediates: string[];
  /**
   * Clases RDF afirmadas por la consulta (patrones `?x a <ClaseURI>` con objeto
   * constante): variable → URIs de clase, deduplicadas y en orden de aparición.
   * `?x a ?tipoVariable` NO es una afirmación: sigue siendo un link normal.
   */
  classAssertions: ReadonlyMap<string, readonly string[]>;
  /**
   * Consulta reescrita agregando los intermedios al SELECT. Ausente cuando no hace
   * falta o cuando reescribir no es seguro (ver `canProjectIntermediates`).
   */
  rewritten?: string;
}

const EMPTY: QueryTopology = {
  links: [],
  projected: null,
  intermediates: [],
  classAssertions: new Map(),
};

function localName(iri: string): string {
  const cut = Math.max(iri.lastIndexOf('#'), iri.lastIndexOf('/'));
  return cut >= 0 && cut < iri.length - 1 ? iri.slice(cut + 1) : iri;
}

type Term = { termType?: string; value?: string };
type PathNode = { type: 'path'; pathType: string; items: unknown[] };

function isVariable(t: unknown): t is Term & { value: string } {
  return (t as Term)?.termType === 'Variable';
}

function isNamedNode(t: unknown): t is Term & { value: string } {
  return (t as Term)?.termType === 'NamedNode';
}

function isPath(t: unknown): t is PathNode {
  return (
    (t as PathNode)?.type === 'path' && Array.isArray((t as PathNode).items)
  );
}

/** Serializa un predicado (IRI o property path) usando IRIs completas. */
function predicateToString(p: unknown): string | null {
  if (isNamedNode(p)) return p.value;
  if (isPath(p)) {
    const parts = p.items.map((i) => predicateToString(i));
    if (parts.some((x) => x === null)) return null;
    // '^' es prefijo unario; el resto son infijos ('/', '|', '*', '+', '?').
    if (p.pathType === '^' && parts.length === 1) return `^${parts[0]}`;
    return parts.join(p.pathType);
  }
  return null;
}

/** Igual que la anterior pero con nombres locales, para mostrar en la vista. */
function predicateToLabel(p: unknown): string | null {
  if (isNamedNode(p)) return localName(p.value);
  if (isPath(p)) {
    const parts = p.items.map((i) => predicateToLabel(i));
    if (parts.some((x) => x === null)) return null;
    if (p.pathType === '^' && parts.length === 1) return `^${parts[0]}`;
    return parts.join(p.pathType);
  }
  return null;
}

const RDF_TYPE_IRI = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type';

/**
 * Detecta un path que es sólo un inverso (`^p`). Ese caso se normaliza dando vuelta
 * sujeto y objeto, porque `?a ^p ?b` es exactamente `?b p ?a`. Las consultas de los
 * analistas del OVS usan mucho `^sioc:about`.
 */
function asPureInverse(p: unknown): unknown {
  if (isPath(p) && p.pathType === '^' && p.items.length === 1)
    return p.items[0];
  return null;
}

interface RawTriple {
  subject: unknown;
  predicate: unknown;
  object: unknown;
}

/** Recorre el WHERE juntando todos los patrones de triples, incluidos los anidados. */
function collectTriples(
  patterns: unknown[] | undefined,
  out: RawTriple[] = [],
): RawTriple[] {
  for (const p of patterns ?? []) {
    const pattern = p as {
      type?: string;
      triples?: RawTriple[];
      patterns?: unknown[];
      where?: unknown[];
    };
    if (pattern.type === 'bgp' && Array.isArray(pattern.triples)) {
      out.push(...pattern.triples);
    }
    if (Array.isArray(pattern.patterns)) collectTriples(pattern.patterns, out);
    // Subconsultas: sus patrones también describen relaciones. Si una variable no queda
    // visible afuera, simplemente no vendrá en los bindings y se ignora al construir.
    if (Array.isArray(pattern.where)) collectTriples(pattern.where, out);
  }
  return out;
}

/**
 * Reescribir el SELECT sólo es seguro si agregar columnas no cambia el resultado.
 * Con DISTINCT/REDUCED cambiaría la cantidad de filas, y con GROUP BY o agregados
 * sería inválido.
 */
function canProjectIntermediates(ast: {
  queryType?: string;
  distinct?: boolean;
  reduced?: boolean;
  group?: unknown;
  variables?: unknown[];
}): boolean {
  if (ast.queryType !== 'SELECT') return false;
  if (ast.distinct || ast.reduced) return false;
  if (ast.group) return false;
  if (!Array.isArray(ast.variables)) return false;
  // Wildcard: ya proyecta todo. Cualquier variable con `expression` es un agregado o un
  // alias calculado, y en ese caso agregar columnas crudas puede ser inválido.
  return ast.variables.every((v) => isVariable(v));
}

export function extractQueryTopology(sparql: string): QueryTopology {
  let ast: Record<string, unknown>;
  try {
    ast = new Parser().parse(sparql) as unknown as Record<string, unknown>;
  } catch {
    return EMPTY;
  }

  if (ast['queryType'] !== 'SELECT') return EMPTY;

  const variables = ast['variables'] as unknown[] | undefined;
  const isWildcard =
    !Array.isArray(variables) ||
    variables.some((v) => (v as Term)?.termType === 'Wildcard');

  const projected = isWildcard
    ? null
    : variables.filter(isVariable).map((v) => v.value);

  const triples = collectTriples(ast['where'] as unknown[] | undefined);

  const links: TopologyLink[] = [];
  const seen = new Set<string>();
  const classAssertions = new Map<string, string[]>();

  for (const t of triples) {
    // Afirmaciones de clase: `?x a <ClaseURI>` (sparqljs parsea `a` como el NamedNode
    // rdf:type). El objeto debe ser una IRI constante; `?x a ?tipoVariable` es un
    // triple real del grafo y sigue siendo un link, no una afirmación.
    if (
      isVariable(t.subject) &&
      isNamedNode(t.predicate) &&
      t.predicate.value === RDF_TYPE_IRI &&
      isNamedNode(t.object)
    ) {
      const list = classAssertions.get(t.subject.value) ?? [];
      if (!list.includes(t.object.value)) list.push(t.object.value);
      classAssertions.set(t.subject.value, list);
    }

    // Sólo las relaciones entre dos variables llegan al grafo. Eso descarta solo
    // los patrones tipo `?x a <Clase>` o `?x rdfs:label "..."`, donde el objeto es
    // una constante y por lo tanto no es un nodo del resultado. En cambio
    // `?x a ?clase` sí produce arista: es un triple real del grafo.
    if (!isVariable(t.subject) || !isVariable(t.object)) continue;

    let subject = t.subject.value;
    let object = t.object.value;
    let predicateTerm: unknown = t.predicate;

    const inverse = asPureInverse(predicateTerm);
    if (inverse) {
      predicateTerm = inverse;
      [subject, object] = [object, subject];
    }

    const link: TopologyLink = { subject, object };

    if (isVariable(predicateTerm)) {
      link.predicateVar = predicateTerm.value;
    } else {
      const predicate = predicateToString(predicateTerm);
      if (!predicate) continue;
      link.predicate = predicate;
      link.predicateLabel = predicateToLabel(predicateTerm) ?? predicate;
    }

    const key = `${subject}|${link.predicate ?? `?${link.predicateVar}`}|${object}`;
    if (seen.has(key)) continue;
    seen.add(key);
    links.push(link);
  }

  // Variables que participan de una relación pero no se proyectan: los intermedios.
  const intermediates: string[] = [];
  if (projected) {
    const projectedSet = new Set(projected);
    for (const link of links) {
      for (const v of [link.subject, link.object, link.predicateVar]) {
        if (v && !projectedSet.has(v) && !intermediates.includes(v)) {
          intermediates.push(v);
        }
      }
    }
  }

  const topology: QueryTopology = {
    links,
    projected,
    intermediates,
    classAssertions,
  };

  if (intermediates.length > 0 && canProjectIntermediates(ast)) {
    try {
      const extended = {
        ...ast,
        variables: [
          ...(variables as unknown[]),
          ...intermediates.map((v) => ({ termType: 'Variable', value: v })),
        ],
      };
      topology.rewritten = new Generator().stringify(extended as never);
    } catch {
      // Si no se puede regenerar, se ejecuta la consulta original y los intermedios
      // simplemente no aparecen como nodos.
    }
  }

  return topology;
}
