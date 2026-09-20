import type { NormalizedEdge, NormalizedNode, QueryResult, ResultBinding } from '@shared/models';

/**
 * Fixtures deterministas para el modelo puro de subgrafo de entidad (etapas 3
 * y 4 del plan de mejoras del graph-view). Autocontenidos a propósito: no
 * dependen de `graph-fixtures.ts` para que los specs de estas etapas no se
 * rompan si la línea base de la etapa 0 cambia sus builders.
 *
 * Nada de `Math.random` ni de `Date.now`: dos corridas producen exactamente el
 * mismo grafo, y cada builder devuelve objetos frescos.
 */

export const EX = 'http://example.org/';
export const P = {
  about: `${EX}p/about`,
  address: `${EX}p/address`,
  locality: `${EX}p/locality`,
  geometry: `${EX}p/geometry`,
  commercialFunction: `${EX}p/commercialFunction`,
  knows: `${EX}p/knows`,
  worksWith: `${EX}p/worksWith`,
  next: `${EX}p/next`,
  statement: `${EX}p/statement`,
  value: `${EX}p/value`,
  tag: `${EX}p/tag`,
} as const;

export function node(uri: string, overrides: Partial<NormalizedNode> = {}): NormalizedNode {
  return { uri, label: overrides.label ?? uri, attributes: {}, ...overrides };
}

export function edge(
  source: string,
  target: string,
  predicate: string,
  predicateLabel?: string,
): NormalizedEdge {
  return { id: `${source}|${predicate}|${target}`, source, target, predicate, predicateLabel };
}

export function result(
  nodes: NormalizedNode[],
  edges: NormalizedEdge[] = [],
  bindings: ResultBinding[] = [],
  variables: string[] = [],
): QueryResult {
  return {
    variables,
    bindings,
    nodes,
    edges,
    meta: { durationMs: 0, truncated: false, limitApplied: 500, backend: 'graphdb' },
  };
}

export const uri = (value: string) => ({ type: 'uri' as const, value });
export const literal = (value: string) => ({ type: 'literal' as const, value });

export interface RealEstateFixture {
  result: QueryResult;
  /** Aviso raíz de las pruebas (`listing0`). */
  root: string;
  estate: string;
  address: string;
  geometry: string;
  /** Recurso compartido por todos los avisos: partido (hub por grado). */
  partido: string;
  /** Segundo recurso compartido: función comercial. */
  commercialFunction: string;
  /** Aviso ajeno, que NO debe entrar al subgrafo de la raíz. */
  otherListing: string;
  otherEstate: string;
}

/**
 * Forma de C1 (avisos inmobiliarios), reducida pero estructuralmente fiel:
 *
 * ```text
 * listingN ──about──▶ estateN ──address──▶ addressN ──locality──▶ partido
 *                        │                                          ▲
 *                        ├──geometry──▶ geomN                       │ (todos)
 *                        └──commercialFunction──▶ funcion  (todos)  │
 * ```
 *
 * Con `listings = 10`, `partido` y `funcion` superan el umbral de hub por
 * defecto (8 vecinos distintos): son la prueba de que un recurso compartido
 * no debe servir de atajo entre inmuebles.
 *
 * Cada aviso aporta **una fila** con todas sus variables, más precio y fecha
 * como atributos del aviso (no como nodos), igual que el resultado real.
 */
