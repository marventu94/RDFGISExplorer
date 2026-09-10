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

/**
 * Cómo se busca en este endpoint: Wikidata tiene su propia API, el resto usa
 * SPARQL. El frontend lo necesita para saber qué UI de búsqueda ofrecer.
 */
export interface EndpointSearchDescriptor {
  mode: 'sparql' | 'wikidata-api';
  endpoint?: string;
}

/**
 * Predicados que el panel de descripción agrupa por rol. Son propios de cada
 * vocabulario, asi que los aporta el adapter y no el servicio de config.
 */
export interface EndpointDescribeDescriptor {
  exclude: string[];
  objects: string[];
  datatype: string[];
  text: string[];
  image: string[];
  external: string[];
}

export interface EndpointSearchClass {
  uri: { type: 'uri'; value: string };
  label: { type: 'literal'; value: string; 'xml:lang': string };
}

/**
 * Lo que este backend sabe hacer y con qué vocabulario, para que
 * `GET /api/config` se lo cuente al frontend.
 *
 * Vive en el adapter por la misma razón que `searchEntities`: describir un
 * backend nuevo tiene que ser agregar una clase, no sumar otra rama a un `if`.
 */
export interface EndpointDescriptor {
  /** El endpoint entiende el servicio `wikibase:label`. */
  supportsWikibaseLabel: boolean;
  search: EndpointSearchDescriptor;
  describe: EndpointDescribeDescriptor;
  /** Clase preseleccionada en el buscador de entidades. */
  defaultSearchClass: EndpointSearchClass;
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
  /** Capacidades y vocabulario de este backend, para `GET /api/config`. */
  describeEndpoint(): EndpointDescriptor;
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
