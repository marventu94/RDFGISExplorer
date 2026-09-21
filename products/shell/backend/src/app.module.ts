import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DashboardsModule } from './modules/dashboards/dashboards.module';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), DashboardsModule],
})
export class AppModule {}