export function realEstateFixture(listings = 10): RealEstateFixture {
  const partido = `${EX}partido/Berisso`;
  const commercialFunction = `${EX}function/Venta`;
  const nodes: NormalizedNode[] = [
    node(partido, { label: 'Berisso', classes: [`${EX}class/Partido`], queryVariable: 'partido' }),
    node(commercialFunction, { label: 'Venta', queryVariable: 'funcion' }),
  ];
  const edges: NormalizedEdge[] = [];
  const bindings: ResultBinding[] = [];

  for (let i = 0; i < listings; i++) {
    const listing = `${EX}listing/${i}`;
    const estate = `${EX}estate/${i}`;
    const address = `${EX}address/${i}`;
    const geometry = `${EX}geometry/${i}`;
    nodes.push(
      node(listing, {
        label: `Aviso ${i}`,
        queryVariable: 'listing',
        classes: [`${EX}class/Listing`],
        attributes: { precio: literal(`${100000 + i}`), fecha: literal(`2024-0${(i % 9) + 1}-01`) },
        temporalEvents: [{ field: 'fecha', isoDate: `2024-0${(i % 9) + 1}-01T00:00:00Z` }],
      }),
      node(estate, { label: `Inmueble ${i}`, queryVariable: 'estate' }),
      node(address, { label: `Dirección ${i}`, queryVariable: 'address' }),
      node(geometry, {
        label: `Geometría ${i}`,
        queryVariable: 'geom',
        coordinate: { lat: -34.87 - i / 1000, lng: -57.89 + i / 1000 },
      }),
    );
    edges.push(
      edge(listing, estate, P.about, 'sobre'),
      edge(estate, address, P.address, 'dirección'),
      edge(address, partido, P.locality, 'partido'),
      edge(estate, geometry, P.geometry, 'geometría'),
      edge(estate, commercialFunction, P.commercialFunction, 'función'),
    );
    bindings.push({
      listing: uri(listing),
      estate: uri(estate),
      address: uri(address),
      geom: uri(geometry),
      partido: uri(partido),
      funcion: uri(commercialFunction),
      precio: literal(`${100000 + i}`),
    });
  }

  return {
    result: result(nodes, edges, bindings, [
      'listing',
      'estate',
      'address',
      'geom',
      'partido',
      'funcion',
      'precio',
    ]),
    root: `${EX}listing/0`,
    estate: `${EX}estate/0`,
    address: `${EX}address/0`,
    geometry: `${EX}geometry/0`,
    partido,
    commercialFunction,
    otherListing: `${EX}listing/1`,
    otherEstate: `${EX}estate/1`,
  };
}

/**
 * Raíz presente en varias filas, con entidades de co-fila de distinta
 * multiplicidad: `a` comparte 2 filas, `b` y `c` una cada una. Sirve para fijar
 * el orden (multiplicidad desc → primera fila asc → URI asc).
 */
export function multiRowFixture(): QueryResult {
  const root = `${EX}root`;
  const a = `${EX}a`;
  const b = `${EX}b`;
  const c = `${EX}c`;
  const nodes = [root, a, b, c].map((n) => node(n));
  const edges = [
    edge(root, a, P.knows),
    edge(root, b, P.knows),
    edge(root, c, P.knows),
  ];
  const bindings: ResultBinding[] = [
    { s: uri(root), o: uri(a) },
    { s: uri(root), o: uri(b), extra: uri(a) },
    { s: uri(root), o: uri(c) },
  ];
  return result(nodes, edges, bindings, ['s', 'o', 'extra']);
}

/**
 * Empate total: tres candidatos de co-fila con la misma multiplicidad, la
 * misma fila de aparición y el mismo grado. Sólo el orden por URI los
 * desempata, y debe ser siempre el mismo.
 */
export function tieBreakFixture(): QueryResult {
  const root = `${EX}root`;
  const ties = [`${EX}tie/c`, `${EX}tie/a`, `${EX}tie/b`];
  const nodes = [node(root), ...ties.map((t) => node(t))];
  const edges = ties.map((t) => edge(root, t, P.tag));
  const bindings: ResultBinding[] = [
    { s: uri(root), t1: uri(ties[0]), t2: uri(ties[1]), t3: uri(ties[2]) },
  ];
  return result(nodes, edges, bindings, ['s', 't1', 't2', 't3']);
}

/**
 * Entidad de co-fila sin ningún camino de aristas hasta la raíz (la query las
 * proyecta juntas pero el resultado no trae la relación).
 */
export function disconnectedCoRowFixture(): QueryResult {
  const root = `${EX}root`;
  const near = `${EX}near`;
  const orphan = `${EX}orphan`;
  const nodes = [node(root), node(near), node(orphan)];
  const edges = [edge(root, near, P.knows)];
  const bindings: ResultBinding[] = [{ s: uri(root), o: uri(near), x: uri(orphan) }];
  return result(nodes, edges, bindings, ['s', 'o', 'x']);
}

/** Ciclo dirigido de `size` nodos: la raíz es `cycle/0`. */
export function cycleFixture(size = 4): QueryResult {
  const nodes: NormalizedNode[] = [];
  const edges: NormalizedEdge[] = [];
  const bindings: ResultBinding[] = [];
  for (let i = 0; i < size; i++) {
    nodes.push(node(`${EX}cycle/${i}`));
    edges.push(edge(`${EX}cycle/${i}`, `${EX}cycle/${(i + 1) % size}`, P.next));
  }
  bindings.push({ s: uri(`${EX}cycle/0`), o: uri(`${EX}cycle/1`) });
  return result(nodes, edges, bindings, ['s', 'o']);
}

