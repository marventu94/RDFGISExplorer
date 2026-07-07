import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, shareReplay, tap } from 'rxjs';

export interface DescribeConfig {
  exclude: string[];
  objects: string[];
  datatype: string[];
  text: string[];
  image: string[];
  external: string[];
}

export interface SearchClass {
  uri: { type: 'uri'; value: string; 'xml:lang'?: string };
  label: { type: 'literal'; value: string; 'xml:lang'?: string };
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

  private readonly config$ = this.http.get<AppConfig>('/api/config').pipe(
    tap((cfg) => this.config.set(cfg)),
    shareReplay(1),
  );

  load(): Observable<AppConfig> {
    return this.config$;
  }
}
