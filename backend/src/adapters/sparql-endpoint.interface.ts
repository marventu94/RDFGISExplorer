import { QueryResult } from '../shared/dto/query-result.dto';

export interface ExecuteOptions {
  timeoutMs: number;
  limit: number;
  signal?: AbortSignal;
}

export interface SparqlEndpoint {
  execute(query: string, opts: ExecuteOptions): Promise<QueryResult>;
  getPredicates(): Promise<string[]>;
  readonly backendName: 'wikidata' | 'millenniumdb';
}

export class TimeoutError extends Error {
  constructor(public timeoutMs: number) {
    super(`Query timed out after ${timeoutMs}ms`);
    this.name = 'TimeoutError';
  }
}

export class UpstreamError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = 'UpstreamError';
  }
}

export class NotImplementedError extends Error {
  constructor(feature: string) {
    super(`Not implemented: ${feature}`);
    this.name = 'NotImplementedError';
  }
}

export const SPARQL_ENDPOINT = Symbol('SPARQL_ENDPOINT');
