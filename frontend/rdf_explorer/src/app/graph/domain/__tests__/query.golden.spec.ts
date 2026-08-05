import { describe, it, expect, beforeEach } from 'vitest';
import { PropertyGraph } from '../graph';
import { GenericAdapter } from '../endpoint/generic-adapter';
import { createCatsExample, createW3cExample, createMosquitoExample, createCancerExample } from '../examples/canned-examples';

const PREFIXES = [
  { prefix: 'rdf', uri: 'http://www.w3.org/1999/02/22-rdf-syntax-ns#' },
  { prefix: 'owl', uri: 'http://www.w3.org/2002/07/owl#' },
  { prefix: 'text', uri: 'http://jena.apache.org/text#' },
  { prefix: 'wds', uri: 'http://www.wikidata.org/entity/statement/' },
  { prefix: 'wd', uri: 'http://www.wikidata.org/entity/' },
  { prefix: 'wdv', uri: 'http://www.wikidata.org/value/' },
  { prefix: 'wikibase', uri: 'http://wikiba.se/ontology#' },
  { prefix: 'psvn', uri: 'http://www.wikidata.org/prop/statement/value-normalized/' },
  { prefix: 'ps', uri: 'http://www.wikidata.org/prop/statement/' },
  { prefix: 'pqv', uri: 'http://www.wikidata.org/prop/qualifier/value/' },
  { prefix: 'pq', uri: 'http://www.wikidata.org/prop/qualifier/' },
  { prefix: 'wdt', uri: 'http://www.wikidata.org/prop/direct/' },
  { prefix: 'p', uri: 'http://www.wikidata.org/prop/' },
  { prefix: 'rdfs', uri: 'http://www.w3.org/2000/01/rdf-schema#' },
  { prefix: 'bd', uri: 'http://www.bigdata.com/rdf#' },
  { prefix: 'dbc', uri: 'http://dbpedia.org/resource/Category:' },
  { prefix: 'dbo', uri: 'http://dbpedia.org/ontology/' },
  { prefix: 'dbp', uri: 'http://dbpedia.org/property/' },
  { prefix: 'dbt', uri: 'http://dbpedia.org/resource/Template:' },
  { prefix: 'dbr', uri: 'http://dbpedia.org/resource/' },
  { prefix: 'dc', uri: 'http://purl.org/dc/elements/1.1/' },
  { prefix: 'dct', uri: 'http://purl.org/dc/terms/' },
  { prefix: 'foaf', uri: 'http://xmlns.com/foaf/0.1/' },
  { prefix: 'yago', uri: 'http://dbpedia.org/class/yago/' },
  { prefix: 'wiki-commons', uri: 'http://commons.wikimedia.org/wiki/' },
  { prefix: 'umbel', uri: 'http://umbel.org/umbel#' },
  { prefix: 'umbel-ac', uri: 'http://umbel.org/umbel/ac/' },
  { prefix: 'umbel-rc', uri: 'http://umbel.org/umbel/rc/' },
  { prefix: 'umbel-sc', uri: 'http://umbel.org/umbel/sc/' },
  { prefix: 'dul', uri: 'http://www.ontologydesignpatterns.org/ont/dul/DUL.owl' },
  { prefix: 'schema', uri: 'http://schema.org/' },
  { prefix: 'vrank', uri: 'http://purl.org/voc/vrank#' },
  { prefix: 'skos', uri: 'http://www.w3.org/2004/02/skos/core#' },
  { prefix: 'prov', uri: 'http://www.w3.org/ns/prov#' },
];

// Expected SPARQL output captured from the legacy RDFExplorer application.
// Derived from legacy property-graph.js Query.get() for each canned example.
const FIXTURES: Record<string, string> = {
  cats: `PREFIX wdt: <http://www.wikidata.org/prop/direct/>
PREFIX wd: <http://www.wikidata.org/entity/>
SELECT DISTINCT ?cat WHERE {
  ?cat wdt:P31 wd:Q146 .
}`,
  w3c: `PREFIX wdt: <http://www.wikidata.org/prop/direct/>
PREFIX wd: <http://www.wikidata.org/entity/>
SELECT DISTINCT ?standard WHERE {
  ?standard wdt:P1462 wd:Q37033 .
}`,
  mosquito: `PREFIX wdt: <http://www.wikidata.org/prop/direct/>
PREFIX wd: <http://www.wikidata.org/entity/>
SELECT DISTINCT ?mosquito WHERE {
  ?mosquito wdt:P31 wd:Q16521 .
  ?mosquito wdt:P105 wd:Q7432 .
  ?mosquito wdt:P171* wd:Q7367 .
  ?mosquito wdt:P225 ?taxon_name .
}`,
  cancer: `PREFIX wdt: <http://www.wikidata.org/prop/direct/>
PREFIX wd: <http://www.wikidata.org/entity/>
SELECT DISTINCT ?drug WHERE {
  ?drug wdt:P129 ?gene_product .
  ?gene wdt:P688 ?gene_product .
  ?gene_product wdt:P682 ?biological_process .
  ?biological_process (wdt:P361|wdt:P279)* wd:Q14818032 .
  ?disease wdt:P2293 ?gene .
  ?disease wdt:P279* wd:Q12078 .
}`,
};

function createGraph(): PropertyGraph {
  return new PropertyGraph({
    labelUri: 'http://www.w3.org/2000/01/rdf-schema#label',
    lang: 'en',
    prefixes: PREFIXES,
    endpointAdapter: new GenericAdapter(),
  });
}

describe('Query.toSparql() golden tests', () => {
  let graph: PropertyGraph;

  beforeEach(() => {
    graph = createGraph();
  });

  it('cats — matches legacy output', () => {
    const seed = createCatsExample(graph, 0, 0);
    const q = seed.createQuery();
    expect(q).not.toBeNull();
    expect(q!.toSparql()!.trim()).toBe(FIXTURES['cats'].trim());
  });

  it('w3c — matches legacy output', () => {
    const seed = createW3cExample(graph, 0, 0);
    const q = seed.createQuery();
    expect(q).not.toBeNull();
    expect(q!.toSparql()!.trim()).toBe(FIXTURES['w3c'].trim());
  });

  it('mosquito — matches legacy output', () => {
    const seed = createMosquitoExample(graph, 0, 0);
    const q = seed.createQuery();
    expect(q).not.toBeNull();
    expect(q!.toSparql()!.trim()).toBe(FIXTURES['mosquito'].trim());
  });

  it('cancer — matches legacy output', () => {
    const seed = createCancerExample(graph, 0, 0);
    const q = seed.createQuery();
    expect(q).not.toBeNull();
    expect(q!.toSparql()!.trim()).toBe(FIXTURES['cancer'].trim());
  });

  it('date filters — declares PREFIX xsd (^^xsd:dateTime bypasses curieLocal)', () => {
    const seed = createCatsExample(graph, 0, 0);
    seed.variable.addFilter('datefrom', { date: '2000', granularity: 'year' }, graph);
    seed.variable.addFilter('dateto', { date: '2010', granularity: 'year' }, graph);
    const sparql = seed.createQuery()!.toSparql()!;
    expect(sparql).toContain('^^xsd:dateTime');
    expect(sparql.startsWith('PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>\n')).toBe(true);
  });

  it('no date filters — no PREFIX xsd', () => {
    const seed = createCatsExample(graph, 0, 0);
    const sparql = seed.createQuery()!.toSparql()!;
    expect(sparql).not.toContain('xsd:');
  });
});
