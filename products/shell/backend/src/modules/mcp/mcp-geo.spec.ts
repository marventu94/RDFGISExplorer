import { Parser } from 'sparqljs';
import type { NormalizedNode, QueryResult } from '@rdfgis/contracts';
import {
  distanceKm,
  periodBounds,
  profileSpace,
  profileSpaceTime,
  profileTime,
  scopeQuery,
  zoomForBBox,
} from './mcp-geo';

function node(uri: string, extra: Partial<NormalizedNode> = {}): NormalizedNode {
  return { uri, label: uri.split(':').pop()!, attributes: {}, ...extra };
}
const at = (lat: number, lng: number) => ({ coordinate: { lat, lng } });
const on = (...dates: string[]) => ({ temporalEvents: dates.map((isoDate) => ({ field: 'date', isoDate })) });

function result(nodes: NormalizedNode[], truncated = false): QueryResult {
  return {
    variables: ['s'],
    bindings: nodes.map((n) => ({ s: { type: 'uri', value: n.uri } })),
    nodes,
    edges: [],
    meta: { durationMs: 1, truncated, limitApplied: 1000, backend: 'graphdb' },
  };
}

/** Evalúa en JS la distancia que filtra scope_query, para compararla con la real. */
function equirectangularKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const dx = (b.lng - a.lng) * 111.32 * Math.cos((a.lat * Math.PI) / 180);
  const dy = (b.lat - a.lat) * 110.574;
  return Math.sqrt(dx * dx + dy * dy);
}

describe('distance and zoom helpers', () => {
  it('measures great-circle distance and keeps the scope approximation close at city scale', () => {
    const rosario = { lat: -32.9468, lng: -60.6393 };
    const fisherton = { lat: -32.925, lng: -60.725 };
    expect(distanceKm(rosario, fisherton)).toBeCloseTo(8.31, 1);
    expect(Math.abs(equirectangularKm(fisherton, rosario) - distanceKm(rosario, fisherton))).toBeLessThan(
      0.05,
    );
  });

  it('zooms in for a neighbourhood and out for a continent', () => {
    expect(zoomForBBox({ west: -60.75, south: -32.94, east: -60.7, north: -32.9 })).toBeGreaterThanOrEqual(
      13,
    );
    expect(zoomForBBox({ west: -166, south: -9, east: 160, north: 61 })).toBe(2);
  });
});

describe('profileSpace', () => {
  const city = [
    node('urn:a', at(-32.9215, -60.7215)),
    node('urn:b', at(-32.9225, -60.7225)),
    node('urn:c', at(-32.93, -60.68)),
    node('urn:d', at(-32.95, -60.64)),
  ];

  it('frames the core data, leaving outliers out with an actionable reason', () => {
    const profile = profileSpace([
      ...city,
      node('urn:null', at(0, 0)),
      node('urn:same', at(-32.94, -32.94)),
      node('urn:swapped', at(-60.7, -32.93)),
      node('urn:none'),
    ])!;
    expect(profile.entitiesWithCoordinate).toBe(7);
    expect(profile.coreBbox).toEqual({ west: -60.7225, south: -32.95, east: -60.64, north: -32.9215 });
    expect(profile.suggestedView.zoom).toBeGreaterThanOrEqual(11);
    expect(profile.outliers.count).toBe(3);
    expect(Object.fromEntries(profile.outliers.examples.map((o) => [o.uri, o.reason]))).toEqual({
      'urn:null': 'punto (0,0): suele ser un valor faltante',
      'urn:same': 'latitud y longitud iguales: probable error de carga',
      'urn:swapped': 'lat/lon posiblemente invertidas',
    });
  });

  it('ranks hotspots on a grid sized to the data', () => {
    const profile = profileSpace(city)!;
    expect(profile.cellSizeDegrees).toBe(0.01);
    expect(profile.hotspots[0]).toMatchObject({ entities: 2, share: 0.5 });
    expect(profile.hotspots[0].examples.map((e) => e.uri)).toEqual(['urn:a', 'urn:b']);
  });

  it('labels examples with a projected label when the node only has its local name', () => {
    const profile = profileSpace([
      node('http://www.wikidata.org/entity/Q1', {
        label: 'Q1',
        ...at(50, 6),
        attributes: { label: { type: 'literal', value: '\n\t Batalla de  Kesternich\n', lang: 'es' } },
      }),
    ])!;
    expect(profile.hotspots[0].examples[0].label).toBe('Batalla de Kesternich');
  });

  it('returns null without coordinates', () => {
    expect(profileSpace([node('urn:x')])).toBeNull();
  });
});

