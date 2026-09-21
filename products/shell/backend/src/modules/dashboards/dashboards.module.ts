import { Module } from '@nestjs/common';
import { DashboardsController } from './dashboards.controller';
import { DashboardsService } from './dashboards.service';
import { createDashboardsConnection } from '../../db/sqlite.provider';
import { DASHBOARDS_DB } from './dashboards.db-token';

@Module({
  controllers: [DashboardsController],
  providers: [
    DashboardsService,
    {
      provide: DASHBOARDS_DB,
      useFactory: () => {
        return createDashboardsConnection();
      },
    },
  ],
})
export class DashboardsModule {}
