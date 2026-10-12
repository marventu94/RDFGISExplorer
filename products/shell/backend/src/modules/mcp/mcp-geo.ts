import { Generator, Parser } from 'sparqljs';
import type { NormalizedNode, QueryResult, QuerySummary } from '@rdfgis/contracts';

/**
 * Lógica pura de las herramientas espaciales y temporales del MCP: perfil de
 * dónde y cuándo se concentran los datos, recorte de consultas por área y
 * período, y encuadre inicial de las vistas del tablero. No depende de
 * GeoSPARQL: el WKT se lee con funciones de SPARQL 1.1, así funciona en
 * cualquier endpoint (GraphDB sin el plugin, Wikidata).
 */

export interface LatLng {
  lat: number;
  lng: number;
}
export interface BBox {
  west: number;
  south: number;
  east: number;
  north: number;
}

const KM_PER_DEG_LAT = 110.574;
const KM_PER_DEG_LNG = 111.32;
const XSD_DOUBLE = '<http://www.w3.org/2001/XMLSchema#double>';
/** Celdas de la grilla de concentración, en grados. */
const CELL_SIZES = [0.0005, 0.001, 0.0025, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30];
const MAX_EXAMPLES = 3;
const MAX_OUTLIERS = 5;

export function distanceKm(a: LatLng, b: LatLng): number {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLng = (b.lng - a.lng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(h)));
}

function quantile(sorted: number[], q: number): number {
  if (!sorted.length) return NaN;
  const i = Math.min(sorted.length - 1, Math.max(0, Math.round(q * (sorted.length - 1))));
  return sorted[i];
}

function round(value: number, digits = 5): number {
  return Number(value.toFixed(digits));
}

function bboxOf(points: LatLng[]): BBox {
  return {
    west: round(Math.min(...points.map((p) => p.lng))),
    south: round(Math.min(...points.map((p) => p.lat))),
    east: round(Math.max(...points.map((p) => p.lng))),
    north: round(Math.max(...points.map((p) => p.lat))),
  };
}

/** Zoom de Leaflet que encuadra el recuadro en una vista del tablero (~700×420 px). */
export function zoomForBBox(bbox: BBox, width = 700, height = 420): number {
  const lngSpan = Math.max(bbox.east - bbox.west, 1e-6);
  const mercator = (lat: number) => Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360));
  const ySpan = Math.max(Math.abs(mercator(bbox.north) - mercator(bbox.south)), 1e-8);
  const zoom = Math.min(
    Math.log2((width * 360) / (256 * lngSpan)),
    Math.log2((height * 2 * Math.PI) / (256 * ySpan)),
  );
  return Math.max(2, Math.min(16, Math.floor(zoom)));
}

export function bboxCenter(bbox: BBox): LatLng {
  return { lat: round((bbox.south + bbox.north) / 2), lng: round((bbox.west + bbox.east) / 2) };
}

// ---------------------------------------------------------------- perfil

interface Entity {
  uri: string;
  label: string;
}
type Located = Entity & LatLng;

export interface SpaceProfile {
  entitiesWithCoordinate: number;
  bbox: BBox;
  /** Recuadro sin los puntos atípicos: es el que conviene encuadrar. */
  coreBbox: BBox;
  suggestedView: { center: [number, number]; zoom: number };
  cellSizeDegrees: number;
  hotspots: Array<{ center: LatLng; bbox: BBox; entities: number; share: number; examples: Entity[] }>;
  outliers: { count: number; examples: Array<Entity & LatLng & { reason: string }> };
}

export interface TimeProfile {
  fields: string[];
  entitiesWithDate: number;
  events: number;
  from: string;
  to: string;
  granularity: 'day' | 'month' | 'year' | 'decade';
  histogram: Array<{ period: string; events: number }>;
  peaks: Array<{ period: string; events: number }>;
  gaps: Array<{ from: string; to: string; periods: number }>;
}

export interface SpaceTimeProfile {
  rows: { retrieved: number; total: number | null; truncatedByBackend: boolean };
  space: SpaceProfile | null;
  time: (TimeProfile & { fullRange?: { from: string | null; to: string | null } }) | null;
  notes: string[];
}

