import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { SparqlModule } from './modules/sparql/sparql.module';
import { QueryModule } from './modules/query/query.module';
import { SuggestionsModule } from './modules/suggestions/suggestions.module';
import { HealthModule } from './modules/health/health.module';
import { CurationModule } from './modules/curation/curation.module';
import { DashboardsModule } from './modules/dashboards/dashboards.module';
import { DatabaseModule } from './db/database.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    DatabaseModule,
    SparqlModule,
    QueryModule,
    SuggestionsModule,
    HealthModule,
    CurationModule,
    DashboardsModule,
  ],
})
export class AppModule {}
