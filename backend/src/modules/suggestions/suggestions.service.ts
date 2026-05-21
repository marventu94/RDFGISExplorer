import { Injectable, Inject } from '@nestjs/common';
import { SPARQL_ENDPOINT } from '../../adapters/sparql-endpoint.interface';
import type { SparqlEndpoint } from '../../adapters/sparql-endpoint.interface';

@Injectable()
export class SuggestionsService {
  constructor(
    @Inject(SPARQL_ENDPOINT) private readonly endpoint: SparqlEndpoint,
  ) {}

  getPredicates(): Promise<string[]> {
    return this.endpoint.getPredicates();
  }
}
