import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DashboardsModule } from './modules/dashboards/dashboards.module';
import { McpModule } from './modules/mcp/mcp.module';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), DashboardsModule, McpModule],
})
export class AppModule {}
