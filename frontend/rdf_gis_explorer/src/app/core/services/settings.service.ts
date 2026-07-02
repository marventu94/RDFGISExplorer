import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { AppConfigService } from './app-config.service';
import type { AppSettings } from './settings.types';

const FALLBACK_SETTINGS: AppSettings = {
  lang: 'en',
  labelUri: 'http://www.w3.org/2000/01/rdf-schema#label',
  searchClass: {
    uri: { type: 'uri', value: 'http://www.w3.org/2002/07/owl#Thing' },
    label: { type: 'literal', value: 'thing' },
  },
  resultLimit: 500,
  wikibaseAdapter: false,
  endpointType: 'other',
  endpointLabel: 'unknown',
  classColorOverrides: {},
  theme: 'light',
};

@Injectable({ providedIn: 'root' })
export class SettingsService {
  private readonly http = inject(HttpClient);
  private readonly appConfig = inject(AppConfigService);

  private readonly _settings = signal<AppSettings>(this.bootstrap());
  private readonly _loaded = signal(false);
  private readonly _error = signal<string | null>(null);

  readonly app = this._settings.asReadonly();
  readonly loaded = this._loaded.asReadonly();
  readonly error = this._error.asReadonly();

  readonly theme = computed<'light' | 'dark'>(() => this._settings().theme);

  constructor() {
    effect(() => {
      const t = this._settings().theme;
      if (typeof document !== 'undefined') {
        document.documentElement.setAttribute(
          'data-theme',
          t === 'dark' ? 'dark' : 'light',
        );
      }
    });
  }

  initFromConfig(cfg: NonNullable<ReturnType<AppConfigService['config']>>): void {
    if (cfg && !this._loaded()) {
      this._settings.set(this.fromConfigDefaults(cfg));
    }
  }

  async load(): Promise<void> {
    try {
      const settings = await firstValueFrom(
        this.http.get<AppSettings>('/api/settings'),
      );
      this._settings.set(settings);
      this._error.set(null);
    } catch (err) {
      this._error.set((err as Error).message ?? 'Failed to load settings');
    } finally {
      this._loaded.set(true);
    }
  }

  private bootstrap(): AppSettings {
    const cfg = this.appConfig.config();
    return cfg
      ? this.fromConfigDefaults(cfg)
      : FALLBACK_SETTINGS;
  }

  private fromConfigDefaults(
    cfg: NonNullable<ReturnType<AppConfigService['config']>>,
  ): AppSettings {
    return {
      lang: cfg.defaults.lang as AppSettings['lang'],
      labelUri: cfg.defaults.labelUri,
      searchClass: cfg.defaults.searchClass,
      resultLimit: cfg.defaults.resultLimit,
      wikibaseAdapter: cfg.defaults.wikibaseAdapter,
      endpointType: cfg.defaults.endpointType,
      endpointLabel: cfg.defaults.endpointLabel,
      classColorOverrides: {},
      theme: cfg.defaults.theme,
    };
  }
}
