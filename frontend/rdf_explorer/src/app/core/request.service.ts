import { Injectable, signal, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import type { QueryResult, BindingValue } from './endpoint-adapter';
import { createRdfBackendAdapter, type SparqlJsonResult, type SparqlBinding } from './endpoint-adapter';

export type { SparqlBinding, SparqlJsonResult } from './endpoint-adapter';

@Injectable({ providedIn: 'root' })
export class RequestService {
  private readonly http = inject(HttpClient);

  readonly labelCache = signal<ReadonlyMap<string, string>>(new Map());

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
    const adapter = createRdfBackendAdapter(this.http);
    const result = await adapter.executeQuery(query, { signal: opts?.signal });
    const data = toSparqlJsonResult(result);
    this.correlateLabels(data);
    return data as unknown as T;
  }

  async getPredicates(): Promise<string[]> {
    const adapter = createRdfBackendAdapter(this.http);
    return adapter.getPredicates();
  }

  async prefetchLabels(
    uris: string[],
    config: {
      labelUri: string;
      lang: string;
      supportsWikibaseLabel: boolean;
    },
    batchSize = 100,
  ): Promise<void> {
    const uniqueUris = [...new Set(uris.filter(u => u.trim().length > 0))];

    for (let i = 0; i < uniqueUris.length; i += batchSize) {
      const batch = uniqueUris.slice(i, i + batchSize);
      const query = config.supportsWikibaseLabel
        ? buildWikidataLabelQuery(batch, config.lang)
        : buildGenericLabelQuery(batch, config.labelUri, config.lang);

      try {
        await this.execQuery(query);
      } catch (err) {
        console.error('[RequestService] prefetchLabels failed for batch:', err);
      }
    }
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

function toSparqlJsonResult(result: QueryResult): SparqlJsonResult {
  return {
    head: { vars: result.variables },
    results: {
      bindings: result.bindings.map(row => {
        const binding: Record<string, SparqlBinding> = {};
        for (const [key, val] of Object.entries(row)) {
          binding[key] = toSparqlBinding(val);
        }
        return binding;
      }),
    },
  };
}

function toSparqlBinding(val: BindingValue): SparqlBinding {
  if (val.type === 'uri') {
    return { type: 'uri', value: val.value };
  }
  if (val.type === 'bnode') {
    return { type: 'bnode', value: val.value };
  }
  if (val.type === 'literal') {
    return {
      type: 'literal',
      value: val.value,
      ...(val.lang ? { 'xml:lang': val.lang } : {}),
      ...(val.datatype ? { datatype: val.datatype } : {}),
    };
  }
  const raw = (val as { raw?: string }).raw ?? String(val.value);
  return { type: 'literal', value: raw };
}

const WIKIBASE_PREFIX = 'PREFIX wikibase: <http://wikiba.se/ontology#>\nPREFIX bd: <http://www.bigdata.com/rdf#>\n';

function buildWikidataLabelQuery(uris: string[], lang: string): string {
  const values = uris.map(u => `<${u}>`).join(' ');
  return (
    `${WIKIBASE_PREFIX}` +
    `SELECT ?uri ?uriLabel WHERE {\n` +
    `  VALUES ?uri { ${values} }\n` +
    `  SERVICE wikibase:label { bd:serviceParam wikibase:language "${escapeSparqlString(lang)}". }\n` +
    `}`
  );
}

function buildGenericLabelQuery(uris: string[], labelUri: string, lang: string): string {
  const values = uris.map(u => `<${u}>`).join(' ');
  return (
    `SELECT ?uri ?uriLabel WHERE {\n` +
    `  VALUES ?uri { ${values} }\n` +
    `  OPTIONAL { ?uri <${labelUri}> ?uriLabel . FILTER(lang(?uriLabel) = "${escapeSparqlString(lang)}" || lang(?uriLabel) = "") }\n` +
    `}`
  );
}

function escapeSparqlString(value: string): string {
  return value.replace(/[\\"']/g, '\\$&');
}