describe('profileTime', () => {
  it('picks a granularity for the span, and reports peaks and gaps', () => {
    const profile = profileTime([
      node('urn:a', on('2023-01-05T00:00:00Z', '2023-01-20T00:00:00Z')),
      node('urn:b', on('2023-02-01T00:00:00Z')),
      node('urn:c', on('2023-06-10T00:00:00Z')),
      node('urn:d', on('not a date')),
    ])!;
    expect(profile).toMatchObject({
      granularity: 'month',
      entitiesWithDate: 3,
      events: 4,
      histogram: [
        { period: '2023-01', events: 2 },
        { period: '2023-02', events: 1 },
        { period: '2023-06', events: 1 },
      ],
      gaps: [{ from: '2023-03', to: '2023-05', periods: 3 }],
    });
    expect(profile.peaks[0]).toEqual({ period: '2023-01', events: 2 });
  });

  it('switches to years and decades for long spans', () => {
    expect(profileTime([node('urn:a', on('1939-09-01', '1945-05-08'))])!.granularity).toBe('year');
    expect(profileTime([node('urn:a', on('1800-01-01', '1990-01-01'))])!.granularity).toBe('decade');
  });
});

describe('profileSpaceTime', () => {
  it('uses the summary for the real total and the full temporal range when truncated', () => {
    const profile = profileSpaceTime(result([node('urn:a', { ...at(1, 2), ...on('2023-01-01') })], true), {
      totalRows: 3589,
      numeric: [],
      temporal: [{ variable: 'date', min: '2022-05-03', max: '2025-04-01' }],
      categorical: [],
      failed: { total: false, numeric: [], temporal: [], categorical: [] },
      meta: { durationMs: 1, backend: 'graphdb' },
    });
    expect(profile.rows).toEqual({ retrieved: 1, total: 3589, truncatedByBackend: true });
    expect(profile.time?.fullRange).toEqual({ from: '2022-05-03', to: '2025-04-01' });
    expect(profile.notes[0]).toContain('1 filas recuperadas de 3589');
  });

  it('says which views would stay empty', () => {
    const profile = profileSpaceTime(result([node('urn:a')]));
    expect(profile.space).toBeNull();
    expect(profile.time).toBeNull();
    expect(profile.notes.join(' ')).toContain('el mapa quedaría vacío');
    expect(profile.notes.join(' ')).toContain('la línea de tiempo quedaría vacía');
  });
});

describe('periodBounds', () => {
  it('turns inclusive dates of any precision into an exclusive upper bound', () => {
    expect(periodBounds({ from: '2024', to: '2024' })).toEqual({
      from: '2024-01-01',
      toExclusive: '2025-01-01',
    });
    expect(periodBounds({ from: '2024-02', to: '2024-02' })).toEqual({
      from: '2024-02-01',
      toExclusive: '2024-03-01',
    });
    expect(periodBounds({ to: '2024-12-31' })).toEqual({ toExclusive: '2025-01-01' });
  });

  it('rejects malformed or empty periods', () => {
    expect(() => periodBounds({ from: '2024/01' })).toThrow('Fecha inválida');
    expect(() => periodBounds({ from: '2024-13' })).toThrow('no existe');
    expect(() => periodBounds({ to: '2023-02-29' })).toThrow('no existe');
    expect(periodBounds({ to: '2024-02-29' })).toEqual({ toExclusive: '2024-03-01' });
    expect(() => periodBounds({ from: '2025', to: '2024' })).toThrow('vacío');
  });
});

