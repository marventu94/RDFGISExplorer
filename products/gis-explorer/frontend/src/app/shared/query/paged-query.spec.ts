import { describe, expect, it } from 'vitest';
import { Parser } from 'sparqljs';
import type { QueryResult } from '@rdfgis/contracts';
import { entityScopedQuery, filterVariables, pagedQuery, scopedQuery } from './paged-query';
import { buildPagedQuery, wrapUserQuery } from '../export/export-query';

const query = `PREFIX ex: <http://example.org/>
SELECT DISTINCT ?listing ?price ?wkt ?date WHERE {
  ?listing ex:price ?price ; ex:geometry ?wkt ; ex:date ?date .
  OPTIONAL { ?listing ex:source ?source . }
}`;

describe('server-side GIS paging', () => {
  it('keeps the graph patterns and pages all projected rows in a stable order', () => {
    const first = pagedQuery(query, 1, 300);
    const second = pagedQuery(query, 2, 300);
    const parser = new Parser();
    const original = parser.parse(query) as { where: unknown[] };
    const firstAst = parser.parse(first) as { where: unknown[]; limit: number; offset?: number; order: unknown[] };
    const secondAst = parser.parse(second) as { where: unknown[]; limit: number; offset: number };
    expect(firstAst.where).toEqual(original.where);
    expect(firstAst.limit).toBe(300);
    expect(firstAst.offset ?? 0).toBe(0);
    expect(firstAst.order).toHaveLength(4);
    expect(secondAst.offset).toBe(300);
    expect(secondAst.limit).toBe(300);
  });

  it('respects the query LIMIT and OFFSET while retaining the existing sort', () => {
    const text = `${query} ORDER BY DESC(?price) LIMIT 450 OFFSET 10`;
    const page = new Parser().parse(pagedQuery(text, 2, 300)) as { limit: number; offset: number; order: unknown[] };
    expect(page.limit).toBe(150);
    expect(page.offset).toBe(310);
    expect(page.order).toHaveLength(5);
  });

  it('applies spatial and temporal filters to the original graph query before paging', () => {
    const result = {
      variables: ['listing', 'price', 'wkt', 'date'],
      bindings: [{
        wkt: { type: 'coordinate', value: { lng: -58.1, lat: -34.9 }, raw: 'POINT(-58.1 -34.9)' },
        date: { type: 'date', value: '2023-10-01T00:00:00Z', raw: '2023-10-01T00:00:00Z' },
      }],
      nodes: [], edges: [],
      meta: { durationMs: 0, truncated: false, limitApplied: 300, backend: 'test' },
    } as QueryResult;
    const fields = filterVariables(result);
    expect(fields).toEqual({ coordinates: ['wkt'], dates: ['date'] });
    const scoped = scopedQuery(query, [
      { id: 'area', kind: 'geo', label: 'Area', polygon: { type: 'Polygon', coordinates: [[[-59, -35], [-58, -35], [-58, -34], [-59, -34], [-59, -35]]] } },
      { id: 'time', kind: 'temporal', label: 'Time', from: '2023-10-01T00:00:00.000Z', to: '2023-11-30T23:59:59.999Z' },
    ], fields);
    const ast = new Parser().parse(scoped) as { where: unknown[] };
    expect(ast.where.length).toBeGreaterThan((new Parser().parse(query) as { where: unknown[] }).where.length);
    expect(scoped).toContain('POINT');
    expect(scoped).toContain('2023-11-30');
    expect(() => pagedQuery(scoped, 1, 300)).not.toThrow();
    const exportPage = buildPagedQuery(wrapUserQuery(scoped), 0, 300);
    expect(() => new Parser().parse(exportPage)).not.toThrow();
    expect(exportPage).toContain('2023-11-30');
  });

  it('rejects malformed temporal values instead of interpolating them into SPARQL', () => {
    expect(() => scopedQuery(query, [{ id: 'time', kind: 'temporal', label: 'Time', from: '2023-01-01" )', to: '2023-12-31' }], { coordinates: [], dates: ['date'] })).toThrow('fechas válidas');
  });

  it('restricts one projected resource while preserving the RDF patterns', () => {
    const scoped = entityScopedQuery(query, 'listing', 'http://example.org/listing/1');
    const ast = new Parser().parse(scoped) as { where: unknown[] };
    expect(ast.where).toHaveLength((new Parser().parse(query) as { where: unknown[] }).where.length + 1);
    expect(scoped).toContain('http://example.org/listing/1');
    expect(() => pagedQuery(scoped, 2, 300)).not.toThrow();
    expect(() => entityScopedQuery(query, 'listing', 'http://example.org/x> } UNION { ?s ?p ?o')).toThrow('URI válida');
    expect(() => entityScopedQuery(query, 'missing', 'http://example.org/listing/1')).toThrow('variable RDF');
  });
});
