import { Injectable, inject } from '@angular/core';
import { RequestService } from '../../core/request.service';
import { querySearch } from '../../core/query.service';
import { SettingsService } from '../../core/settings.service';
import { LogService } from '../../core/log.service';
import type { SparqlJsonResult } from '../../core/request.service';

export interface WikidataSearchResult {
  uri: string;
  label: string;
  description?: string;
}

const WIKIDATA_API = 'https://www.wikidata.org/w/api.php';

@Injectable({ providedIn: 'root' })
export class WikidataSearchService {
  private readonly request = inject(RequestService);
  private readonly settings = inject(SettingsService);
  private readonly log = inject(LogService);

  async search(input: string, signal?: AbortSignal): Promise<WikidataSearchResult[]> {
    const endpoint = this.settings.app().endpoint;
    const isWikidata = endpoint.label === 'wikidata' || endpoint.url.includes('wikidata');

    if (isWikidata) {
      return this.wikidataSearch(input, signal);
    }
    return this.sparqlSearch(input, signal);
  }

  private async wikidataSearch(input: string, signal?: AbortSignal): Promise<WikidataSearchResult[]> {
    const params = new URLSearchParams({
      action: 'wbsearchentities',
      format: 'json',
      language: 'en',
      uselang: 'en',
      type: 'item',
      continue: '0',
      limit: '20',
      search: input,
      origin: '*',
    });

    const response = await fetch(`${WIKIDATA_API}?${params.toString()}`, {
      method: 'GET',
      signal,
    });

    if (!response.ok) {
      throw new Error(`Wikidata search failed: ${response.status}`);
    }

    const data = await response.json();
    const searchEntries = data.search ?? [];
    const results: WikidataSearchResult[] = [];

    for (const r of searchEntries) {
      results.push({
        uri: r.concepturi,
        label: r.label ?? r.concepturi,
        description: r.description,
      });
      if (r.label) {
        this.request.setLabel(r.concepturi, r.label);
      }
    }

    this.log.add('Search "' + input + '", ' + results.length + ' results');
    return results;
  }

  private async sparqlSearch(input: string, signal?: AbortSignal): Promise<WikidataSearchResult[]> {
    const s = this.settings.app();
    const query = querySearch(input, {
      type: s.searchClass.uri.value,
      limit: s.resultLimit,
      endpointType: s.endpoint.type,
    });

    const response = await this.request.execQuery<SparqlJsonResult>(query, { signal });
    const results: WikidataSearchResult[] = [];

    for (const binding of response.results.bindings) {
      results.push({
        uri: binding['uri'].value,
        label: binding['label']?.value ?? binding['uri'].value,
        description: binding['tlabel']?.value,
      });
    }

    this.log.add('Search "' + input + '", ' + results.length + ' results');
    return results;
  }
}
