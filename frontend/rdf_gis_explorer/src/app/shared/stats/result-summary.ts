import type {
  BindingValue,
  QueryResult,
  QuerySummary,
} from '@shared/models';

/**
 * Resumen agregado del resultado de una query: conteos y rangos por variable,
 * computados sobre el RESULTADO COMPLETO de la query — nunca sobre el lote
 * visible ni sobre el grafo entero.
 *
 * Dos caminos:
 * - `classifyVariables` + `computeLocalSummary`: cuando el resultado no está
 *   truncado (`meta.truncated === false`) todas las filas ya están en el
 *   cliente y el resumen se computa localmente, sin pegarle al backend.
 * - Cuando está truncado, el cliente solo tiene una muestra arbitraria: la
 *   clasificación se hace igual sobre esa muestra (heurística, domain-agnostic)
 *   y las vars clasificadas se mandan a POST /api/query/summary, que agrega en
 *   el endpoint sobre el resultado completo.
 *
 * La clasificación es heurística y no asume dominio: numérica si ≥90% de los
 * valores no nulos son literales numéricos; temporal si el tipo normalizado es
 * `date`; categórica si tiene pocos valores distintos (uri o literal corto).
 */

/** Caps para no generar una tormenta de queries de agregación. */
export const MAX_NUMERIC_VARS = 3;
export const MAX_TEMPORAL_VARS = 2;
export const MAX_CATEGORICAL_VARS = 3;
/** Tope de valores distintos (en la muestra) para considerar una var categórica. */
export const MAX_CATEGORICAL_DISTINCT = 20;
/** Tope de valores en el top categórico (mismo límite que el backend). */
export const TOP_CATEGORICAL_VALUES = 12;
/** Literales más largos que esto no son categorías legibles. */
const MAX_CATEGORICAL_TEXT_LENGTH = 80;
/** Proporción mínima de valores no nulos numéricos para clasificar como numérica. */
const NUMERIC_RATIO_THRESHOLD = 0.9;

const XSD = 'http://www.w3.org/2001/XMLSchema#';
const NUMERIC_DATATYPES = new Set(
  [
    'integer',
    'int',
    'long',
    'short',
    'byte',
    'nonNegativeInteger',
    'nonPositiveInteger',
    'positiveInteger',
    'negativeInteger',
    'unsignedInt',
    'unsignedLong',
    'unsignedShort',
    'unsignedByte',
    'decimal',
    'float',
    'double',
  ].map((t) => XSD + t),
);

const NUMERIC_TEXT = /^[+-]?(\d+(\.\d+)?|\.\d+)([eE][+-]?\d+)?$/;

export interface VariableClassification {
  numeric: string[];
  temporal: string[];
  categorical: string[];
}

function isNumericValue(value: BindingValue): boolean {
  if (value.type !== 'literal') return false;
  if (value.datatype) return NUMERIC_DATATYPES.has(value.datatype);
  // Literal sin datatype: numérico solo si el texto parsea completo como número.
  return NUMERIC_TEXT.test(value.value.trim());
}

function isTemporalValue(value: BindingValue): boolean {
  return value.type === 'date';
}

function isCategoricalValue(value: BindingValue): boolean {
  if (value.type === 'uri') return true;
  if (value.type === 'literal') {
    return value.value.length <= MAX_CATEGORICAL_TEXT_LENGTH;
  }
  return false;
}

function categoricalKey(value: BindingValue): string {
  return value.type === 'coordinate' ? value.raw : value.value;
}

/** Valor numérico de un binding, o null si no es un literal numérico. */
export function numericValue(value: BindingValue | undefined): number | null {
  if (!value || !isNumericValue(value)) return null;
  const n = Number(value.type === 'literal' ? value.value : NaN);
  return Number.isFinite(n) ? n : null;
}

/**
 * Clasifica las variables del resultado en numéricas / temporales /
 * categóricas mirando los bindings tipados ya recibidos. Una variable puede
 * no clasificar en ninguna (p.ej. texto libre largo o datos muy sucios).
 */
export function classifyVariables(result: QueryResult): VariableClassification {
  const numeric: string[] = [];
  const temporal: string[] = [];
  const categorical: string[] = [];

  for (const variable of result.variables) {
    const values = result.bindings
      .map((row) => row[variable])
      .filter((v): v is BindingValue => v !== undefined && v !== null);
    if (values.length === 0) continue;

    const numericCount = values.filter(isNumericValue).length;
    if (
      numericCount / values.length >= NUMERIC_RATIO_THRESHOLD &&
      numeric.length < MAX_NUMERIC_VARS
    ) {
      numeric.push(variable);
      continue;
    }

    if (values.every(isTemporalValue) && temporal.length < MAX_TEMPORAL_VARS) {
      temporal.push(variable);
      continue;
    }

    if (
      values.every(isCategoricalValue) &&
      categorical.length < MAX_CATEGORICAL_VARS
    ) {
      const distinct = new Set(values.map(categoricalKey));
      if (distinct.size <= MAX_CATEGORICAL_DISTINCT) {
        categorical.push(variable);
      }
    }
  }

  return { numeric, temporal, categorical };
}

/**
 * Resumen computado en el cliente sobre TODAS las filas del resultado. Solo
 * es válido cuando el resultado no está truncado (si lo está, las filas en
 * cliente son una muestra arbitraria del límite aplicado por el backend).
 */
export function computeLocalSummary(
  result: QueryResult,
  classification: VariableClassification,
): QuerySummary {
  const summary: QuerySummary = {
    totalRows: result.bindings.length,
    numeric: [],
    temporal: [],
    categorical: [],
    failed: { total: false, numeric: [], temporal: [], categorical: [] },
    meta: { durationMs: 0, backend: result.meta.backend },
  };

  for (const variable of classification.numeric) {
    const nums = result.bindings
      .map((row) => numericValue(row[variable]))
      .filter((n): n is number => n !== null);
    if (nums.length === 0) continue;
    let min = nums[0];
    let max = nums[0];
    let sum = 0;
    for (const n of nums) {
      if (n < min) min = n;
      if (n > max) max = n;
      sum += n;
    }
    summary.numeric.push({
      variable,
      count: nums.length,
      min,
      max,
      avg: sum / nums.length,
    });
  }

  for (const variable of classification.temporal) {
    // Las fechas ISO ordenan lexicográficamente igual que cronológicamente.
    const dates = result.bindings
      .map((row) => row[variable])
      .filter((v): v is BindingValue => !!v && v.type === 'date')
      .map((v) => (v.type === 'date' ? v.value : ''))
      .filter((s) => s.length > 0)
      .sort();
    if (dates.length === 0) continue;
    summary.temporal.push({
      variable,
      min: dates[0],
      max: dates[dates.length - 1],
    });
  }

  for (const variable of classification.categorical) {
    const counts = new Map<string, number>();
    for (const row of result.bindings) {
      const value = row[variable];
      if (!value || !isCategoricalValue(value)) continue;
      const key = categoricalKey(value);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    const values = [...counts.entries()]
      .map(([value, count]) => ({ value, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, TOP_CATEGORICAL_VALUES);
    summary.categorical.push({ variable, values });
  }

  return summary;
}
