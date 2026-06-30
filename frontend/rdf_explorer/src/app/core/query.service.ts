import type { EndpointType } from './settings.types';
import { createEndpointAdapter } from './endpoint-adapter';

function escapeKeyword(keyword: string): string {
  return keyword.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function u(uri: string): string {
  return '<' + uri + '>';
}

export function querySearch(
  keyword: string,
  opts: { type?: string; limit?: number; offset?: number; endpointType: EndpointType },
): string {
  const type = opts.type ?? 'http://dbpedia.org/ontology/Person';
  const limit = opts.limit ?? 20;
  const adapter = createEndpointAdapter(opts.endpointType);
  const escaped = escapeKeyword(keyword);

  let q = 'PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>\n';
  q += 'PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>\n';
  if (opts.endpointType === 'fuseki') {
    q += 'PREFIX text: <http://jena.apache.org/text#>\n';
  }
  q += 'SELECT DISTINCT ?uri ?label ?type ?tlabel WHERE {\n';
  q += '  { SELECT ?uri ?label WHERE {\n';
  q += '      ?uri rdfs:label ?label .\n';
  q += '      FILTER (lang(?label) = "en")\n';
  if (keyword) {
    q += adapter.textSearchTriple('label', escaped, limit) + '\n';
  }
  q += '  } LIMIT ' + limit;
  if (opts.offset !== undefined) {
    q += ' OFFSET ' + opts.offset;
  }
  q += '\n  }\n';
  q += '  OPTIONAL {\n';
  q += '  ?uri rdf:type ?type .\n';
  q += '  ?type rdfs:label ?tlabel .\n';
  q += '  FILTER (lang(?tlabel) = "en")\n}}';
  return q;
}

export function queryGetClasses(
  uri: string,
  opts?: { limit?: number; offset?: number },
): string {
  let q = 'PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>\n';
  q += 'SELECT DISTINCT ?uri ?label WHERE {\n';
  q += '  ' + u(uri) + ' a ?uri .\n';
  q += '  ?uri rdfs:label ?label .\n';
  q += '  FILTER (lang(?label) = "en")\n';
  q += '}';
  if (opts?.limit) q += ' limit ' + opts.limit;
  if (opts?.offset) q += ' offset ' + opts.offset;
  return q;
}

export function queryGetProperties(
  uri: string,
  opts?: { wikibase?: boolean },
): string {
  const useWikibase = opts?.wikibase ?? true;
  let q = 'PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>\n';
  q += 'PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>\n';
  q += 'PREFIX owl: <http://www.w3.org/2002/07/owl#>\n';
  if (useWikibase) {
    q += 'PREFIX bd: <http://www.bigdata.com/rdf#>\n';
    q += 'PREFIX wikibase: <http://wikiba.se/ontology#>\n';
  }
  q += 'SELECT DISTINCT ?property ?propertyLabel ?kind WHERE {\n';
  q += '  <' + uri + '> ?property [] .\n';
  if (useWikibase) {
    q += '  ?p wikibase:directClaim ?property .\n';
  }
  q += '  OPTIONAL { ?p rdfs:label ?propertyLabel . FILTER (lang(?propertyLabel) = "en")}\n';
  q += '  BIND(\n';
  q += '    IF(EXISTS { ?property rdf:type owl:ObjectProperty},\n';
  q += '      1,\n';
  q += '      IF(EXISTS {?property rdf:type owl:DatatypeProperty},\n';
  q += '        2,\n';
  q += '        0))\n';
  q += '    as ?kind)\n';
  q += '}';
  return q;
}

export function queryCountValuesType(uri: string, prop: string): string {
  return 'SELECT (sum(?u) as ?uris) (sum(?l) as ?lits) WHERE {\n' +
         '  <' + uri + '> <' + prop + '> ?o .\n' +
         '  BIND(IF(ISURI(?o),1,0) AS ?u)\n' +
         '  BIND(IF(!ISURI(?o),1,0) AS ?l)\n}';
}

export function queryGetPropUri(uri: string, prop: string): string {
  return 'SELECT ?uri WHERE {\n' +
         '  <' + uri + '> <' + prop + '> ?uri .\n}';
}

export function queryGetPropObject(uri: string, prop: string): string {
  return 'PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>\n' +
         'PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>\n' +
         'SELECT DISTINCT ?uri ?uriLabel WHERE {\n' +
         '  <' + uri + '> <' + prop + '> ?uri .\n' +
         '  OPTIONAL { ?uri rdfs:label ?uriLabel . FILTER (lang(?uriLabel) = "en")}\n}';
}

export function queryGetPropDatatype(uri: string, prop: string): string {
  return 'SELECT DISTINCT ?lit WHERE {\n' +
         '  <' + uri + '> <' + prop + '> ?lit .\n' +
         '  FILTER (lang(?lit) = "" || lang(?lit) = "en")\n}';
}
