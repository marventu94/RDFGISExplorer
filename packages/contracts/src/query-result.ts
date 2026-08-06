// Contrato de POST /api/query/execute.
// Fuente de verdad única: backend y frontends re-exportan estos tipos.

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

/**
 * Origen de la clasificación de un nodo:
 * - `rdf-type`: la query afirma la clase con un patrón `?x a <Clase>`.
 * - `query-variable`: no hay afirmación de clase; se usa la variable SPARQL de origen.
 * - `property-signature`: reservado para inferencia por propiedades (fase futura).
 * - `unknown`: no se pudo clasificar.
 */
export type NodeClassificationSource =
  | 'rdf-type'
  | 'query-variable'
  | 'property-signature'
  | 'unknown';

export interface NormalizedNode {
  uri: string;
  label: string;
  /** Variable SPARQL que originó el nodo (primera fila que lo creó). No es una clase RDF. */
  queryVariable?: string;
  /**
   * URIs de clase RDF afirmadas en la query (patrones `?x a <Clase>`).
   * Vacío/ausente si no hay.
   */
  classes?: string[];
  /** Origen explícito de la clasificación del nodo. */
  classification?: {
    source: NodeClassificationSource;
    inferred: boolean;
  };
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
