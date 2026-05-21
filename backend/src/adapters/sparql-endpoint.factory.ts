// TODO (M09): complete factory with real adapter implementations
// See docs/modules/M09-sparql-adapter.md

import { WikidataAdapter } from './wikidata.adapter';
import { MillenniumDBAdapter } from './millenniumdb.adapter';
import { SparqlEndpoint } from './sparql-endpoint.interface';

export function createSparqlEndpoint(): SparqlEndpoint {
  const backend = process.env['SPARQL_BACKEND'] ?? 'wikidata';
  switch (backend) {
    case 'millenniumdb':
      return new MillenniumDBAdapter();
    case 'wikidata':
    default:
      return new WikidataAdapter();
  }
}
