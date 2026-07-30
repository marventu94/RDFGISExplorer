// Contrato de POST /api/query/summary.
// Fuente de verdad única: backend y frontends re-exportan estos tipos.
//
// Semántica: los agregados se computan sobre el resultado COMPLETO de la query
// del usuario (la query envuelta como subquery), nunca sobre el lote visible
// ni sobre las filas traídas cuando el backend truncó. Los filtros de las
// vistas (geo/temporal/quick filter) no intervienen.

export interface SummaryRequest {
  /** Query SELECT del usuario, autocontenida (con sus PREFIX). */
  query: string;
  /** Variables a agregar con MIN/MAX/AVG/COUNT (literales numéricos). */
  numericVars?: string[];
  /** Variables a agregar con MIN/MAX (fechas). */
  temporalVars?: string[];
  /** Variables a agregar con top valores (GROUP BY + COUNT, máx 12). */
  categoricalVars?: string[];
  /** Timeout por query de agregación (ms). Default: SPARQL_TIMEOUT_MS. */
  timeoutMs?: number;
}

export interface NumericSummary {
  variable: string;
  /** Filas con valor no nulo para la variable. */
  count: number;
  min: number | null;
  max: number | null;
  avg: number | null;
}

export interface TemporalSummary {
  variable: string;
  /** Fechas extremas (string ISO tal como las devuelve el endpoint). */
  min: string | null;
  max: string | null;
}

export interface CategoricalValue {
  /** URI o literal, tal como viene en el binding. */
  value: string;
  count: number;
}

export interface CategoricalSummary {
  variable: string;
  /** Top valores por conteo (máx 12, orden descendente). */
  values: CategoricalValue[];
}

/**
 * Degradación elegante: cada sección que falló (timeout, feature no soportada
 * por el endpoint) se reporta acá y el endpoint responde 200 igual — nunca 500
 * por una sección.
 */
export interface SummaryFailure {
  /** Falló el COUNT(*) total (también implica numeric/temporal fallidos). */
  total: boolean;
  numeric: string[];
  temporal: string[];
  categorical: string[];
}

export interface QuerySummary {
  /** Filas totales del resultado completo; null si el COUNT falló. */
  totalRows: number | null;
  numeric: NumericSummary[];
  temporal: TemporalSummary[];
  categorical: CategoricalSummary[];
  failed: SummaryFailure;
  meta: {
    durationMs: number;
    backend: string;
  };
}
