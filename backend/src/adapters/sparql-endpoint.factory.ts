import { SparqlEndpoint } from './sparql-endpoint.interface';
import { GenericSparqlAdapter } from './generic-sparql.adapter';
import { MillenniumDBAdapter } from './millenniumdb.adapter';

export function createSparqlEndpoint(): SparqlEndpoint {
  const backend = process.env['SPARQL_BACKEND'] ?? 'wikidata';
  switch (backend) {
    case 'millenniumdb':
      return new MillenniumDBAdapter();
    case 'generic':
    case 'wikidata':
    default:
      return new GenericSparqlAdapter();
  }
}
