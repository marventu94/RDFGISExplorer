// TODO (M09): implement WikidataAdapter
// This file is a stub. See docs/modules/M09-sparql-adapter.md

import { SparqlEndpoint, ExecuteOptions, NotImplementedError } from './sparql-endpoint.interface';
import { QueryResult } from '../shared/dto/query-result.dto';

export class WikidataAdapter implements SparqlEndpoint {
  readonly backendName = 'wikidata' as const;

  async execute(_query: string, _opts: ExecuteOptions): Promise<QueryResult> {
    throw new NotImplementedError('WikidataAdapter.execute — pending M09 implementation');
  }

  async getPredicates(): Promise<string[]> {
    throw new NotImplementedError('WikidataAdapter.getPredicates — pending M09 implementation');
  }
}
