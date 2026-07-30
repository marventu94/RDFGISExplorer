import type { BindingValue, ResultBinding } from '@shared/models';

/**
 * Serialización CSV del export completo del resultado. Pensado para análisis
 * en herramientas externas: URIs completas (no abreviadas), literals planos,
 * fechas ISO tal como las devuelve el endpoint, bnodes como valor opaco por
 * fila (los labels de bnode solo tienen significado dentro de un resultado).
 *
 * El archivo abre con un encabezado de proveniencia en líneas `#` (backend,
 * query, timestamp, filas, marca PARCIAL si corresponde).
 */

export function escapeCsvField(text: string): string {
  if (/[",\n\r]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

/** Valor de celda para un binding; `rowIndex` es 1-based (para bnodes opacos). */
export function bindingToCsvText(
  value: BindingValue | undefined,
  rowIndex: number,
): string {
  if (!value) return '';
  switch (value.type) {
    case 'uri':
      return value.value;
    case 'literal':
      return value.value;
    case 'date':
      return value.value;
    case 'coordinate':
      return value.raw;
    case 'bnode':
      return `_:b${rowIndex}`;
  }
}

export interface CsvProvenance {
  /** Backend SPARQL configurado (QueryResult.meta.backend). */
  backend: string;
  /** Texto de la query del usuario (cada línea va prefijada con `#`). */
  query: string;
  /** Timestamp ISO del export. */
  exportedAt: string;
  rowCount: number;
  /** true si el CSV quedó cortado por el tope de exportación. */
  partial: boolean;
}

export function buildProvenanceHeader(p: CsvProvenance): string {
  const lines = [
    '# Export del resultado completo de la query — RDF GIS Explorer',
    `# backend: ${p.backend}`,
    `# exportado: ${p.exportedAt}`,
    p.partial
      ? `# filas: ${p.rowCount} (PARCIAL: se alcanzó el tope de exportación)`
      : `# filas: ${p.rowCount}`,
    '# query:',
    ...p.query.split('\n').map((line) => `#   ${line}`),
  ];
  return lines.join('\n');
}

export function buildCsv(
  variables: string[],
  rows: ResultBinding[],
  provenance: CsvProvenance,
): string {
  const header = variables.map(escapeCsvField).join(',');
  const body = rows
    .map((row, i) =>
      variables
        .map((v) => escapeCsvField(bindingToCsvText(row[v], i + 1)))
        .join(','),
    )
    .join('\n');
  return `${buildProvenanceHeader(provenance)}\n${header}\n${body}${body ? '\n' : ''}`;
}
