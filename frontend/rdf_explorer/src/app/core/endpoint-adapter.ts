import type { EndpointType, AppSettings } from './settings.types';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';

// ========== Legacy EndpointAdapter (text search only) ==========

export interface EndpointAdapter {
  textSearchTriple(label: string, keyword: string, limit: number): string;
}

export class VirtuosoAdapter implements EndpointAdapter {
  textSearchTriple(label: string, keyword: string, _limit: number): string {
    return `      ?${label} bif:contains "'${keyword}'" .`;
  }
}

export class FusekiAdapter implements EndpointAdapter {
  textSearchTriple(label: string, keyword: string, limit: number): string {
    return `      ?uri text:query (rdfs:label "${keyword}" ${limit}) .`;
  }
}

export class GenericAdapter implements EndpointAdapter {
  textSearchTriple(label: string, keyword: string, _limit: number): string {
    return `      FILTER regex(?${label}, "${keyword}", "i")`;
  }
}

export function createEndpointAdapter(type: EndpointType): EndpointAdapter {
  switch (type) {
    case 'virtuoso':
      return new VirtuosoAdapter();
    case 'fuseki':
      return new FusekiAdapter();
    default:
      return new GenericAdapter();
  }
}

// ========== QueryResult types (mirror backend/src/shared/dto/query-result.dto.ts) ==========

export interface Coordinate {
  lat: number;
  lng: number;
}

export interface TemporalEvent {
  field: string;
  isoDate: string;
  numericValue?: number;
}

export type BindingValue =
  | { type: 'uri'; value: string }
  | { type: 'literal'; value: string; datatype?: string; lang?: string }
  | { type: 'bnode'; value: string }
  | { type: 'coordinate'; value: Coordinate; raw: string }
  | { type: 'date'; value: string; raw: string };

export interface ResultBinding {
  [variableName: string]: BindingValue;
}

export interface NormalizedNode {
  uri: string;
  label: string;
  type?: string;
  attributes: Record<string, BindingValue>;
  coordinate?: Coordinate;
  temporalEvents?: TemporalEvent[];
  flags?: {
    hasAnomaly?: boolean;
    hasPendingReview?: boolean;
    isConfirmedDuplicate?: boolean;
  };
}

export interface NormalizedEdge {
  id: string;
  source: string;
  target: string;
  predicate: string;
  predicateLabel?: string;
}

export interface QueryResult {
  variables: string[];
  bindings: ResultBinding[];
  nodes: NormalizedNode[];
  edges: NormalizedEdge[];
  meta: {
    durationMs: number;
    truncated: boolean;
    limitApplied: number;
    backend: string;
  };
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

// ========== New RdfBackendAdapter ==========

export interface ExecuteOpts {
  backend?: string;
  limit?: number;
  timeoutMs?: number;
  signal?: AbortSignal;
}

export interface RdfBackendAdapter {
  readonly id: string;
  textSearchTriple(label: string, keyword: string, limit: number): string;
  executeQuery(query: string, opts: ExecuteOpts): Promise<QueryResult>;
  getPredicates(): Promise<string[]>;
}

// ========== GisBackendAdapter ==========

export class GisBackendAdapter implements RdfBackendAdapter {
  readonly id = 'gis-backend';

  constructor(
    private readonly http: HttpClient,
    private readonly baseUrl: string = '',
  ) {}

  textSearchTriple(label: string, keyword: string, limit: number): string {
    return new GenericAdapter().textSearchTriple(label, keyword, limit);
  }

  async executeQuery(query: string, opts: ExecuteOpts = {}): Promise<QueryResult> {
    const body = { sparql: query, limit: opts.limit ?? 500 };
    const result = await firstValueFrom(
      this.http.post<QueryResult>(`${this.baseUrl}/api/query/execute`, body),
    );
    return result;
  }

  async getPredicates(): Promise<string[]> {
    const result = await firstValueFrom(
      this.http.get<{ predicates: string[] }>(`${this.baseUrl}/api/suggestions/predicates`),
    );
    return result.predicates;
  }
}

// ========== LegacyDirectAdapter ==========

export class LegacyDirectAdapter implements RdfBackendAdapter {
  readonly id = 'legacy-direct';

  constructor(private readonly endpointUrl: string) {}

  textSearchTriple(label: string, keyword: string, limit: number): string {
    return new GenericAdapter().textSearchTriple(label, keyword, limit);
  }

  async executeQuery(query: string, opts: ExecuteOpts = {}): Promise<QueryResult> {
    const params = new URLSearchParams({
      format: 'json',
      query,
    });
    const url = `${this.endpointUrl}?origin=*&${params.toString()}`;

    const response = await fetch(url, {
      method: 'POST',
      signal: opts.signal,
    });

    if (!response.ok) {
      throw new Error(`SPARQL query failed: ${response.status} ${response.statusText}`);
    }

    const raw = (await response.json()) as SparqlJsonResult;
    return this.toQueryResult(raw, opts);
  }

  async getPredicates(): Promise<string[]> {
    const query = 'SELECT DISTINCT ?p WHERE { ?s ?p ?o } LIMIT 1000';
    const result = await this.executeQuery(query);
    const predicates: string[] = [];
    for (const row of result.bindings) {
      const p = row['p'];
      if (p && p.type === 'uri') {
        predicates.push(p.value);
      }
    }
    return predicates;
  }

  private toQueryResult(raw: SparqlJsonResult, opts: ExecuteOpts = {}): QueryResult {
    const variables = raw.head?.vars ?? [];
    const bindings: ResultBinding[] = (raw.results?.bindings ?? []).map((row) => {
      const result: ResultBinding = {};
      for (const [key, cell] of Object.entries(row)) {
        result[key] = this.normalizeValue(cell);
      }
      return result;
    });

    return {
      variables,
      bindings,
      nodes: [],
      edges: [],
      meta: {
        durationMs: 0,
        truncated: false,
        limitApplied: opts.limit ?? 0,
        backend: 'wikidata',
      },
    };
  }

  private normalizeValue(raw: SparqlBinding): BindingValue {
    if (raw.type === 'uri') {
      return { type: 'uri', value: raw.value };
    }
    if (raw.type === 'bnode') {
      return { type: 'bnode', value: raw.value };
    }
    if (raw.type === 'literal') {
      return {
        type: 'literal',
        value: raw.value,
        ...(raw['xml:lang'] ? { lang: raw['xml:lang'] } : {}),
        ...(raw.datatype ? { datatype: raw.datatype } : {}),
      };
    }
    return { type: 'literal', value: raw.value };
  }
}

// ========== Factory ==========

export function createRdfBackendAdapter(
  settings: AppSettings,
  http: HttpClient,
): RdfBackendAdapter {
  if (settings.backendMode === 'direct') {
    return new LegacyDirectAdapter(settings.endpoint.url);
  }
  return new GisBackendAdapter(http, '');
}
