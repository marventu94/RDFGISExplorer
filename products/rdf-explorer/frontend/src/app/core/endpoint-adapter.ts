import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';

// ========== QueryResult: contrato compartido en packages/contracts ==========

import type { QueryResult } from '@rdfgis/contracts';
import { explorerApiBase } from '@rdfgis/platform-bridge';

export type {
  Coordinate,
  TemporalEvent,
  BindingValue,
  ResultBinding,
  NormalizedNode,
  NormalizedEdge,
  QueryResult,
} from '@rdfgis/contracts';

export interface ExecuteOpts {
  limit?: number;
  timeoutMs?: number;
  signal?: AbortSignal;
}

export interface RdfBackendAdapter {
  readonly id: string;
  textSearchTriple(label: string, keyword: string, limit: number): string;
  executeQuery(query: string, opts?: ExecuteOpts): Promise<QueryResult>;
  getPredicates(): Promise<string[]>;
}

// ========== Raw SPARQL JSON types ==========

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

export class GisBackendAdapter implements RdfBackendAdapter {
  readonly id = 'gis-backend';

  constructor(
    private readonly http: HttpClient,
    private readonly baseUrl?: string,
  ) {}

  private apiBase(): string {
    return this.baseUrl === undefined ? explorerApiBase('rdf') : `${this.baseUrl}/api`;
  }

  textSearchTriple(label: string, keyword: string, _limit: number): string {
    // Escape propio (defensa en profundidad): no depender de que el caller
    // pre-escape el keyword antes de interpolarlo en el literal SPARQL.
    const escaped = keyword.replace(/[\\"']/g, '\\$&');
    return `      FILTER regex(?${label}, "${escaped}", "i")`;
  }

  async executeQuery(query: string, opts: ExecuteOpts = {}): Promise<QueryResult> {
    const body = { sparql: query, limit: opts.limit ?? 500 };
    try {
      const result = await firstValueFrom(
        this.http.post<QueryResult>(`${this.apiBase()}/query/execute`, body),
      );
      return result;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[GisBackendAdapter] Query failed:', msg);
      console.error('[GisBackendAdapter] SPARQL:\n', query);
      throw err;
    }
  }

  async getPredicates(): Promise<string[]> {
    const result = await firstValueFrom(
      this.http.get<{ predicates: string[] }>(`${this.apiBase()}/suggestions/predicates`),
    );
    return result.predicates;
  }
}

export function createRdfBackendAdapter(
  http: HttpClient,
  baseUrl?: string,
): RdfBackendAdapter {
  return new GisBackendAdapter(http, baseUrl);
}
