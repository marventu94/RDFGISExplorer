import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { SPARQL_ENDPOINT } from './adapters/sparql-endpoint.interface';
import { createSparqlEndpoint } from './adapters/sparql-endpoint.factory';
import { QueryModule } from './modules/query/query.module';
import { SuggestionsModule } from './modules/suggestions/suggestions.module';
import { HealthModule } from './modules/health/health.module';
import { CurationModule } from './modules/curation/curation.module';
import { DatabaseModule } from './db/database.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    DatabaseModule,
    QueryModule,
    SuggestionsModule,
    HealthModule,
    CurationModule,
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
