import type { NormalizedEdge, NormalizedNode, QueryResult, ResultBinding } from '@shared/models';

/**
 * Fixtures deterministas para specs y benchmarks del graph-view. Nada de
 * Math.random: dos corridas generan exactamente el mismo grafo. Los builders
 * devuelven objetos frescos en cada llamada para que un test no le mute el
 * fixture al siguiente.
 */

const EX = 'http://example.org/';
export const CLASS_PERSON = `${EX}class/Person`;
export const CLASS_CITY = `${EX}class/City`;
export const CLASS_BATTLE = `${EX}class/Battle`;

export function makeNode(uri: string, overrides: Partial<NormalizedNode> = {}): NormalizedNode {
  return { uri, label: overrides.label ?? uri, attributes: {}, ...overrides };
}

export function makeEdge(source: string, target: string, predicate?: string): NormalizedEdge {
  const pred = predicate ?? `${EX}p/relatedTo`;
  return { id: `${source}->${target}#${pred}`, source, target, predicate: pred };
}

export function makeQueryResult(
  nodes: NormalizedNode[],
  edges: NormalizedEdge[] = [],
  bindings: ResultBinding[] = [],
): QueryResult {
  return {
    variables: ['s'],
    bindings,
    nodes,
    edges,
    meta: { durationMs: 0, truncated: false, limitApplied: 500, backend: 'wikidata' },
  };
}

/** Árbol dirigido: raíz `t0`, cada nivel con `branching` hijos por nodo. */
export function makeDirectedTree(depth = 4, branching = 3): QueryResult {
  const nodes: NormalizedNode[] = [];
  const edges: NormalizedEdge[] = [];
  let next = 0;
  let frontier = [`${EX}t${next}`];
  nodes.push(makeNode(`${EX}t${next++}`));
  for (let d = 1; d < depth; d++) {
    const level: string[] = [];
    for (const parent of frontier) {
      for (let b = 0; b < branching; b++) {
        const child = `${EX}t${next++}`;
        nodes.push(makeNode(child));
        edges.push(makeEdge(parent, child, `${EX}p/childOf`));
        level.push(child);
      }
    }
    frontier = level;
  }
  return makeQueryResult(nodes, edges);
}

/** Anillos cerrados: `rings` ciclos de `size` nodos, disjuntos entre sí. */
export function makeCycles(rings = 3, size = 5): QueryResult {
  const nodes: NormalizedNode[] = [];
  const edges: NormalizedEdge[] = [];
  for (let r = 0; r < rings; r++) {
    for (let i = 0; i < size; i++) {
      const uri = `${EX}c${r}_${i}`;
      nodes.push(makeNode(uri));
      edges.push(makeEdge(uri, `${EX}c${r}_${(i + 1) % size}`, `${EX}p/next`));
    }
  }
  return makeQueryResult(nodes, edges);
}

/** Un hub con muchas hojas de grado 1. */
export function makeHubWithLeaves(leaves = 40): QueryResult {
  const hub = makeNode(`${EX}hub`, { classes: [CLASS_BATTLE] });
  const nodes: NormalizedNode[] = [hub];
  const edges: NormalizedEdge[] = [];
  for (let i = 0; i < leaves; i++) {
    const leaf = `${EX}leaf${i}`;
    nodes.push(makeNode(leaf));
    edges.push(makeEdge(hub.uri, leaf, `${EX}p/participant`));
  }
  return makeQueryResult(nodes, edges);
}

/**
 * Relaciones paralelas y self-loops: mismo par source/target con predicados
 * distintos (el backend emite una arista por predicado) y un nodo que se
 * referencia a sí mismo.
 */
export function makeParallelRelations(): QueryResult {
  const a = makeNode(`${EX}a`);
  const b = makeNode(`${EX}b`);
  const edges = [
    makeEdge(a.uri, b.uri, `${EX}p/knows`),
    makeEdge(a.uri, b.uri, `${EX}p/worksWith`),
    makeEdge(b.uri, a.uri, `${EX}p/reportsTo`),
    makeEdge(a.uri, a.uri, `${EX}p/sameAs`),
  ];
  return makeQueryResult([a, b], edges);
}

/**
 * Blank nodes estructurales: entidades conectadas por cadenas de bnodes
 * intermedios (statement reificado). En los bindings los bnodes vienen crudos
 * (`b0`); en nodos/aristas van con el id de grafo (`_:b0`).
 */
export function makeStructuralBnodes(entities = 3): QueryResult {
  const nodes: NormalizedNode[] = [];
  const edges: NormalizedEdge[] = [];
  const bindings: ResultBinding[] = [];
  for (let i = 0; i < entities; i++) {
    const entity = `${EX}entity${i}`;
    const bn = `_:b${i}`;
    nodes.push(makeNode(entity, { classes: [CLASS_PERSON] }));
    nodes.push(makeNode(bn, { label: bn }));
    edges.push(makeEdge(entity, bn, `${EX}p/statement`));
    edges.push(makeEdge(bn, entity, `${EX}p/subject`));
    bindings.push({
      s: { type: 'uri', value: entity },
      stmt: { type: 'bnode', value: `b${i}` },
    });
  }
  return makeQueryResult(nodes, edges, bindings);
}

