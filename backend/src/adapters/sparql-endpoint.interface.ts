import { QueryResult } from '../shared/dto/query-result.dto';

export interface ExecuteOptions {
  timeoutMs: number;
  limit: number;
  /**
   * Modo crudo (export/paginación): saltea la proyección de intermedios y la
   * construcción del grafo; devuelve solo `bindings` con todas las variables
   * (nodes/edges vacíos).
   */
  raw?: boolean;
  signal?: AbortSignal;
}

export interface SparqlEndpoint {
  execute(query: string, opts: ExecuteOptions): Promise<QueryResult>;
  getPredicates(): Promise<string[]>;
  /** Nombre del backend configurado (SPARQL_BACKEND): wikidata, graphdb, generic, millenniumdb, ... */
  readonly backendName: string;
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
