import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';

// ========== Legacy text-search adapters (Virtuoso / Fuseki / Generic) ==========

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

export function createEndpointAdapter(type: string): EndpointAdapter {
  switch (type) {
    case 'virtuoso':
      return new VirtuosoAdapter();
    case 'fuseki':
      return new FusekiAdapter();
    default:
      return new GenericAdapter();
  }
}

// ========== QueryResult (mirrors backend/src/shared/dto/query-result.dto.ts) ==========

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

export function createRdfBackendAdapter(
  http: HttpClient,
  baseUrl: string = '',
): RdfBackendAdapter {
  return new GisBackendAdapter(http, baseUrl);
}
