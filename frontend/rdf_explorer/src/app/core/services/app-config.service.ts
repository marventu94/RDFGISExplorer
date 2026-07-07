import { Injectable, inject, signal, computed } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, shareReplay, tap } from 'rxjs';
import type { QueryContext } from '../query.service';

export type EndpointType = 'virtuoso' | 'fuseki' | 'other';

export interface SearchClassBinding {
  type: 'uri' | 'literal';
  value: string;
  'xml:lang'?: string;
}

export interface SearchClass {
  uri: SearchClassBinding;
  label: SearchClassBinding;
}

export interface DescribeConfig {
  exclude: string[];
  objects: string[];
  datatype: string[];
  text: string[];
  image: string[];
  external: string[];
}

export interface Prefix {
  prefix: string;
  uri: string;
}

export interface SettingsDefaults {
  lang: string;
  resultLimit: number;
  labelUri: string;
  searchClass: SearchClass;
  endpointType: 'virtuoso' | 'fuseki' | 'other';
}

export interface AppConfig {
  backend: string;
  endpointUrl: string;
  hasBasicAuth: boolean;
  userAgent: string;
  timeoutMs: number;
  defaultLimit: number;
  maxLimit: number;
  capabilities: string[];
  supportsWikibaseLabel: boolean;
  defaultPrefixes: Record<string, string>;
  search: {
    mode: 'wikidata-api' | 'sparql';
    endpoint?: string;
    labelProperty: string;
  };
  labelUri: string;
  describe: DescribeConfig;
  classColors: Record<string, string>;
  defaults: SettingsDefaults;
}

@Injectable({ providedIn: 'root' })
export class AppConfigService {
  private readonly http = inject(HttpClient);
  readonly config = signal<AppConfig | null>(null);

  readonly queryContext = computed<QueryContext>(() => {
    const cfg = this.config();
    const defaults = cfg?.defaults;
    return {
      lang: defaults?.lang ?? 'en',
      labelUri: cfg?.labelUri ?? 'http://www.w3.org/2000/01/rdf-schema#label',
      endpointType: defaults?.endpointType ?? 'other',
      wikibaseAdapter: cfg?.supportsWikibaseLabel ?? false,
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

  private readonly config$ = this.http.get<AppConfig>('/api/config').pipe(
    tap((cfg) => this.config.set(cfg)),
    shareReplay(1),
  );

  load(): Observable<AppConfig> {
    return this.config$;
  }
}
