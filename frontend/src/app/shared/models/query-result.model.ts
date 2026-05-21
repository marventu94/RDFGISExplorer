import { ResultBinding } from './binding.model';
import { NormalizedNode } from './node.model';
import { NormalizedEdge } from './edge.model';

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

export interface SparqlRequest {
  sparql: string;
  limit?: number;
}
