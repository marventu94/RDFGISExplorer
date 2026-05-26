import { Injectable, signal, inject } from '@angular/core';
import { SettingsService } from './settings.service';
import { WIKIDATA_SEED } from './wikidata-seed';

export interface SparqlBinding {
  type: string;
  value: string;
  'xml:lang'?: string;
  datatype?: string;
}

export interface SparqlJsonResult {
  head: { vars: string[] };
  results: {
    bindings: Array<Record<string, SparqlBinding>>;
  };
}

@Injectable({ providedIn: 'root' })
export class RequestService {
  private readonly settings = inject(SettingsService);

  readonly labelCache = signal<ReadonlyMap<string, string>>(
    new Map(WIKIDATA_SEED),
  );

  getLabel(uri: string): string | undefined {
    return this.labelCache().get(uri);
  }

  setLabel(uri: string, label: string): void {
    this.labelCache.update(cache => {
      const next = new Map(cache);
      next.set(uri, label);
      return next;
    });
  }

  async execQuery<T = SparqlJsonResult>(
    query: string,
    opts?: { signal?: AbortSignal },
  ): Promise<T> {
    const endpointUrl = this.settings.app().endpoint.url;
    const params = new URLSearchParams({
      format: 'json',
      query: query,
    });
    const url = `${endpointUrl}?origin=*&${params.toString()}`;

    const response = await fetch(url, {
      method: 'POST',
      signal: opts?.signal,
    });

    if (!response.ok) {
      throw new Error(`SPARQL query failed: ${response.status} ${response.statusText}`);
    }

    const data = await response.json() as SparqlJsonResult;
    this.correlateLabels(data);
    return data as unknown as T;
  }

  private correlateLabels(result: SparqlJsonResult): void {
    if (!result.head?.vars || !result.results?.bindings) {
      return;
    }

    const variables: Record<string, string | false> = {};
    const sorted = [...result.head.vars].sort(
      (a, b) => b.length - a.length,
    );

    while (sorted.length > 0) {
      const cur = sorted.pop()!;
      const index = sorted.indexOf(cur + 'Label');
      if (index >= 0) {
        variables[cur] = cur + 'Label';
        sorted.splice(index, 1);
      } else {
        variables[cur] = false;
      }
    }

    for (const row of result.results.bindings) {
      for (const varName of Object.keys(variables)) {
        const labelName = variables[varName];
        if (labelName) {
          const binding = row[varName];
          const labelBinding = row[labelName];
          if (
            binding?.type === 'uri' &&
            labelBinding?.type === 'literal'
          ) {
            this.setLabel(binding.value, labelBinding.value);
          }
        }
      }
    }
  }
}
