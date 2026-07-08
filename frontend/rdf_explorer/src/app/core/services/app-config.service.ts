import { Injectable, inject, signal, computed } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import type { QueryContext } from '../query.service';
import type { AppConfig, SearchClass } from '@rdfgis/contracts';

// Contrato compartido: la fuente de verdad vive en packages/contracts.
export type {
  EndpointType,
  SearchClassBinding,
  SearchClass,
  DescribeConfig,
  SettingsDefaults,
  AppConfig,
} from '@rdfgis/contracts';

export interface Prefix {
  prefix: string;
  uri: string;
}

@Injectable({ providedIn: 'root' })
export class AppConfigService {
  private readonly http = inject(HttpClient);
  readonly config = signal<AppConfig | null>(null);

  constructor() {
    this.http.get<AppConfig>('/api/config').subscribe({
      next: (cfg) => {
        this.config.set(cfg);
      },
      error: (err) => {
        console.error('[AppConfigService] failed to load config:', err);
      },
    });
  }

  readonly queryContext = computed<QueryContext>(() => {
    const cfg = this.config();
    const defaults = cfg?.defaults;
    return {
      lang: defaults?.lang ?? 'en',
      labelUri: cfg?.labelUri ?? 'http://www.w3.org/2000/01/rdf-schema#label',
      endpointType: defaults?.endpointType ?? 'other',
      supportsWikibaseLabel: cfg?.supportsWikibaseLabel ?? false,
    };
  });

  readonly endpointType = computed<'virtuoso' | 'fuseki' | 'other'>(() =>
    this.config()?.defaults?.endpointType ?? 'other',
  );

  readonly resultLimit = computed<number>(() =>
    this.config()?.defaults?.resultLimit ?? 500,
  );

  readonly searchClass = computed<SearchClass>(() =>
    this.config()?.defaults?.searchClass ?? {
      uri: { type: 'uri', value: 'http://www.w3.org/2002/07/owl#Thing' },
      label: { type: 'literal', value: 'thing' },
    },
  );

  readonly lang = computed<string>(() =>
    this.config()?.defaults?.lang ?? 'en',
  );

  readonly labelUri = computed<string>(() =>
    this.config()?.labelUri ?? 'http://www.w3.org/2000/01/rdf-schema#label',
  );

  readonly supportsWikibaseLabel = computed<boolean>(() =>
    this.config()?.supportsWikibaseLabel ?? false,
  );

  readonly defaultPrefixes = computed<Record<string, string>>(() =>
    this.config()?.defaultPrefixes ?? {},
  );
}
