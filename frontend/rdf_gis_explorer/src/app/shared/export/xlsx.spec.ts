import ExcelJS from 'exceljs';
import {
  bindingToCellValue,
  buildXlsx,
  RESULT_SHEET_NAME,
  PROVENANCE_SHEET_NAME,
  type XlsxProvenance,
} from './xlsx';
import type { ResultBinding } from '@shared/models';

const PROVENANCE: XlsxProvenance = {
  backend: 'wikidata',
  query: 'SELECT ?item WHERE { ?item ?p ?o }',
  exportedAt: '2026-08-03T12:00:00.000Z',
  rowCount: 2,
  partial: false,
};

describe('bindingToCellValue', () => {
  it('uri va como texto completo', () => {
    expect(
      bindingToCellValue({ type: 'uri', value: 'http://www.wikidata.org/entity/Q1486' }, 1),
    ).toBe('http://www.wikidata.org/entity/Q1486');
  });

  it('literal numérico va como número', () => {
    expect(bindingToCellValue({ type: 'literal', value: '123.4' }, 1)).toBe(123.4);
  });

  it('literal con cero a la izquierda va como texto (es identificador)', () => {
    expect(bindingToCellValue({ type: 'literal', value: '007' }, 1)).toBe('007');
  });

  it('literal de texto va como texto', () => {
    expect(bindingToCellValue({ type: 'literal', value: 'casa' }, 1)).toBe('casa');
  });

  it('date va como Date', () => {
    const cell = bindingToCellValue(
      { type: 'date', value: '2024-01-15T00:00:00Z', raw: '2024-01-15T00:00:00Z' },
      1,
    );
    expect(cell).toBeInstanceOf(Date);
    expect((cell as Date).toISOString()).toBe('2024-01-15T00:00:00.000Z');
  });

  it('date inválida degrada a texto', () => {
    expect(bindingToCellValue({ type: 'date', value: 'no-fecha', raw: 'no-fecha' }, 1)).toBe(
      'no-fecha',
    );
  });

  it('coordinate va como WKT crudo', () => {
    const cell = bindingToCellValue(
      { type: 'coordinate', value: { lat: -34.9, lng: -57.9 }, raw: 'Point(-57.9 -34.9)' },
      1,
    );
    expect(cell).toBe('Point(-57.9 -34.9)');
  });

  it('bnode es opaco por fila', () => {
    expect(bindingToCellValue({ type: 'bnode', value: 'b0' }, 7)).toBe('_:b7');
    expect(bindingToCellValue({ type: 'bnode', value: 'b0' }, 8)).not.toBe(
      bindingToCellValue({ type: 'bnode', value: 'b0' }, 7),
    );
  });

  it('undefined va como celda vacía', () => {
    expect(bindingToCellValue(undefined, 1)).toBeNull();
  });
});

describe('buildXlsx', () => {
  const variables = ['item', 'precio', 'fecha'];
  const rows: ResultBinding[] = [
    {
      item: { type: 'uri', value: 'http://www.wikidata.org/entity/Q1486' },
      precio: { type: 'literal', value: '250000' },
      fecha: { type: 'date', value: '2024-01-15T00:00:00Z', raw: '2024-01-15T00:00:00Z' },
    },
    {
      item: { type: 'uri', value: 'http://www.wikidata.org/entity/Q100' },
      precio: { type: 'literal', value: 'texto' },
    },
  ];

  async function load(partial: boolean): Promise<ExcelJS.Workbook> {
    const blob = await buildXlsx(variables, rows, { ...PROVENANCE, partial });
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(await blob.arrayBuffer());
    return workbook;
  }

  it('genera hoja Resultado con encabezado y filas tipadas', async () => {
    const workbook = await load(false);
    const sheet = workbook.getWorksheet(RESULT_SHEET_NAME);
    expect(sheet).toBeDefined();

    expect(sheet!.getRow(1).values).toEqual([undefined, ...variables]);

    const first = sheet!.getRow(2);
    expect(first.getCell(1).value).toBe('http://www.wikidata.org/entity/Q1486');
    expect(first.getCell(2).value).toBe(250000);
    expect(first.getCell(3).value).toBeInstanceOf(Date);

    // Segunda fila: literal no numérico queda texto y la celda sin valor, vacía.
    expect(sheet!.getRow(3).getCell(2).value).toBe('texto');
    expect(sheet!.getRow(3).getCell(3).value).toBeNull();
  });

  it('la hoja Proveniencia incluye backend, filas y query', async () => {
    const workbook = await load(false);
    const sheet = workbook.getWorksheet(PROVENANCE_SHEET_NAME);
    const text = sheet!
      .getColumn(1)
      .values.map((v) => String(v))
      .join('\n');
    expect(text).toContain('backend: wikidata');
    expect(text).toContain('filas: 2');
    expect(text).not.toContain('PARCIAL');
    expect(text).toContain('SELECT ?item WHERE { ?item ?p ?o }');
  });

  it('marca PARCIAL cuando se alcanzó el tope', async () => {
    const workbook = await load(true);
    const sheet = workbook.getWorksheet(PROVENANCE_SHEET_NAME);
    const text = sheet!
      .getColumn(1)
      .values.map((v) => String(v))
      .join('\n');
    expect(text).toContain('PARCIAL');
  });
});
