import { Generator, Parser } from 'sparqljs';
import type { Polygon } from 'geojson';
import type { Filter, QueryResult } from '@shared/models';
import { projectedVariables } from '../export/export-query';

type SelectAst = {
  type: string;
  queryType?: string;
  where?: unknown[];
  order?: unknown[];
  limit?: number;
  offset?: number;
  prefixes?: Record<string, string>;
  base?: string;
  from?: unknown;
};

const parser = new Parser();
const generator = new Generator();
const XSD_DOUBLE = '<http://www.w3.org/2001/XMLSchema#double>';
const SAFE_VARIABLE = /^[A-Za-z_][A-Za-z0-9_]*$/;

function select(query: string): SelectAst {
  const ast = parser.parse(query) as unknown as SelectAst;
  if (ast.type !== 'query' || ast.queryType !== 'SELECT') {
    throw new Error('La paginación requiere una consulta SELECT.');
  }
  return ast;
}

/** Discover the projected fields that the GIS actually recognizes as space/time. */
export function filterVariables(result: QueryResult): { coordinates: string[]; dates: string[] } {
  const coordinates: string[] = [];
  const dates: string[] = [];
  for (const variable of result.variables) {
    if (!SAFE_VARIABLE.test(variable)) continue;
    const values = result.bindings.map((row) => row[variable]).filter(Boolean);
    if (values.some((value) => value.type === 'coordinate')) coordinates.push(variable);
    if (values.some((value) => value.type === 'date')) dates.push(variable);
  }
  return { coordinates, dates };
}

function pointPart(variable: string, group: 1 | 2): string {
  // Same POINT WKT extraction used by MCP scope_query; optional CRS is allowed.
  return `${XSD_DOUBLE}(REPLACE(STR(?${variable}), "^.*POINT\\\\s*\\\\(\\\\s*([-+0-9.eE]+)\\\\s+([-+0-9.eE]+).*$", "$${group}", "i"))`;
}

function number(value: number): string {
  if (!Number.isFinite(value)) throw new Error('El polígono contiene coordenadas inválidas.');
  return String(value);
}

function ringExpression(ring: number[][], x: string, y: string): string {
  if (ring.length < 4) throw new Error('El polígono necesita al menos tres vértices.');
  if (ring.length > 101) throw new Error('El polígono es demasiado complejo; dibujá uno con hasta 100 lados.');
  const edges = ring.slice(0, -1).map((point, index) => [point, ring[index + 1]]);
  const crossings: string[] = [];
  const boundaries: string[] = [];
  for (const [[ax, ay], [bx, by]] of edges) {
    const [x1, y1, x2, y2] = [number(ax), number(ay), number(bx), number(by)];
    if (ay !== by) {
      crossings.push(`IF(((${y1} > ${y}) != (${y2} > ${y})), IF(${x} < (${x2} - ${x1}) * (${y} - ${y1}) / (${y2} - ${y1}) + ${x1}, 1, 0), 0)`);
    }
    boundaries.push(`(ABS((${y} - ${y1}) * (${x2} - ${x1}) - (${x} - ${x1}) * (${y2} - ${y1})) < 0.000000001 && ${x} >= ${number(Math.min(ax, bx))} && ${x} <= ${number(Math.max(ax, bx))} && ${y} >= ${number(Math.min(ay, by))} && ${y} <= ${number(Math.max(ay, by))})`);
  }
  const sum = crossings.length ? crossings.join(' + ') : '0';
  return `((${boundaries.join(' || ')}) || ((${sum}) - 2 * FLOOR((${sum}) / 2) = 1))`;
}

function polygonExpression(polygon: Polygon, variable: string): string {
  if (!polygon.coordinates.length) throw new Error('El polígono está vacío.');
  const x = pointPart(variable, 1);
  const y = pointPart(variable, 2);
  const [outer, ...holes] = polygon.coordinates;
  const inside = ringExpression(outer, x, y);
  return holes.reduce((expression, hole) => `${expression} && !${ringExpression(hole, x, y)}`, inside);
}

