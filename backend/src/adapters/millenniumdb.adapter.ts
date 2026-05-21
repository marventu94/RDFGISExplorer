// Stub fase 2. See docs/modules/M09-sparql-adapter.md

import {
  SparqlEndpoint,
  ExecuteOptions,
  NotImplementedError,
} from './sparql-endpoint.interface';
import { QueryResult } from '../shared/dto/query-result.dto';

export class MillenniumDBAdapter implements SparqlEndpoint {
  readonly backendName = 'millenniumdb' as const;

  execute(query: string, opts: ExecuteOptions): Promise<QueryResult> {
    void query;
    void opts;
    return Promise.reject(
      new NotImplementedError('MillenniumDBAdapter — pending fase 2'),
    );
  }

  getPredicates(): Promise<string[]> {
    return Promise.reject(
      new NotImplementedError(
        'MillenniumDBAdapter.getPredicates — pending fase 2',
      ),
    );
  }
}
