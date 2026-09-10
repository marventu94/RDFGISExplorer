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

export interface EntitySearchResult {
  uri: string;
  label: string;
  description?: string;
}

export interface EntitySearchOptions {
  limit: number;
  /**
   * IRI de clase por la que filtrar. Ya viene validada por la capa HTTP: el
   * adapter la interpola en la query, asi que no acepta nada que no sea un IRI.
   */
  classUri?: string;
}

export interface SparqlEndpoint {
  execute(query: string, opts: ExecuteOptions): Promise<QueryResult>;
  getPredicates(): Promise<string[]>;
  /**
   * Busca entidades por texto. Cada backend resuelve esto a su manera (Wikidata
   * tiene su propia API de busqueda; un endpoint SPARQL generico usa una query
   * con `regex` sobre los labels), y por eso vive en el adapter y no en el
   * servicio: sumar un backend es agregar una clase, no editar un `if`.
   */
  searchEntities(
    keyword: string,
    opts: EntitySearchOptions,
  ): Promise<EntitySearchResult[]>;
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