/** Etiqueta legible: si el nodo solo tiene su nombre local, usa un atributo de etiqueta proyectado. */
function readableLabel(node: NormalizedNode): string {
  const local = node.uri.split(/[#/]/).pop();
  if (node.label && node.label !== local) return node.label;
  const attribute = Object.entries(node.attributes ?? {}).find(
    ([key, value]) => /label|name|title|nombre|titulo|título/i.test(key) && value.type === 'literal',
  );
  return attribute ? String(attribute[1].value).replace(/\s+/g, ' ').trim() : node.label;
}

function located(nodes: NormalizedNode[]): Located[] {
  return nodes
    .filter((n) => n.coordinate && Number.isFinite(n.coordinate.lat) && Number.isFinite(n.coordinate.lng))
    .map((n) => ({ uri: n.uri, label: readableLabel(n), lat: n.coordinate!.lat, lng: n.coordinate!.lng }));
}

export function profileSpace(nodes: NormalizedNode[]): SpaceProfile | null {
  const points = located(nodes);
  if (!points.length) return null;

  const median: LatLng = {
    lat: quantile(
      points.map((p) => p.lat).sort((a, b) => a - b),
      0.5,
    ),
    lng: quantile(
      points.map((p) => p.lng).sort((a, b) => a - b),
      0.5,
    ),
  };
  const distances = points.map((p) => distanceKm(p, median));
  // Mediana de las distancias: robusta aunque haya muchos atípicos (un percentil alto se contamina).
  const typical = quantile(
    [...distances].sort((a, b) => a - b),
    0.5,
  );
  const farKm = Math.max(100, 10 * typical);
  const outliers: SpaceProfile['outliers']['examples'] = [];
  const core: Located[] = [];
  points.forEach((p, i) => {
    const reason =
      Math.abs(p.lat) > 90 || Math.abs(p.lng) > 180
        ? 'fuera de rango'
        : Math.abs(p.lat) < 1e-6 && Math.abs(p.lng) < 1e-6
          ? 'punto (0,0): suele ser un valor faltante'
          : distances[i] > farKm && Math.abs(p.lat - p.lng) < 1e-9
            ? 'latitud y longitud iguales: probable error de carga'
            : distances[i] > farKm
              ? distanceKm({ lat: p.lng, lng: p.lat }, median) <= farKm
                ? 'lat/lon posiblemente invertidas'
                : `a ${Math.round(distances[i])} km del resto`
              : null;
    if (reason) outliers.push({ uri: p.uri, label: p.label, lat: p.lat, lng: p.lng, reason });
    else core.push(p);
  });
  const corePoints = core.length ? core : points;
  const coreBbox = bboxOf(corePoints);

  const span = Math.max(coreBbox.east - coreBbox.west, coreBbox.north - coreBbox.south);
  const cell = CELL_SIZES.find((size) => span / size <= 12) ?? CELL_SIZES[CELL_SIZES.length - 1];
  const cells = new Map<string, Located[]>();
  for (const p of corePoints) {
    const key = `${Math.floor(p.lat / cell)}:${Math.floor(p.lng / cell)}`;
    cells.set(key, [...(cells.get(key) ?? []), p]);
  }
  const hotspots = [...cells.entries()]
    .sort(([, a], [, b]) => b.length - a.length)
    .slice(0, 5)
    .map(([key, members]) => {
      const [row, col] = key.split(':').map(Number);
      const bbox = {
        west: round(col * cell),
        south: round(row * cell),
        east: round((col + 1) * cell),
        north: round((row + 1) * cell),
      };
      return {
        center: bboxCenter(bbox),
        bbox,
        entities: members.length,
        share: round(members.length / points.length, 3),
        examples: members.slice(0, MAX_EXAMPLES).map(({ uri, label }) => ({ uri, label })),
      };
    });

  const center = bboxCenter(coreBbox);
  return {
    entitiesWithCoordinate: points.length,
    bbox: bboxOf(points),
    coreBbox,
    suggestedView: { center: [center.lat, center.lng], zoom: zoomForBBox(coreBbox) },
    cellSizeDegrees: cell,
    hotspots,
    outliers: { count: outliers.length, examples: outliers.slice(0, MAX_OUTLIERS) },
  };
}

type Granularity = TimeProfile['granularity'];

function bucketOf(date: Date, g: Granularity): string {
  const y = date.getUTCFullYear();
  const pad = (n: number, w = 2) => String(n).padStart(w, '0');
  if (g === 'decade') return `${Math.floor(y / 10) * 10}s`;
  if (g === 'year') return pad(y, 4);
  if (g === 'month') return `${pad(y, 4)}-${pad(date.getUTCMonth() + 1)}`;
  return `${pad(y, 4)}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

function stepBucket(date: Date, g: Granularity): Date {
  const next = new Date(date);
  if (g === 'decade') next.setUTCFullYear(date.getUTCFullYear() + 10);
  else if (g === 'year') next.setUTCFullYear(date.getUTCFullYear() + 1);
  else if (g === 'month') next.setUTCMonth(date.getUTCMonth() + 1);
  else next.setUTCDate(date.getUTCDate() + 1);
  return next;
}

function startOfBucket(date: Date, g: Granularity): Date {
  const y = date.getUTCFullYear();
  if (g === 'decade') return new Date(Date.UTC(Math.floor(y / 10) * 10, 0, 1));
  if (g === 'year') return new Date(Date.UTC(y, 0, 1));
  if (g === 'month') return new Date(Date.UTC(y, date.getUTCMonth(), 1));
  return new Date(Date.UTC(y, date.getUTCMonth(), date.getUTCDate()));
}

export function profileTime(nodes: NormalizedNode[]): TimeProfile | null {
  const events: Date[] = [];
  const fields = new Set<string>();
  let entities = 0;
  for (const node of nodes) {
    let dated = false;
    for (const event of node.temporalEvents ?? []) {
      const date = new Date(event.isoDate);
      if (Number.isNaN(date.getTime())) continue;
      events.push(date);
      fields.add(event.field);
      dated = true;
    }
    if (dated) entities++;
  }
  if (!events.length) return null;
  events.sort((a, b) => a.getTime() - b.getTime());
  const first = events[0];
  const last = events[events.length - 1];
  const days = (last.getTime() - first.getTime()) / 86_400_000;
  const granularity: Granularity =
    days <= 60 ? 'day' : days <= 5 * 366 ? 'month' : days <= 60 * 366 ? 'year' : 'decade';

  const counts = new Map<string, number>();
  for (const date of events) {
    const key = bucketOf(date, granularity);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const histogram: TimeProfile['histogram'] = [];
  const gaps: TimeProfile['gaps'] = [];
  // Racha abierta de períodos vacíos: se cierra al aparecer un período con eventos.
  const run = { from: '', to: '', periods: 0 };
  for (
    let cursor = startOfBucket(first, granularity);
    cursor <= last;
    cursor = stepBucket(cursor, granularity)
  ) {
    const key = bucketOf(cursor, granularity);
    const n = counts.get(key) ?? 0;
    if (n) {
      histogram.push({ period: key, events: n });
      if (run.periods) gaps.push({ ...run });
      run.periods = 0;
    } else {
      if (!run.periods) run.from = key;
      run.to = key;
      run.periods++;
    }
  }
  return {
    fields: [...fields],
    entitiesWithDate: entities,
    events: events.length,
    from: first.toISOString(),
    to: last.toISOString(),
    granularity,
    histogram,
    peaks: [...histogram].sort((a, b) => b.events - a.events).slice(0, 3),
    gaps: gaps.sort((a, b) => b.periods - a.periods).slice(0, 3),
  };
}

export function profileSpaceTime(result: QueryResult, summary?: QuerySummary | null): SpaceTimeProfile {
  const truncated = result.meta.truncated;
  const notes: string[] = [];
  const space = profileSpace(result.nodes);
  const time = profileTime(result.nodes);
  if (truncated) {
    notes.push(
      `El backend truncó el resultado: el perfil cubre las ${result.bindings.length} filas recuperadas${summary?.totalRows ? ` de ${summary.totalRows}` : ''}. Para el panorama completo, recortá con scope_query o agregá con COUNT/GROUP BY.`,
    );
  }
  if (!space) notes.push('Ninguna entidad tiene coordenadas POINT: el mapa quedaría vacío.');
  if (!time) notes.push('Ninguna entidad tiene fechas: la línea de tiempo quedaría vacía.');
  if (space?.outliers.count) {
    notes.push(
      space.outliers.count === 1
        ? '1 entidad con coordenadas atípicas queda fuera del encuadre sugerido.'
        : `${space.outliers.count} entidades con coordenadas atípicas quedan fuera del encuadre sugerido.`,
    );
  }
  const fullRange = summary?.temporal.find((t) => t.min || t.max);
  return {
    rows: {
      retrieved: result.bindings.length,
      total: truncated ? (summary?.totalRows ?? null) : result.bindings.length,
      truncatedByBackend: truncated,
    },
    space,
    time: time && fullRange ? { ...time, fullRange: { from: fullRange.min, to: fullRange.max } } : time,
    notes,
  };
}

// ---------------------------------------------------------------- recorte

export interface ScopeOptions {
  wktVariable?: string;
  dateVariable?: string;
  area?: { bbox?: BBox; center?: LatLng; radiusKm?: number };
  period?: { from?: string; to?: string };
}

interface ParsedSelect {
  type: string;
  queryType?: string;
  variables?: Array<{ termType?: string; value?: string; variable?: { value: string } }>;
  limit?: number;
  offset?: number;
  order?: unknown[];
  prefixes?: Record<string, string>;
}

/** Variables proyectadas por la consulta, o `null` si es `SELECT *`. */
export function projectedVariables(sparql: string): string[] | null {
  const parsed = new Parser().parse(sparql) as ParsedSelect;
  const vars = parsed.variables ?? [];
  if (vars.some((v) => v.termType === 'Wildcard' || v.value === '*')) return null;
  return vars.map((v) => (v.termType === 'Variable' ? v.value! : v.variable!.value));
}

/** Longitud o latitud de un POINT WKT, con o sin prefijo de CRS y sin importar mayúsculas. */
function pointPart(variable: string, group: 1 | 2): string {
  return `${XSD_DOUBLE}(REPLACE(STR(?${variable}), "^.*POINT\\\\s*\\\\(\\\\s*([-+0-9.eE]+)\\\\s+([-+0-9.eE]+).*$", "$${group}", "i"))`;
}

function num(value: number): string {
  return Number.isFinite(value) ? String(round(value, 7)) : 'NaN';
}

function bboxFilter(lng: string, lat: string, b: BBox): string {
  const lngTest =
    b.west <= b.east
      ? `${lng} >= ${num(b.west)} && ${lng} <= ${num(b.east)}`
      : `(${lng} >= ${num(b.west)} || ${lng} <= ${num(b.east)})`; // cruza el antimeridiano
  return `${lngTest} && ${lat} >= ${num(b.south)} && ${lat} <= ${num(b.north)}`;
}

const DATE_PREFIX = /^(\d{4})(?:-(\d{2})(?:-(\d{2}))?)?$/;

/** Límite inferior inclusivo y superior exclusivo como `YYYY-MM-DD`, según la precisión indicada. */
export function periodBounds(period: { from?: string; to?: string }): {
  from?: string;
  toExclusive?: string;
} {
  const parse = (value: string, edge: 'from' | 'to') => {
    const m = DATE_PREFIX.exec(value.trim());
    if (!m) throw new Error(`Fecha inválida "${value}": usá YYYY, YYYY-MM o YYYY-MM-DD.`);
    const [y, mo, d] = [Number(m[1]), m[2] ? Number(m[2]) : undefined, m[3] ? Number(m[3]) : undefined];
    const date = new Date(Date.UTC(y, (mo ?? 1) - 1, d ?? 1));
    // Date.UTC desborda (mes 13 → enero siguiente): la fecha tiene que existir tal cual.
    if (date.getUTCMonth() !== (mo ?? 1) - 1 || date.getUTCDate() !== (d ?? 1)) {
      throw new Error(`Fecha inválida "${value}": ese día o mes no existe.`);
    }
    if (edge === 'to') {
      if (d !== undefined) date.setUTCDate(date.getUTCDate() + 1);
      else if (mo !== undefined) date.setUTCMonth(date.getUTCMonth() + 1);
      else date.setUTCFullYear(date.getUTCFullYear() + 1);
    }
    return date.toISOString().slice(0, 10);
  };
  const bounds = {
    ...(period.from ? { from: parse(period.from, 'from') } : {}),
    ...(period.to ? { toExclusive: parse(period.to, 'to') } : {}),
  };
  if (bounds.from && bounds.toExclusive && bounds.from >= bounds.toExclusive) {
    throw new Error('El período está vacío: "from" es posterior a "to".');
  }
  return bounds;
}

/** Variables auxiliares del recorte: no se proyectan cuando la consulta lista sus columnas. */
const SCOPE_LNG = '?__scope_lng';
const SCOPE_LAT = '?__scope_lat';

/**
 * Filtros SPARQL 1.1 del área (sobre el WKT) y del período (sobre la fecha).
 * Con `bind`, lon/lat se calculan una vez en variables auxiliares; sin él, la
 * expresión se repite (para `SELECT *`, donde una variable nueva sería una
 * columna más en el tablero).
 */
export function scopePatterns(options: ScopeOptions, bind: boolean): { binds: string[]; filters: string[] } {
  const binds: string[] = [];
  const filters: string[] = [];
  const { area, period } = options;
  if (area) {
    if (!options.wktVariable) throw new Error('Falta la variable con el WKT.');
    let lng = pointPart(options.wktVariable, 1);
    let lat = pointPart(options.wktVariable, 2);
    if (bind) {
      binds.push(`BIND(${lng} AS ${SCOPE_LNG})`, `BIND(${lat} AS ${SCOPE_LAT})`);
      [lng, lat] = [SCOPE_LNG, SCOPE_LAT];
    }
    if (area.bbox) {
      filters.push(bboxFilter(lng, lat, area.bbox));
    } else if (area.center && area.radiusKm) {
      const { lat: lat0, lng: lng0 } = area.center;
      const kmPerLng = KM_PER_DEG_LNG * Math.max(Math.cos((lat0 * Math.PI) / 180), 0.01);
      const dLat = area.radiusKm / KM_PER_DEG_LAT;
      const dLng = area.radiusKm / kmPerLng;
      const dx = `((${lng} - ${num(lng0)}) * ${num(kmPerLng)})`;
      const dy = `((${lat} - ${num(lat0)}) * ${num(KM_PER_DEG_LAT)})`;
      // Recuadro primero (barato) y después distancia equirectangular: SPARQL 1.1 no tiene trigonometría.
      filters.push(
        bboxFilter(lng, lat, {
          west: lng0 - dLng,
          east: lng0 + dLng,
          south: lat0 - dLat,
          north: lat0 + dLat,
        }),
        `${dx} * ${dx} + ${dy} * ${dy} <= ${num(area.radiusKm * area.radiusKm)}`,
      );
    } else {
      throw new Error('El área necesita bbox, o center y radiusKm.');
    }
  }
  if (period && (period.from || period.to)) {
    if (!options.dateVariable) throw new Error('Falta la variable con la fecha.');
    const { from, toExclusive } = periodBounds(period);
    const day = `SUBSTR(STR(?${options.dateVariable}), 1, 10)`;
    filters.push(
      [from && `${day} >= "${from}"`, toExclusive && `${day} < "${toExclusive}"`]
        .filter(Boolean)
        .join(' && '),
    );
  }
  return { binds, filters };
}

/**
 * Envuelve la consulta como subconsulta y le agrega los filtros de área y
 * período. Los PREFIX quedan afuera y la proyección exterior es la misma de
 * la consulta original, así el tablero no gana columnas.
 */
export function scopeQuery(sparql: string, options: ScopeOptions): { sparql: string; notes: string[] } {
  const parsed = new Parser().parse(sparql) as ParsedSelect;
  if (parsed.type !== 'query' || parsed.queryType !== 'SELECT') {
    throw new Error('Solo se aceptan consultas SELECT.');
  }
  const projected = projectedVariables(sparql);
  for (const variable of [options.area && options.wktVariable, options.period && options.dateVariable]) {
    if (!variable) continue;
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(variable)) throw new Error(`Variable inválida: ${variable}`);
    if (projected && !projected.includes(variable)) {
      throw new Error(`La consulta no proyecta ?${variable}: agregala al SELECT.`);
    }
  }
  const { binds, filters } = scopePatterns(options, projected !== null);
  if (!filters.length) throw new Error('Indicá un área, un período o ambos.');

  const text = new Generator().stringify(parsed as never);
  const start = text.search(/^SELECT\b/im);
  const prologue = text.slice(0, start);
  const body = text.slice(start).replace(/\n/g, '\n    ');
  const projection = projected ? projected.map((v) => `?${v}`).join(' ') : '*';
  const scoped = [
    `${prologue}SELECT ${projection} WHERE {`,
    `  {\n    ${body}\n  }`,
    ...binds.map((b) => `  ${b}`),
    ...filters.map((f) => `  FILTER(${f})`),
    '}',
  ].join('\n');
  new Parser().parse(scoped); // la consulta resultante tiene que ser válida

  const notes: string[] = [];
  if (parsed.limit !== undefined || parsed.offset !== undefined) {
    notes.push(
      'La consulta tiene LIMIT/OFFSET: el recorte se aplica después de cortar. Quitalos para recortar sobre todo el resultado.',
    );
  }
  if (parsed.order?.length) {
    notes.push('El ORDER BY queda dentro de la subconsulta: el endpoint puede no conservar ese orden.');
  }
  if (options.area) {
    notes.push(
      'Solo pasan geometrías POINT; la distancia es aproximada (equirectangular), precisa a escala urbana o regional.',
    );
  }
  if (options.period) {
    notes.push(
      'El período compara los primeros 10 caracteres de la fecha (YYYY-MM-DD) y excluye filas sin fecha; no aplica a años negativos.',
    );
  }
  return { sparql: scoped, notes };
}
