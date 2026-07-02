import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { LogService } from '../../core/log.service';
import { SettingsService } from '../../core/settings.service';
import type { WikidataSearchResult } from './search-result.model';

interface EntitySearchResponse {
  entities: WikidataSearchResult[];
}

@Injectable({ providedIn: 'root' })
export class EntitySearchService {
  private readonly http = inject(HttpClient);
  private readonly log = inject(LogService);
  private readonly settings = inject(SettingsService);

  async search(input: string, signal?: AbortSignal): Promise<WikidataSearchResult[]> {
    const classUri = this.settings.app().searchClass.uri.value;

    const params = new URLSearchParams({
      q: input,
      limit: String(this.settings.app().resultLimit),
    });
    if (classUri) {
      params.set('classUri', classUri);
    }

    const observable = this.http.get<EntitySearchResponse>(
      `/api/suggestions/entities?${params.toString()}`,
    );

    const abort$ = new AbortController();
    if (signal) {
      signal.addEventListener('abort', () => abort$.abort());
    }

    try {
      const result = await firstValueFrom(observable);
      const results = result.entities ?? [];
      this.log.add('Search "' + input + '", ' + results.length + ' results');
      return results;
    } finally {
      abort$.abort();
    }
  }
}
