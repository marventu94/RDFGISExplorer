import { Global, Module } from '@nestjs/common';
import { SPARQL_ENDPOINT } from '../../adapters/sparql-endpoint.interface';
import { createSparqlEndpoint } from '../../adapters/sparql-endpoint.factory';

@Global()
@Module({
  providers: [
    {
      provide: SPARQL_ENDPOINT,
      useFactory: () => createSparqlEndpoint(),
    },
  ],
  exports: [SPARQL_ENDPOINT],
})
export class SparqlModule {}
