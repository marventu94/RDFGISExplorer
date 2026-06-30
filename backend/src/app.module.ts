import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { SparqlModule } from './modules/sparql/sparql.module';
import { QueryModule } from './modules/query/query.module';
import { SuggestionsModule } from './modules/suggestions/suggestions.module';
import { HealthModule } from './modules/health/health.module';
import { DashboardsModule } from './modules/dashboards/dashboards.module';

import { AppConfigModule } from './modules/app-config/app-config.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    SparqlModule,
    QueryModule,
    SuggestionsModule,
    HealthModule,
    DashboardsModule,
    AppConfigModule,
  ],
})
export class AppModule {}
