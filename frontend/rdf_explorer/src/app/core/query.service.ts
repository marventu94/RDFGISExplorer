import type { EndpointType } from './settings.types';

export interface QueryContext {
  lang: string;
  labelUri: string;
  endpointType: EndpointType;
  wikibaseAdapter: boolean;
}

export const DEFAULT_QUERY_CONTEXT: QueryContext = {
  lang: 'en',
  labelUri: 'http://www.w3.org/2000/01/rdf-schema#label',
  endpointType: 'other',
  wikibaseAdapter: false,
};

function escapeKeyword(keyword: string): string {
  return keyword.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function u(uri: string): string {
  return '<' + uri + '>';
}

function labelTriple(ctx: QueryContext, varName: string, valueVar = 'label'): string {
  return `      ?${varName} <${ctx.labelUri}> ?${valueVar} .\n`;
}

function langFilter(ctx: QueryContext, varName: string, fallback = false): string {
  if (fallback) {
    return `      FILTER (lang(?${varName}) = "" || lang(?${varName}) = "${ctx.lang}")\n`;
  }
  return `      FILTER (lang(?${varName}) = "${ctx.lang}")\n`;
}

function createEndpointAdapter(type: EndpointType) {
  switch (type) {
    case 'virtuoso':
      return {
        textSearchTriple(label: string, keyword: string, _limit: number) {
          return `      ?${label} bif:contains "'${keyword}'" .`;
        },
      };
    case 'fuseki':
      return {
        textSearchTriple(label: string, keyword: string, limit: number) {
          return `      ?uri text:query (rdfs:label "${keyword}" ${limit}) .`;
        },
      };
    default:
      return {
        textSearchTriple(label: string, keyword: string, _limit: number) {
          return `      FILTER regex(?${label}, "${keyword}", "i")`;
        },
      };
  }
}

export function querySearch(
  keyword: string,
  opts: { type?: string; limit?: number; offset?: number } & QueryContext,
): string {
  const type = opts.type ?? 'http://www.w3.org/2002/07/owl#Thing';
  const limit = opts.limit ?? 20;
  const adapter = createEndpointAdapter(opts.endpointType);
  const escaped = escapeKeyword(keyword);

  let q = 'PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>\n';
  if (opts.endpointType === 'fuseki') {
    q += 'PREFIX text: <http://jena.apache.org/text#>\n';
  }
  q += 'SELECT DISTINCT ?uri ?label ?type ?tlabel WHERE {\n';
  q += '  { SELECT ?uri ?label WHERE {\n';
  q += labelTriple(opts, 'uri', 'label');
  q += langFilter(opts, 'label');
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
  q += labelTriple(opts, 'type', 'tlabel');
  q += langFilter(opts, 'tlabel');
  q += '}}';
  return q;
}

export function queryGetClasses(
  uri: string,
  opts: { limit?: number; offset?: number } & QueryContext,
): string {
  let q = 'SELECT DISTINCT ?uri ?label WHERE {\n';
  q += '  ' + u(uri) + ' a ?uri .\n';
  q += labelTriple(opts, 'uri', 'label');
  q += langFilter(opts, 'label');
  q += '}';
  if (opts.limit) q += ' limit ' + opts.limit;
  if (opts.offset) q += ' offset ' + opts.offset;
  return q;
}

export function queryGetProperties(
  uri: string,
  opts: QueryContext,
): string {
  const useWikibase = opts.wikibaseAdapter;
  let q = 'PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>\n';
  q += 'PREFIX owl: <http://www.w3.org/2002/07/owl#>\n';
  if (useWikibase) {
    q += 'PREFIX bd: <http://www.bigdata.com/rdf#>\n';
    q += 'PREFIX wikibase: <http://wikiba.se/ontology#>\n';
    q += 'SELECT DISTINCT ?property ?propertyLabel ?kind WHERE {\n';
    q += '  { SELECT ?property WHERE { <' + uri + '> ?property []. } LIMIT 250 }\n';
    q += '  ?p wikibase:directClaim ?property .\n';
    q += '  OPTIONAL { ?property wikibase:propertyType ?propType }\n';
    q += '  BIND(\n';
    q += '    IF(BOUND(?propType) && ?propType = wikibase:WikibaseItem, "1", "2")\n';
    q += '    as ?kind)\n';
    q += '  SERVICE wikibase:label { bd:serviceParam wikibase:language "'
      + opts.lang + '". }\n';
    q += '}';
  } else {
    q += 'SELECT DISTINCT ?property ?propertyLabel ?kind WHERE {\n';
    q += '  <' + uri + '> ?property [] .\n';
    q += '  OPTIONAL { ?property <' + opts.labelUri + '> ?propertyLabel .\n';
    q += langFilter(opts, 'propertyLabel');
    q += '  }\n';
    q += '  BIND("0" AS ?kind)\n';
    q += '}\n';
    q += 'LIMIT 250';
  }
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

export function queryGetPropObject(
  uri: string,
  prop: string,
  ctx: QueryContext,
): string {
  let q = 'SELECT DISTINCT ?uri ?uriLabel WHERE {\n';
  q += '  <' + uri + '> <' + prop + '> ?uri .\n';
  q += '  OPTIONAL { ?uri <' + ctx.labelUri + '> ?uriLabel .\n';
  q += langFilter(ctx, 'uriLabel');
  q += '  }\n';
  q += '}';
  return q;
}

export function queryGetPropDatatype(
  uri: string,
  prop: string,
  ctx: QueryContext,
): string {
  let q = 'SELECT DISTINCT ?lit WHERE {\n';
  q += '  <' + uri + '> <' + prop + '> ?lit .\n';
  q += '  FILTER (lang(?lit) = "" || lang(?lit) = "' + ctx.lang + '")\n';
  q += '}';
  return q;
}