function filterExpressions(filters: readonly Filter[], fields: ReturnType<typeof filterVariables>): string[] {
  return filters.map((filter) => {
    if (filter.kind === 'geo') {
      if (!fields.coordinates.length) throw new Error('La consulta no proyecta una coordenada WKT para filtrar el área.');
      return fields.coordinates.map((variable) => `(BOUND(?${variable}) && ${polygonExpression(filter.polygon, variable)})`).join(' || ');
    }
    if (!fields.dates.length) throw new Error('La consulta no proyecta una fecha para filtrar el período.');
    if (!/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z?)?$/.test(filter.from) ||
        !/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z?)?$/.test(filter.to)) {
      throw new Error('El rango temporal no tiene fechas válidas.');
    }
    return fields.dates.map((variable) =>
      `(BOUND(?${variable}) && STR(?${variable}) >= "${filter.from}" && STR(?${variable}) <= "${filter.to}")`,
    ).join(' || ');
  });
}

/** Keep the user's topology and projection intact while adding view filters. */
export function scopedQuery(query: string, filters: readonly Filter[], fields: ReturnType<typeof filterVariables>): string {
  if (!filters.length) return query;
  const ast = select(query);
  for (const expression of filterExpressions(filters, fields)) {
    const pattern = select(`SELECT * WHERE { FILTER(${expression}) }`).where;
    ast.where = [...(ast.where ?? []), ...(pattern ?? [])];
  }
  return generator.stringify(ast as never);
}

/** Restrict the current result to one bound resource without changing its graph topology. */
export function entityScopedQuery(query: string, variable: string, uri: string): string {
  if (!SAFE_VARIABLE.test(variable) || !new RegExp(`\\?${variable}(?![A-Za-z0-9_])`).test(query)) {
    throw new Error('La entidad seleccionada no tiene una variable RDF para recuperar su estructura.');
  }
  if (!/^[A-Za-z][A-Za-z0-9+.-]*:[^<>"{}|^`\\\s]+$/.test(uri)) {
    throw new Error('La entidad seleccionada no tiene una URI válida para recuperar su estructura.');
  }
  const ast = select(query);
  const values = select(`SELECT * WHERE { VALUES ?${variable} { <${uri}> } }`).where;
  if (ast.limit !== undefined || ast.offset !== undefined) {
    // Select the entity AFTER the user's slice, never move LIMIT/OFFSET onto
    // the entity filter: that would silently retrieve a different result.
    const outer = select('SELECT * WHERE {}');
    outer.prefixes = ast.prefixes;
    outer.base = ast.base;
    outer.from = ast.from;
    delete ast.prefixes;
    delete ast.base;
    delete ast.from;
    outer.where = [{ type: 'group', patterns: [ast] }, ...(values ?? [])];
    return generator.stringify(outer as never);
  }
  ast.where = [...(ast.where ?? []), ...(values ?? [])];
  return generator.stringify(ast as never);
}

/** Stable server-side page. Original LIMIT/OFFSET remain the outer result boundary. */
export function pagedQuery(query: string, lot: number, size: number): string {
  if (!Number.isInteger(lot) || lot < 1 || !Number.isInteger(size) || size < 1) {
    throw new Error('Lote inválido.');
  }
  const ast = select(query);
  const start = (lot - 1) * size;
  const originalLimit = ast.limit;
  const remaining = originalLimit === undefined ? size : Math.min(size, originalLimit - start);
  if (remaining <= 0) throw new Error('El lote excede el LIMIT de la consulta.');
  const originalOffset = ast.offset ?? 0;
  const variables = projectedVariables(ast as never);
  if (variables.length) {
    const tieBreakers = select(`SELECT * WHERE { ?s ?p ?o } ORDER BY ${variables.map((name) => `?${name}`).join(' ')}`).order ?? [];
    ast.order = [...(ast.order ?? []), ...tieBreakers];
  }
  ast.offset = originalOffset + start;
  ast.limit = remaining;
  return generator.stringify(ast as never);
}
