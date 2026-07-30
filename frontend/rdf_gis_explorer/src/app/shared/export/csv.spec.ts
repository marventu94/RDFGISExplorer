import {
  bindingToCsvText,
  buildCsv,
  buildProvenanceHeader,
  escapeCsvField,
} from './csv';
import type { BindingValue, ResultBinding } from '@shared/models';

describe('escapeCsvField', () => {
  it('leaves plain text untouched', () => {
    expect(escapeCsvField('hola')).toBe('hola');
  });

  it('quotes fields with commas, quotes and newlines', () => {
    expect(escapeCsvField('a,b')).toBe('"a,b"');
    expect(escapeCsvField('dijo "hola"')).toBe('"dijo ""hola"""');
    expect(escapeCsvField('linea1\nlinea2')).toBe('"linea1\nlinea2"');
  });
});

describe('bindingToCsvText', () => {
  it('keeps full URIs', () => {
    const v: BindingValue = { type: 'uri', value: 'http://www.wikidata.org/entity/Q1486' };
    expect(bindingToCsvText(v, 1)).toBe('http://www.wikidata.org/entity/Q1486');
  });

  it('keeps literals plain', () => {
    const v: BindingValue = {
      type: 'literal',
      value: '123.4',
      datatype: 'http://www.w3.org/2001/XMLSchema#decimal',
    };
    expect(bindingToCsvText(v, 1)).toBe('123.4');
  });

  it('keeps dates as ISO', () => {
    const v: BindingValue = {
      type: 'date',
      value: '2024-01-15T00:00:00Z',
      raw: '2024-01-15T00:00:00Z',
    };
    expect(bindingToCsvText(v, 1)).toBe('2024-01-15T00:00:00Z');
  });

  it('keeps coordinates as raw WKT', () => {
    const v: BindingValue = {
      type: 'coordinate',
      value: { lat: -34.9, lng: -57.9 },
      raw: 'Point(-57.9 -34.9)',
    };
    expect(bindingToCsvText(v, 1)).toBe('Point(-57.9 -34.9)');
  });

  it('renders bnodes as opaque per-row values', () => {
    const v: BindingValue = { type: 'bnode', value: 'abc123' };
    expect(bindingToCsvText(v, 7)).toBe('_:b7');
    expect(bindingToCsvText(v, 8)).not.toBe(bindingToCsvText(v, 7));
  });

  it('renders missing bindings as empty', () => {
    expect(bindingToCsvText(undefined, 1)).toBe('');
  });
});

describe('buildProvenanceHeader', () => {
  const base = {
    backend: 'wikidata',
    query: 'SELECT ?x WHERE {\n  ?s ?p ?x\n}',
    exportedAt: '2026-07-30T10:00:00.000Z',
    rowCount: 1234,
  };

  it('includes backend, timestamp, row count and the query as comment lines', () => {
    const header = buildProvenanceHeader({ ...base, partial: false });
    const lines = header.split('\n');
    expect(lines.every((l) => l.startsWith('#'))).toBe(true);
    expect(header).toContain('# backend: wikidata');
    expect(header).toContain('# exportado: 2026-07-30T10:00:00.000Z');
    expect(header).toContain('# filas: 1234');
    expect(header).toContain('#   SELECT ?x WHERE {');
    expect(header).not.toContain('PARCIAL');
  });

  it('marks partial exports explicitly', () => {
    const header = buildProvenanceHeader({ ...base, partial: true });
    expect(header).toContain('# filas: 1234 (PARCIAL: se alcanzó el tope de exportación)');
  });
});

describe('buildCsv', () => {
  it('emits provenance, header row and one line per result row', () => {
    const rows: ResultBinding[] = [
      { city: { type: 'uri', value: 'http://x/Q1' }, label: { type: 'literal', value: 'La Plata' } },
      { city: { type: 'uri', value: 'http://x/Q2' } }, // fila sin label
    ];
    const csv = buildCsv(['city', 'label'], rows, {
      backend: 'graphdb',
      query: 'SELECT ?city ?label WHERE { ?city ?p ?label }',
      exportedAt: '2026-07-30T10:00:00.000Z',
      rowCount: 2,
      partial: false,
    });

    const lines = csv.split('\n');
    expect(lines[0]).toBe('# Export del resultado completo de la query — RDF GIS Explorer');
    const headerIdx = lines.indexOf('city,label');
    expect(headerIdx).toBeGreaterThan(0);
    expect(lines[headerIdx + 1]).toBe('http://x/Q1,La Plata');
    expect(lines[headerIdx + 2]).toBe('http://x/Q2,');
    expect(csv.endsWith('\n')).toBe(true);
  });
});