/** Varios componentes desconectados de `size` nodos en cadena. */
export function makeDisconnectedComponents(components = 4, size = 3): QueryResult {
  const nodes: NormalizedNode[] = [];
  const edges: NormalizedEdge[] = [];
  for (let c = 0; c < components; c++) {
    for (let i = 0; i < size; i++) {
      const uri = `${EX}k${c}_${i}`;
      nodes.push(makeNode(uri));
      if (i > 0) edges.push(makeEdge(`${EX}k${c}_${i - 1}`, uri));
    }
  }
  return makeQueryResult(nodes, edges);
}

/** 300 nodos con pocas aristas (resultado ancho y ralo, típico de SELECT grande). */
export function makeWideSparse(nodeCount = 300, edgeCount = 30): QueryResult {
  const nodes = Array.from({ length: nodeCount }, (_, i) => makeNode(`${EX}w${i}`));
  const edges: NormalizedEdge[] = [];
  for (let i = 0; i < edgeCount; i++) {
    edges.push(makeEdge(`${EX}w${i}`, `${EX}w${(i * 7 + 1) % nodeCount}`, `${EX}p/link${i % 3}`));
  }
  return makeQueryResult(nodes, edges);
}

/** 100 nodos con miles de aristas (denso: estresa el cómputo de grado). */
export function makeDenseSmall(nodeCount = 100, edgesPerNode = 30): QueryResult {
  const nodes = Array.from({ length: nodeCount }, (_, i) => makeNode(`${EX}d${i}`));
  const edges: NormalizedEdge[] = [];
  for (let i = 0; i < nodeCount; i++) {
    for (let j = 0; j < edgesPerNode; j++) {
      const target = (i + j * 13 + 1) % nodeCount;
      edges.push(makeEdge(`${EX}d${i}`, `${EX}d${target}`, `${EX}p/e${j % 5}`));
    }
  }
  return makeQueryResult(nodes, edges);
}

/** Varias clases y una entidad multi-tipo (`classes` con 2 URIs). */
export function makeMultiClass(): QueryResult {
  const person = makeNode(`${EX}p1`, { classes: [CLASS_PERSON] });
  const city = makeNode(`${EX}c1`, { classes: [CLASS_CITY] });
  const multi = makeNode(`${EX}m1`, { classes: [CLASS_PERSON, CLASS_CITY] });
  const unclassified = makeNode(`${EX}u1`, { queryVariable: 'item' });
  const edges = [
    makeEdge(person.uri, city.uri, `${EX}p/bornIn`),
    makeEdge(multi.uri, city.uri, `${EX}p/livesIn`),
    makeEdge(unclassified.uri, person.uri, `${EX}p/knows`),
  ];
  return makeQueryResult([person, city, multi, unclassified], edges);
}

/** Mezcla con y sin coordenadas y fechas. */
export function makeGeoTemporalMix(): QueryResult {
  const geoTemporal = makeNode(`${EX}g1`, {
    classes: [CLASS_BATTLE],
    coordinate: { lat: -34.6, lng: -58.4 },
    temporalEvents: [{ field: 'date', isoDate: '1816-07-09T00:00:00Z' }],
  });
  const geoOnly = makeNode(`${EX}g2`, {
    classes: [CLASS_CITY],
    coordinate: { lat: -31.4, lng: -64.2 },
  });
  const temporalOnly = makeNode(`${EX}g3`, {
    classes: [CLASS_PERSON],
    temporalEvents: [{ field: 'birth', isoDate: '1899-08-24T00:00:00Z' }],
  });
  const plain = makeNode(`${EX}g4`);
  const edges = [
    makeEdge(geoTemporal.uri, geoOnly.uri, `${EX}p/near`),
    makeEdge(geoTemporal.uri, temporalOnly.uri, `${EX}p/participant`),
    makeEdge(temporalOnly.uri, plain.uri, `${EX}p/knows`),
  ];
  return makeQueryResult([geoTemporal, geoOnly, temporalOnly, plain], edges);
}

/**
 * Resultado "recortado" tipo DISTINCT/property-path: nodos presentes pero sin
 * aristas que los conecten entre sí (quedan todos desconectados en el grafo).
 */
export function makeDistinctShaped(nodeCount = 12): QueryResult {
  const nodes = Array.from({ length: nodeCount }, (_, i) =>
    makeNode(`${EX}x${i}`, { queryVariable: 'item' }),
  );
  const bindings = nodes.map((n) => ({ s: { type: 'uri' as const, value: n.uri } }));
  return makeQueryResult(nodes, [], bindings);
}
