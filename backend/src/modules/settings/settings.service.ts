import { Injectable, Inject } from '@nestjs/common';
import { SETTINGS_DB } from './settings.db-token';
import type Database from 'better-sqlite3';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { AppConfigService } from '../app-config/app-config.service';
import { AppSettingsDto } from './dto/app-settings.dto';
import { UpdateAppSettingsDto } from './dto/update-settings.dto';

interface SettingsRow {
  id: number;
  data: string;
  updated_at: string;
}

function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

@Injectable()
export class SettingsService {
  private cachedDefaults: AppSettingsDto | null = null;

  constructor(
    @Inject(SETTINGS_DB)
    private readonly db: Database.Database,
    private readonly appConfig: AppConfigService,
  ) {}

  getSettings(): AppSettingsDto {
    const row = this.db
      .prepare('SELECT data FROM settings WHERE id = 1')
      .get() as Pick<SettingsRow, 'data'> | undefined;
    if (!row) {
      return this.getDefaults();
    }
    return JSON.parse(row.data) as AppSettingsDto;
  }

  async updateSettings(partial: UpdateAppSettingsDto): Promise<AppSettingsDto> {
    const current = this.getSettings();
    const merged: AppSettingsDto = { ...current, ...partial };
    const validated = await this.validate(merged);
    this.persist(validated);
    return validated;
  }

  private async validate(settings: AppSettingsDto): Promise<AppSettingsDto> {
    const instance = plainToInstance(AppSettingsDto, settings);
    const errors = await validate(instance, {
      whitelist: true,
      forbidNonWhitelisted: true,
    });
    if (errors.length > 0) {
      const messages = errors
        .map((e) => Object.values(e.constraints ?? {}).join(', '))
        .filter(Boolean);
      const err = new Error(
        `Invalid settings: ${messages.join('; ') || 'unknown'}`,
      );
      (err as Error & { code?: string }).code = 'INVALID_SETTINGS';
      throw err;
    }
    return instance;
  }

  private persist(settings: AppSettingsDto): void {
    const now = new Date().toISOString();
    const data = JSON.stringify(settings);
    this.db
      .prepare(
        `INSERT INTO settings (id, data, updated_at) VALUES (1, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           data = excluded.data,
           updated_at = excluded.updated_at`,
      )
      .run(data, now);
  }

  private getDefaults(): AppSettingsDto {
    if (!this.cachedDefaults) {
      const defaults = this.appConfig.getSettingsDefaults();
      this.cachedDefaults = {
        lang: defaults.lang as 'en',
        labelUri: defaults.labelUri,
        searchClass: defaults.searchClass,
        resultLimit: defaults.resultLimit,
        wikibaseAdapter: defaults.wikibaseAdapter,
        endpointType: defaults.endpointType,
        endpointLabel: defaults.endpointLabel,
        classColorOverrides: {},
      };
    }
    return deepClone(this.cachedDefaults);
  }
}