describe('scopeQuery', () => {
  const query = `PREFIX geo: <http://www.opengis.net/ont/geosparql#>
SELECT DISTINCT ?s ?wkt ?date WHERE { ?s geo:asWKT ?wkt ; <urn:date> ?date }`;

  it('wraps the query, keeps its prefixes and projection, and computes lon/lat once', () => {
    const { sparql, notes } = scopeQuery(query, {
      wktVariable: 'wkt',
      dateVariable: 'date',
      area: { center: { lat: -32.925, lng: -60.725 }, radiusKm: 2 },
      period: { from: '2024', to: '2024' },
    });
    expect(sparql).toMatch(
      /^PREFIX geo: <http:\/\/www\.opengis\.net\/ont\/geosparql#>\nSELECT \?s \?wkt \?date WHERE \{/,
    );
    expect(sparql).toContain('SELECT DISTINCT ?s ?wkt ?date WHERE');
    expect(sparql.match(/REPLACE\(/g)).toHaveLength(2);
    expect(sparql).toContain('AS ?__scope_lng)');
    expect(sparql).toContain('<= 4)');
    expect(sparql).toContain(
      'SUBSTR(STR(?date), 1, 10) >= "2024-01-01" && SUBSTR(STR(?date), 1, 10) < "2025-01-01"',
    );
    const parsed = new Parser().parse(sparql) as { variables: Array<{ value: string }> };
    expect(parsed.variables.map((v) => v.value)).toEqual(['s', 'wkt', 'date']);
    expect(notes.join(' ')).toContain('aproximada');
  });

  it('repeats the expression for SELECT * so no helper column appears', () => {
    const { sparql } = scopeQuery('SELECT * WHERE { ?s <urn:wkt> ?w }', {
      wktVariable: 'w',
      area: { bbox: { west: -61, south: -33, east: -60, north: -32 } },
    });
    expect(sparql).toContain('SELECT * WHERE');
    expect(sparql).not.toContain('__scope');
    new Parser().parse(sparql);
  });

  it('handles a bbox across the antimeridian', () => {
    const { sparql } = scopeQuery(query, {
      wktVariable: 'wkt',
      area: { bbox: { west: 170, south: -50, east: -170, north: -30 } },
    });
    expect(sparql).toContain('(?__scope_lng >= 170 || ?__scope_lng <= -170)');
  });

  it('warns that LIMIT and ORDER BY apply before the scope', () => {
    const { notes } = scopeQuery(`${query} ORDER BY ?date LIMIT 10`, {
      dateVariable: 'date',
      period: { from: '2020' },
    });
    expect(notes.join(' ')).toContain('LIMIT/OFFSET');
    expect(notes.join(' ')).toContain('ORDER BY');
  });

  it('rejects variables the query does not project and requests without scope', () => {
    expect(() =>
      scopeQuery(query, { wktVariable: 'geom', area: { radiusKm: 1, center: { lat: 0, lng: 0 } } }),
    ).toThrow('no proyecta ?geom');
    expect(() => scopeQuery(query, {})).toThrow('Indicá un área');
  });
});

describe('scope WKT parsing', () => {
  /** El regex de scope_query, evaluado en JS sobre los formatos reales de los endpoints. */
  const pattern = /^.*POINT\s*\(\s*([-+0-9.eE]+)\s+([-+0-9.eE]+).*$/i;
  it.each([
    [
      'GraphDB con CRS',
      '<http://www.opengis.net/def/crs/EPSG/0/4326> POINT(-60.7519714 -32.921461)',
      -60.7519714,
      -32.921461,
    ],
    ['Wikidata', 'Point(6.3275 50.50194444)', 6.3275, 50.50194444],
    ['con espacios', 'POINT ( -58.4 -34.6 )', -58.4, -34.6],
  ])('reads lon/lat from %s', (_case, wkt, lng, lat) => {
    const m = pattern.exec(wkt)!;
    expect([Number(m[1]), Number(m[2])]).toEqual([lng, lat]);
  });

  it('matches the pattern embedded in the generated query', () => {
    const { sparql } = scopeQuery('SELECT ?w WHERE { ?s <urn:wkt> ?w }', {
      wktVariable: 'w',
      area: { bbox: { west: 0, south: 0, east: 1, north: 1 } },
    });
    expect(sparql).toContain(String.raw`"^.*POINT\\s*\\(\\s*([-+0-9.eE]+)\\s+([-+0-9.eE]+).*$", "$1", "i"`);
  });
});
