// Contrato compartido: la fuente de verdad vive en packages/contracts.
export type {
  QueryResult,
  SummaryRequest,
  NumericSummary,
  TemporalSummary,
  CategoricalValue,
  CategoricalSummary,
  SummaryFailure,
  QuerySummary,
} from '@rdfgis/contracts';

// Tipo propio de esta app (request del editor SPARQL hacia el backend).
export interface SparqlRequest {
  sparql: string;
  limit?: number;
}
