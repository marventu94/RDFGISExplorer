import { SparqlEndpoint } from './sparql-endpoint.interface';
import { GenericSparqlAdapter } from './generic-sparql.adapter';
import { WikidataAdapter } from './wikidata.adapter';

export function createSparqlEndpoint(): SparqlEndpoint {
  const backend = process.env['SPARQL_BACKEND'] ?? 'wikidata';
  return backend === 'wikidata'
    ? new WikidataAdapter()
    : new GenericSparqlAdapter(backend);
}
