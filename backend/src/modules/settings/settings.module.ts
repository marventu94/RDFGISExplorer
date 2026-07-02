import { Module } from '@nestjs/common';
import { AppConfigModule } from '../app-config/app-config.module';
import { SettingsController } from './settings.controller';
import { SettingsService } from './settings.service';
import { SETTINGS_DB } from './settings.db-token';
import { createSettingsConnection } from '../../db/sqlite.provider';

@Module({
  imports: [AppConfigModule],
  controllers: [SettingsController],
  providers: [
    SettingsService,
    {
      provide: SETTINGS_DB,
      useFactory: () => createSettingsConnection(),
    },
  ],
})
export class SettingsModule {}
