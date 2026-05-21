// Mirror of docs/02-data-contracts.md
// Keep in sync with frontend/src/app/shared/models/

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
    backend: 'wikidata' | 'millenniumdb';
  };
}