/**
 * Blank nodes normalizados: los nodos y aristas usan el id de grafo (`_:b0`)
 * y las filas traen el valor crudo (`b0`), tal como los emite el backend.
 */
export function bnodeFixture(): QueryResult {
  const root = `${EX}entity`;
  const bnode = '_:b0';
  const value = `${EX}value`;
  const nodes = [node(root), node(bnode, { label: bnode }), node(value)];
  const edges = [edge(root, bnode, P.statement), edge(bnode, value, P.value)];
  const bindings: ResultBinding[] = [
    { s: uri(root), stmt: { type: 'bnode', value: 'b0' }, v: uri(value) },
  ];
  return result(nodes, edges, bindings, ['s', 'stmt', 'v']);
}

/**
 * Relaciones paralelas y self-loop. `P.tag` comparte la etiqueta `conoce` con
 * `P.knows` a propósito: agrupar por etiqueta fusionaría dos predicados RDF
 * distintos, así que las ramas deben agruparse por URI completa.
 */
export function parallelRelationsFixture(): QueryResult {
  const a = `${EX}a`;
  const b = `${EX}b`;
  const nodes = [node(a), node(b)];
  const edges = [
    edge(a, b, P.knows, 'conoce'),
    edge(a, b, P.worksWith, 'trabaja con'),
    edge(a, b, P.tag, 'conoce'),
    edge(a, a, P.knows, 'conoce'),
  ];
  const bindings: ResultBinding[] = [{ s: uri(a), o: uri(b) }];
  return result(nodes, edges, bindings, ['s', 'o']);
}

/**
 * Estrella grande: una raíz con `leaves` vecinos directos por el mismo
 * predicado. Con `leaves` alto la rama no entra en un presupuesto chico y
 * sirve para probar el rechazo atómico de la expansión.
 */
export function wideStarFixture(leaves = 12): QueryResult {
  const root = `${EX}star/root`;
  const hub = `${EX}star/hub`;
  const nodes = [node(root), node(hub)];
  const edges = [edge(root, hub, P.knows)];
  for (let i = 0; i < leaves; i++) {
    const leaf = `${EX}star/leaf${String(i).padStart(2, '0')}`;
    nodes.push(node(leaf));
    edges.push(edge(hub, leaf, P.tag));
  }
  const bindings: ResultBinding[] = [{ s: uri(root), o: uri(hub) }];
  return result(nodes, edges, bindings, ['s', 'o']);
}

/**
 * Camino con nodos intermedios que la query **no** proyecta: la fila sólo trae
 * `s` (raíz) y `o` (destino), y los dos nodos del medio existen únicamente en
 * `nodes`/`edges` (así los emite el backend tras `pickVariables`).
 *
 * `root ──knows──▶ mid1 ──knows──▶ mid2 ──knows──▶ far`
 */
export function trimmedPathFixture(): QueryResult {
  const root = `${EX}trim/root`;
  const mid1 = `${EX}trim/mid1`;
  const mid2 = `${EX}trim/mid2`;
  const far = `${EX}trim/far`;
  const nodes = [root, mid1, mid2, far].map((n) => node(n));
  const edges = [
    edge(root, mid1, P.knows),
    edge(mid1, mid2, P.knows),
    edge(mid2, far, P.knows),
  ];
  const bindings: ResultBinding[] = [{ s: uri(root), o: uri(far) }];
  return result(nodes, edges, bindings, ['s', 'o']);
}

/**
 * Dos ramas distintas que llegan al mismo nodo:
 *
 * ```text
 * root ──knows──▶ x ──tag──▶ shared ◀──tag── y ◀──knows── root
 * ```
 *
 * La fila sólo proyecta la raíz, así que `x` e `y` entran como contexto a un
 * salto y `shared` requiere expansión explícita. Sirve para probar que
 * contraer una rama no borra un nodo que otra rama visible necesita.
 */
export function sharedTargetFixture(): QueryResult {
  const root = `${EX}shared/root`;
  const x = `${EX}shared/x`;
  const y = `${EX}shared/y`;
  const target = `${EX}shared/target`;
  const nodes = [root, x, y, target].map((n) => node(n));
  const edges = [
    edge(root, x, P.knows),
    edge(root, y, P.knows),
    edge(x, target, P.tag),
    edge(y, target, P.tag),
  ];
  const bindings: ResultBinding[] = [{ s: uri(root) }];
  return result(nodes, edges, bindings, ['s']);
}
