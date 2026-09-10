import { describe, it, expect, beforeEach } from 'vitest';
import { PropertyGraph } from '../graph';
import { Query } from '../query';
import { GenericAdapter } from '../endpoint/generic-adapter';
import type { Node } from '../node';

const EX = 'http://example.org/';

function createGraph(): PropertyGraph {
  return new PropertyGraph({
    labelUri: 'http://www.w3.org/2000/01/rdf-schema#label',
    lang: 'en',
    prefixes: [{ prefix: 'ex', uri: EX }],
    endpointAdapter: new GenericAdapter(),
  });
}

/** `subject --ex:name--> nuevo nodo variable`, opcional o no. */
function link(
  graph: PropertyGraph,
  subject: Node,
  name: string,
  opts: { optional?: boolean } = {},
): Node {
  const prop = subject.newProp();
  prop.addUri(EX + name);
  prop.mkConst();
  prop.optional = opts.optional ?? false;
  const target = graph.addNode();
  graph.addEdge(prop, target);
  return target;
}

function optionalBlocks(sparql: string): string[][] {
  const blocks: string[][] = [];
  const lines = sparql.split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (!lines[i].trim().startsWith('OPTIONAL {')) continue;
    const block: string[] = [];
    for (let j = i + 1; j < lines.length && lines[j].trim() !== '}'; j++) {
      block.push(lines[j].trim());
    }
    blocks.push(block);
  }
  return blocks;
}

describe('Query: bloques OPTIONAL', () => {
  let graph: PropertyGraph;

  beforeEach(() => {
    graph = createGraph();
  });

  it('encadena en un solo bloque los opcionales que comparten variables propias', () => {
    // Obligatorio: ?a ex:tipo ?t. Opcional (cadena): ?a → ?sitio → ?geom → ?wkt
    const a = graph.addNode();
    link(graph, a, 'tipo');
    const sitio = link(graph, a, 'includes', { optional: true });
    const geom = link(graph, sitio, 'hasGeometry', { optional: true });
    link(graph, geom, 'asWKT', { optional: true });

    const query = new Query(graph, a);
    const sparql = query.toSparql()!;
    const blocks = optionalBlocks(sparql);

    expect(query.optionals.length).toBe(1);
    expect(blocks.length).toBe(1);
    // Cada eslabón después del que liga a su sujeto.
    expect(blocks[0].length).toBe(3);
    expect(blocks[0][0]).toContain('ex:includes');
    expect(blocks[0][1]).toContain('ex:hasGeometry');
    expect(blocks[0][2]).toContain('ex:asWKT');
  });

  it('ordena la cadena aunque los triples se hayan creado al revés', () => {
    const a = graph.addNode();
    link(graph, a, 'tipo');

    // Se crea primero el eslabón profundo (?sitio → ?geom) y después el que
    // liga ?sitio desde el patrón obligatorio.
    const sitio = graph.addNode();
    const geomProp = sitio.newProp();
    geomProp.addUri(EX + 'hasGeometry');
    geomProp.mkConst();
    geomProp.optional = true;
    const geom = graph.addNode();
    graph.addEdge(geomProp, geom);

    const incProp = a.newProp();
    incProp.addUri(EX + 'includes');
    incProp.mkConst();
    incProp.optional = true;
    graph.addEdge(incProp, sitio);

    const blocks = optionalBlocks(new Query(graph, a).toSparql()!);
    expect(blocks.length).toBe(1);
    expect(blocks[0][0]).toContain('ex:includes');
    expect(blocks[0][1]).toContain('ex:hasGeometry');
  });

  it('deja en bloques separados las ramas opcionales independientes', () => {
    // Dos propiedades opcionales distintas del mismo nodo ya ligado: cada una
    // matchea o no por su cuenta, así que NO deben unirse.
    const a = graph.addNode();
    link(graph, a, 'tipo');
    link(graph, a, 'ramaUno', { optional: true });
    link(graph, a, 'ramaDos', { optional: true });

    const query = new Query(graph, a);
    const blocks = optionalBlocks(query.toSparql()!);

    expect(query.optionals.length).toBe(2);
    expect(blocks.length).toBe(2);
    expect(blocks.every(b => b.length === 1)).toBe(true);
  });

  it('no une opcionales que solo comparten variables del patrón obligatorio', () => {
    // ?a ex:tipo ?t (obligatorio) y ?t ex:algo ?x (opcional) + ?a ex:otro ?y
    // (opcional): comparten ?a/?t, que ya vienen ligadas afuera.
    const a = graph.addNode();
    const t = link(graph, a, 'tipo');
    link(graph, t, 'algo', { optional: true });
    link(graph, a, 'otro', { optional: true });

    const query = new Query(graph, a);
    expect(query.optionals.length).toBe(2);
  });
});
