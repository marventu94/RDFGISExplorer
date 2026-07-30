// Contrato compartido: la fuente de verdad vive en packages/contracts.
// Re-export type-only: no emite JS ni agrega dependencia de runtime.
export type {
  SummaryRequest,
  NumericSummary,
  TemporalSummary,
  CategoricalValue,
  CategoricalSummary,
  SummaryFailure,
  QuerySummary,
} from '@rdfgis/contracts';
