import ExcelJS from 'exceljs';
import type { BindingValue, ResultBinding } from '@shared/models';

/**
 * Serialización XLSX del export completo del resultado. Pensado para análisis
 * en Excel: hoja "Resultado" con encabezado con formato, fila congelada,
 * autofiltro, ancho de columnas ajustado al contenido y celdas tipadas
 * (números y fechas como valores, no texto); hoja "Proveniencia" con backend,
 * timestamp, filas, marca PARCIAL si corresponde y la query.
 *
 * URIs completas (no abreviadas), fechas como valor Date con formato
 * `yyyy-mm-dd hh:mm:ss`, bnodes como valor opaco por fila (los labels de
 * bnode solo tienen significado dentro de un resultado).
 */

export const RESULT_SHEET_NAME = 'Resultado';
export const PROVENANCE_SHEET_NAME = 'Proveniencia';

export type XlsxCellValue = string | number | Date | null;

const NUMERIC_LITERAL = /^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/;
/** Literales con cero a la izquierda ('007') son identificadores, no números. */
const LEADING_ZERO = /^[+-]?0\d/;
const DATE_FORMAT = 'yyyy-mm-dd hh:mm:ss';
const MIN_COLUMN_WIDTH = 10;
const MAX_COLUMN_WIDTH = 60;

/**
 * Valor de celda para un binding; `rowIndex` es 1-based (para bnodes opacos).
 * Los literals numéricos se exportan como número y las fechas como Date, así
 * Excel puede operar con ellos; el resto va como texto plano.
 */
export function bindingToCellValue(
  value: BindingValue | undefined,
  rowIndex: number,
): XlsxCellValue {
  if (!value) return null;
  switch (value.type) {
    case 'uri':
      return value.value;
    case 'literal': {
      const text = value.value.trim();
      if (NUMERIC_LITERAL.test(text) && !LEADING_ZERO.test(text)) {
        return Number(text);
      }
      return value.value;
    }
    case 'date': {
      const ms = Date.parse(value.value);
      return Number.isNaN(ms) ? value.value : new Date(ms);
    }
    case 'coordinate':
      return value.raw;
    case 'bnode':
      return `_:b${rowIndex}`;
  }
}

export interface XlsxProvenance {
  /** Backend SPARQL configurado (QueryResult.meta.backend). */
  backend: string;
  /** Texto de la query del usuario. */
  query: string;
  /** Timestamp ISO del export. */
  exportedAt: string;
  rowCount: number;
  /** true si el export quedó cortado por el tope de exportación. */
  partial: boolean;
}

function columnWidth(header: string, cells: XlsxCellValue[]): number {
  let max = header.length;
  for (const cell of cells) {
    if (cell === null) continue;
    const length = String(cell).length;
    if (length > max) max = length;
  }
  return Math.min(MAX_COLUMN_WIDTH, Math.max(MIN_COLUMN_WIDTH, max + 2));
}

function buildResultSheet(
  workbook: ExcelJS.Workbook,
  variables: string[],
  rows: ResultBinding[],
): void {
  const sheet = workbook.addWorksheet(RESULT_SHEET_NAME);
  const cellRows = rows.map((row, i) =>
    variables.map((v) => bindingToCellValue(row[v], i + 1)),
  );

  sheet.columns = variables.map((v, col) => ({
    header: v,
    key: v,
    width: columnWidth(v, cellRows.map((cells) => cells[col])),
  }));
  for (const cells of cellRows) sheet.addRow(cells);

  // Fechas: formato legible en las celdas tipadas Date.
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    row.eachCell((cell) => {
      if (cell.value instanceof Date) cell.numFmt = DATE_FORMAT;
    });
  });

  const header = sheet.getRow(1);
  header.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  header.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF1F4E79' },
  };
  header.height = 20;

  sheet.views = [{ state: 'frozen', ySplit: 1 }];
  sheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: variables.length },
  };
}

function buildProvenanceSheet(
  workbook: ExcelJS.Workbook,
  p: XlsxProvenance,
): void {
  const sheet = workbook.addWorksheet(PROVENANCE_SHEET_NAME);
  sheet.getColumn(1).width = 110;

  sheet.addRow(['Export del resultado completo de la query — RDF GIS Explorer'])
    .font = { bold: true, size: 12 };
  sheet.addRow([]);
  sheet.addRow([`backend: ${p.backend}`]);
  sheet.addRow([`exportado: ${p.exportedAt}`]);
  sheet.addRow([
    p.partial
      ? `filas: ${p.rowCount} (PARCIAL: se alcanzó el tope de exportación)`
      : `filas: ${p.rowCount}`,
  ]);
  sheet.addRow([]);
  sheet.addRow(['query:']).font = { bold: true };
  for (const line of p.query.split('\n')) {
    sheet.addRow([line]).font = { name: 'Consolas', size: 10 };
  }
}

/** Genera el workbook del export y lo devuelve como Blob listo para descargar. */
export async function buildXlsx(
  variables: string[],
  rows: ResultBinding[],
  provenance: XlsxProvenance,
): Promise<Blob> {
  const workbook = new ExcelJS.Workbook();
  buildResultSheet(workbook, variables, rows);
  buildProvenanceSheet(workbook, provenance);
  const buffer = await workbook.xlsx.writeBuffer();
  return new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}
