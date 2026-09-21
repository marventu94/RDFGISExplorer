import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, shareReplay, tap } from 'rxjs';
import type { AppConfig } from '@rdfgis/contracts';
import { explorerApiBase } from '@rdfgis/platform-bridge';

// Contrato compartido: la fuente de verdad vive en packages/contracts.
export type {
  DescribeConfig,
  SearchClass,
  SettingsDefaults,
  AppConfig,
} from '@rdfgis/contracts';

@Injectable({ providedIn: 'root' })
export class AppConfigService {
  private readonly http = inject(HttpClient);
  readonly config = signal<AppConfig | null>(null);

  private readonly config$ = this.http.get<AppConfig>(`${explorerApiBase('gis')}/config`).pipe(
    tap((cfg) => this.config.set(cfg)),
    shareReplay(1),
  );

  load(): Observable<AppConfig> {
    return this.config$;
  }
}
