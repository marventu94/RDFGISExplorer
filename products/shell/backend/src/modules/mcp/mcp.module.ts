import { Module } from '@nestjs/common';
import { DashboardsModule } from '../dashboards/dashboards.module';
import { ExplorerApiClient } from './explorer-api.client';
import { McpController } from './mcp.controller';
import { McpGuard } from './mcp.guard';

@Module({
  imports: [DashboardsModule],
  controllers: [McpController],
  providers: [ExplorerApiClient, McpGuard],
})
export class McpModule {}
