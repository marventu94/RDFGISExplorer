// Stub fase 2. See docs/modules/M09-sparql-adapter.md

import { SparqlEndpoint, ExecuteOptions, NotImplementedError } from './sparql-endpoint.interface';
import { QueryResult } from '../shared/dto/query-result.dto';

export class MillenniumDBAdapter implements SparqlEndpoint {
  readonly backendName = 'millenniumdb' as const;

  async execute(_query: string, _opts: ExecuteOptions): Promise<QueryResult> {
    throw new NotImplementedError('MillenniumDBAdapter — pending fase 2');
  }

  async getPredicates(): Promise<string[]> {
    throw new NotImplementedError('MillenniumDBAdapter.getPredicates — pending fase 2');
  }
}
