import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { SPARQL_ENDPOINT } from './adapters/sparql-endpoint.interface';
import { createSparqlEndpoint } from './adapters/sparql-endpoint.factory';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    // TODO (M08): import QueryModule, SuggestionModule, CurationModule, HealthModule
  ],
  providers: [
    {
      provide: SPARQL_ENDPOINT,
      useFactory: () => createSparqlEndpoint(),
    },
  ],
  exports: [SPARQL_ENDPOINT],
})
export class AppModule {}
