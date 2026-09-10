// Stub fase 2. See docs/modules/M09-sparql-adapter.md

import {
  SparqlEndpoint,
  ExecuteOptions,
  NotImplementedError,
  type EndpointDescriptor,
  type EntitySearchOptions,
  type EntitySearchResult,
} from './sparql-endpoint.interface';
import { QueryResult } from '../shared/dto/query-result.dto';

export class MillenniumDBAdapter implements SparqlEndpoint {
  readonly backendName = 'millenniumdb' as const;

  // A diferencia de execute/getPredicates, esto no puede fallar: /api/config se
  // pide al arrancar el frontend y tiene que responder aunque el backend sea un
  // stub. Se declaran las capacidades minimas.
  describeEndpoint(): EndpointDescriptor {
    return {
      supportsWikibaseLabel: false,
      search: { mode: 'sparql' },
      describe: {
        exclude: [],
        objects: ['http://www.w3.org/1999/02/22-rdf-syntax-ns#type'],
        datatype: [],
        text: ['http://www.w3.org/2000/01/rdf-schema#comment'],
        image: [],
        external: [],
      },
      defaultSearchClass: {
        uri: { type: 'uri', value: 'http://www.w3.org/2002/07/owl#Thing' },
        label: { type: 'literal', value: 'thing', 'xml:lang': 'en' },
      },
    };
  }

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

  searchEntities(
    keyword: string,
    opts: EntitySearchOptions,
  ): Promise<EntitySearchResult[]> {
    void keyword;
    void opts;
    return Promise.reject(
      new NotImplementedError(
        'MillenniumDBAdapter.searchEntities — pending fase 2',
      ),
    );
  }
}
