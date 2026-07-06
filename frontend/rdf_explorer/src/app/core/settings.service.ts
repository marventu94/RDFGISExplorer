import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { AppConfigService } from './services/app-config.service';
import { SettingsApiService } from './services/settings-api.service';
import type { AppSettings } from './settings.types';
import type { QueryContext } from './query.service';
import { DEFAULT_QUERY_CONTEXT } from './query.service';

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
  private readonly api = inject(SettingsApiService);
  private readonly appConfig = inject(AppConfigService);

  private readonly _settings = signal<AppSettings>(this.bootstrap());
  private readonly _loaded = signal(false);
  private readonly _error = signal<string | null>(null);

  readonly app = this._settings.asReadonly();
  readonly loaded = this._loaded.asReadonly();
  readonly error = this._error.asReadonly();

  readonly theme = computed<'light' | 'dark'>(() => this._settings().theme);

  readonly queryContext = computed<QueryContext>(() => {
    const s = this._settings();
    const cfg = this.appConfig.config();
    return {
      lang: s.lang || DEFAULT_QUERY_CONTEXT.lang,
      labelUri: s.labelUri || DEFAULT_QUERY_CONTEXT.labelUri,
      endpointType: s.endpointType,
      wikibaseAdapter: cfg?.supportsWikibaseLabel ?? false,
    };
  });

  constructor() {
    effect(() => {
      const theme = this._settings().theme;
      if (typeof document !== 'undefined') {
        document.documentElement.setAttribute(
          'data-theme',
          theme === 'dark' ? 'dark' : 'light',
        );
      }
    });
  }

  initFromConfig(cfg: ReturnType<AppConfigService['config']>): void {
    if (cfg && !this._loaded()) {
      this._settings.set(this.fromConfigDefaults(cfg));
    }
  }

  async load(): Promise<void> {
    try {
      const settings = await firstValueFrom(this.api.get());
      const merged = this.mergeWithConfigDefaults(settings);
      this._settings.set(merged);
      this._error.set(null);
    } catch (err) {
      this._error.set((err as Error).message ?? 'Failed to load settings');
    } finally {
      this._loaded.set(true);
    }
  }

  update<K extends keyof AppSettings>(key: K, value: AppSettings[K]): void {
    const current = this._settings();
    const next: AppSettings = { ...current, [key]: value };
    this._settings.set(next);
    this.api.put({ [key]: value }).subscribe({
      next: (saved) => this._settings.set(this.mergeWithConfigDefaults(saved)),
      error: (err: unknown) => {
        this._error.set((err as Error).message ?? 'Failed to persist settings');
        this._settings.set(current);
      },
    });
  }

  reset(): void {
    const cfg = this.appConfig.config();
    if (!cfg) return;
    const defaults = this.fromConfigDefaults(cfg);
    this._settings.set(defaults);
    this.api.put(defaults).subscribe({
      next: (saved) => this._settings.set(this.mergeWithConfigDefaults(saved)),
    });
  }

  private bootstrap(): AppSettings {
    const cfg = this.appConfig.config();
    return cfg ? this.fromConfigDefaults(cfg) : FALLBACK_SETTINGS;
  }

  private mergeWithConfigDefaults(settings: AppSettings): AppSettings {
    const cfg = this.appConfig.config();
    if (!cfg) return settings;
    return {
      ...settings,
      wikibaseAdapter: cfg.defaults.wikibaseAdapter,
    };
  }

  private fromConfigDefaults(cfg: NonNullable<ReturnType<AppConfigService['config']>>): AppSettings {
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
