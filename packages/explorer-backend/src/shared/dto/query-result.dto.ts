// Contrato compartido: la fuente de verdad vive en packages/contracts.
// Re-export type-only: no emite JS ni agrega dependencia de runtime.
export type {
  Coordinate,
  TemporalEvent,
  BindingValue,
  ResultBinding,
  NormalizedNode,
  NormalizedEdge,
  QueryResult,
} from '@rdfgis/contracts';
