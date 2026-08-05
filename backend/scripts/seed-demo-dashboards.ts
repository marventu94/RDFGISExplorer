/**
 * Seed de tableros demo: 5 workspaces del RDF Explorer + sus 5 equivalentes GIS.
 *
 * Los grafos del Explorer se construyen con las clases reales del dominio
 * (frontend/rdf_explorer/src/app/graph/domain), siguiendo el patrón de
 * examples/canned-examples.ts: el payload serializado y la query generada son
 * exactamente los que produce la app. Cada tablero GIS lleva la MISMA query con
 * todas las variables proyectadas (Query.selectAll()), que es lo que obtiene un
 * usuario al exportar el grafo completo al GIS Explorer.
 *
 * Cada tema se valida en vivo contra Wikidata (volumen, cobertura de
 * coordenadas y fechas) salvo que se pase --no-validate.
 *
 * Uso (desde backend/):
 *   pnpm run seed:demo-dashboards                  # construye, valida y escribe data/<backend>.sqlite
 *   pnpm run seed:demo-dashboards -- --dry-run     # construye y valida, no escribe
 *   pnpm run seed:demo-dashboards -- --no-validate # escribe sin validar contra Wikidata
 */

import * as fs from 'fs';
import * as path from 'path';
import Database from 'better-sqlite3';
import { Parser as SparqlParser } from 'sparqljs';

import { PropertyGraph } from '../../frontend/rdf_explorer/src/app/graph/domain/graph';
import type { Node } from '../../frontend/rdf_explorer/src/app/graph/domain/node';
import type { Property } from '../../frontend/rdf_explorer/src/app/graph/domain/property';
import {
  serializeGraph,
  deserializeGraph,
  type ExplorerSerializedGraph,
} from '../../frontend/rdf_explorer/src/app/graph/domain/graph-serializer';
import { WikidataAdapter } from '../../frontend/rdf_explorer/src/app/graph/domain/endpoint/wikidata-adapter';

// ---------------------------------------------------------------------------
// Constantes
// ---------------------------------------------------------------------------

const WD = 'http://www.wikidata.org/entity/';
const WDT = 'http://www.wikidata.org/prop/direct/';

const ENDPOINT =
  process.env['SPARQL_ENDPOINT_URL'] ?? 'https://query.wikidata.org/sparql';
const USER_AGENT =
  'RDFGISExplorer-DemoSeed/1.0 (demo dashboard seed; local dev)';

/** defaultLimit que publica el backend → settings.limit del workspace Explorer. */
const EXPLORER_RESULT_LIMIT = 500;
/** maxLimit del backend: los demos deben quedar por debajo para no truncarse. */
const MAX_ROWS = 1900;

const MIGRATIONS_SQL = `
CREATE TABLE IF NOT EXISTS dashboards (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('gis','explorer')),
  name TEXT NOT NULL,
  payload TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_dashboards_updated ON dashboards(updated_at DESC);
`;

// ---------------------------------------------------------------------------
// Contexto del grafo: idéntico al que arma PropertyGraphService para wikidata
// ---------------------------------------------------------------------------

const PREFIXES_JSON = JSON.parse(
  fs.readFileSync(
    path.resolve(__dirname, '../config/prefixes.wikidata.json'),
    'utf8',
  ),
) as Record<string, string>;

function makeGraph(): PropertyGraph {
  return new PropertyGraph({
    labelUri: 'http://www.w3.org/2000/01/rdf-schema#label',
    lang: 'en',
    prefixes: Object.entries(PREFIXES_JSON).map(([prefix, uri]) => ({
      prefix,
      uri,
    })),
    endpointAdapter: new WikidataAdapter(),
  });
}

// ---------------------------------------------------------------------------
// Helpers de construcción (patrón canned-examples)
// ---------------------------------------------------------------------------

function constNode(
  graph: PropertyGraph,
  uri: string,
  x: number,
  y: number,
): Node {
  const n = graph.addNode();
  n.addUri(uri);
  n.mkConst();
  n.setPosition(x, y);
  return n;
}

function varNode(
  graph: PropertyGraph,
  alias: string,
  x: number,
  y: number,
): Node {
  const n = graph.addNode();
  n.variable.setAlias(alias, graph);
  n.setPosition(x, y);
  return n;
}

function constProp(node: Node, uri: string): Property {
  const p = node.newProp();
  p.addUri(uri);
  p.mkConst();
  return p;
}

function literalProp(
  node: Node,
  uri: string,
  alias: string,
  graph: PropertyGraph,
): Property {
  const p = constProp(node, uri);
  p.mkLiteral();
  p.getLiteral()?.setAlias(alias, graph);
  return p;
}

/** `?x wdt:P31 ?class . ?class wdt:P279* <qid>` — clase oculta (no se proyecta). */
function subclassOf(
  graph: PropertyGraph,
  subject: Node,
  classQid: string,
  classX: number,
  classY: number,
  qidX: number,
  qidY: number,
): void {
  const p31 = constProp(subject, WDT + 'P31');
  const klass = varNode(graph, 'class', classX, classY);
  klass.hide = true;
  graph.addEdge(p31, klass);
  const p279 = constProp(klass, WDT + 'P279');
  p279.star = true;
  const target = constNode(graph, WD + classQid, qidX, qidY);
  graph.addEdge(p279, target);
}

// ---------------------------------------------------------------------------
// Definición de temas
// ---------------------------------------------------------------------------

interface TopicBuild {
  seedAlias: string;
  coordAlias: string;
  dateAliases: string[];
  /** Aliases de literales: su `?xLabel` se elimina del SELECT de la query GIS. */
  literalAliases: string[];
}

interface FallbackExtent {
  center: [number, number];
  zoom: number;
  rangeStart: string;
  rangeEnd: string;
}

interface TopicDef {
  explorerName: string;
  gisName: string;
  panelName: string;
  build: (graph: PropertyGraph) => TopicBuild;
  minRows: number;
  minCoordCoverage: number;
  minDateCoverage: number;
  /** Layout del grafo GIS: para topologías estrella (muchas entidades → pocos
   *  hubs) `dagre` queda más legible que `cola`. */
  gisGraphLayout?: 'cola' | 'dagre' | 'circle' | 'grid';
  /** Extent usado si se corre con --no-validate. */
  fallback: FallbackExtent;
}

const TOPICS: TopicDef[] = [
  {
    explorerName: 'Batallas de la Segunda Guerra Mundial',
    gisName: 'Batallas de la Segunda Guerra Mundial (GIS)',
    panelName: 'Batallas WWII',
    minRows: 400,
    minCoordCoverage: 0.95,
    minDateCoverage: 0.9,
    gisGraphLayout: 'circle',
    fallback: {
      center: [42, 20],
      zoom: 2,
      rangeStart: '1938-06-01T00:00:00.000Z',
      rangeEnd: '1946-06-01T00:00:00.000Z',
    },
    build(graph) {
      const battle = varNode(graph, 'battle', 200, 250);
      const partOf = constProp(battle, WDT + 'P361');
      partOf.star = true;
      graph.addEdge(partOf, constNode(graph, WD + 'Q362', 520, 130));
      literalProp(battle, WDT + 'P625', 'coords', graph);
      const date = literalProp(battle, WDT + 'P585', 'date', graph);
      date.getLiteral()?.addFilter('datefrom', { date: '1939', granularity: 'year' }, graph);
      date.getLiteral()?.addFilter('dateto', { date: '1945', granularity: 'year' }, graph);
      // OPTIONAL: muchas batallas (navales/aéreas) no tienen país; da aristas
      // al grafo del GIS sin recortar el resultado.
      const countryProp = constProp(battle, WDT + 'P17');
      countryProp.optional = true;
      graph.addEdge(countryProp, varNode(graph, 'country', 520, 400));
      return {
        seedAlias: 'battle',
        coordAlias: 'coords',
        dateAliases: ['date'],
        literalAliases: ['coords', 'date'],
      };
    },
  },
  {
    explorerName: 'Terremotos de magnitud mayor a 6',
    gisName: 'Terremotos de magnitud mayor a 6 (GIS)',
    panelName: 'Terremotos M>6',
    minRows: 500,
    minCoordCoverage: 0.95,
    minDateCoverage: 0.85,
    fallback: {
      center: [10, 150],
      zoom: 2,
      rangeStart: '1960-01-01T00:00:00.000Z',
      rangeEnd: '2027-01-01T00:00:00.000Z',
    },
    build(graph) {
      const quake = varNode(graph, 'earthquake', 200, 250);
      subclassOf(graph, quake, 'Q7944', 520, 130, 840, 130);
      literalProp(quake, WDT + 'P625', 'coords', graph);
      const date = literalProp(quake, WDT + 'P585', 'date', graph);
      date.getLiteral()?.addFilter('datefrom', { date: '1900', granularity: 'year' }, graph);
      date.getLiteral()?.addFilter('dateto', { date: '2026', granularity: 'year' }, graph);
      const mag = literalProp(quake, WDT + 'P2528', 'magnitude', graph);
      mag.getLiteral()?.addFilter('geq', { number: 6 }, graph);
      return {
        seedAlias: 'earthquake',
        coordAlias: 'coords',
        dateAliases: ['date'],
        literalAliases: ['coords', 'date', 'magnitude'],
      };
    },
  },
  {
    explorerName: 'Premios Nobel',
    gisName: 'Premios Nobel (GIS)',
    panelName: 'Laureados Nobel',
    minRows: 450,
    minCoordCoverage: 0.9,
    minDateCoverage: 0.95,
    gisGraphLayout: 'circle',
    fallback: {
      center: [42, 5],
      zoom: 3,
      rangeStart: '1800-01-01T00:00:00.000Z',
      rangeEnd: '2020-01-01T00:00:00.000Z',
    },
    build(graph) {
      const laureate = varNode(graph, 'laureate', 200, 250);
      const awardProp = constProp(laureate, WDT + 'P166');
      const award = varNode(graph, 'award', 520, 110);
      graph.addEdge(awardProp, award);
      const awardClass = constProp(award, WDT + 'P31');
      graph.addEdge(awardClass, constNode(graph, WD + 'Q7191', 840, 110));
      literalProp(laureate, WDT + 'P569', 'birthdate', graph);
      const birthPlaceProp = constProp(laureate, WDT + 'P19');
      const birthPlace = varNode(graph, 'birthPlace', 520, 400);
      graph.addEdge(birthPlaceProp, birthPlace);
      literalProp(birthPlace, WDT + 'P625', 'coords', graph);
      return {
        seedAlias: 'laureate',
        coordAlias: 'coords',
        dateAliases: ['birthdate'],
        literalAliases: ['birthdate', 'coords'],
      };
    },
  },
  {
    explorerName: 'Vuelos espaciales tripulados',
    gisName: 'Vuelos espaciales tripulados (GIS)',
    panelName: 'Vuelos tripulados',
    minRows: 250,
    minCoordCoverage: 0.9,
    minDateCoverage: 0.9,
    gisGraphLayout: 'circle',
    fallback: {
      center: [35, -50],
      zoom: 2,
      rangeStart: '1958-01-01T00:00:00.000Z',
      rangeEnd: '2027-01-01T00:00:00.000Z',
    },
    build(graph) {
      const flight = varNode(graph, 'flight', 200, 250);
      subclassOf(graph, flight, 'Q752783', 520, 110, 840, 110);
      literalProp(flight, WDT + 'P619', 'launchDate', graph);
      const startProp = constProp(flight, WDT + 'P1427');
      const launchSite = varNode(graph, 'launchSite', 520, 400);
      graph.addEdge(startProp, launchSite);
      literalProp(launchSite, WDT + 'P625', 'coords', graph);
      return {
        seedAlias: 'flight',
        coordAlias: 'coords',
        dateAliases: ['launchDate'],
        literalAliases: ['launchDate', 'coords'],
      };
    },
  },
  {
    explorerName: 'Museos de Argentina',
    gisName: 'Museos de Argentina (GIS)',
    panelName: 'Museos AR',
    minRows: 450,
    minCoordCoverage: 0.9,
    minDateCoverage: 0.85,
    fallback: {
      center: [-35, -64],
      zoom: 4,
      rangeStart: '1750-01-01T00:00:00.000Z',
      rangeEnd: '2030-01-01T00:00:00.000Z',
    },
    build(graph) {
      const museum = varNode(graph, 'museum', 200, 250);
      subclassOf(graph, museum, 'Q33506', 520, 130, 840, 130);
      const country = constProp(museum, WDT + 'P17');
      graph.addEdge(country, constNode(graph, WD + 'Q414', 520, 400));
      literalProp(museum, WDT + 'P625', 'coords', graph);
      const inception = literalProp(museum, WDT + 'P571', 'inception', graph);
      inception.getLiteral()?.addFilter('dateto', { date: '2026', granularity: 'year' }, graph);
      return {
        seedAlias: 'museum',
        coordAlias: 'coords',
        dateAliases: ['inception'],
        literalAliases: ['coords', 'inception'],
      };
    },
  },
];

// ---------------------------------------------------------------------------
// Generación de queries (idéntica a WorkspacePersistenceService.snapshotActivePanel)
// ---------------------------------------------------------------------------

interface TopicArtifacts {
  def: TopicDef;
  built: TopicBuild;
  snapshot: ExplorerSerializedGraph;
  explorerQuery: string;
  variables: string[];
  gisQuery: string;
  constUris: string[];
}

function buildQueries(def: TopicDef): TopicArtifacts {
  const graph = makeGraph();
  const built = def.build(graph);

  const explorerQueries = graph.getQueriesForGraph().queries;
  if (explorerQueries.length !== 1) {
    throw new Error(
      `[${def.panelName}] se esperaba 1 componente conexa, hay ${explorerQueries.length}`,
    );
  }
  const explorerQuery = explorerQueries[0].toSparql();
  if (!explorerQuery) {
    throw new Error(`[${def.panelName}] la query del Explorer salió vacía`);
  }
  const variables = explorerQueries.flatMap((q) =>
    q.select.map((r) => String(r.variable)),
  );

  // Equivalente GIS: el mismo grafo con TODAS las variables proyectadas.
  const gisQueries = graph.getQueriesForGraph().queries;
  gisQueries[0].selectAll();
  let gisQuery = gisQueries[0].toSparql() ?? '';
  for (const alias of built.literalAliases) {
    // Las columnas ?<literal>Label quedan vacías (son literales): se eliminan.
    gisQuery = gisQuery.replaceAll(` ?${alias}Label`, '');
  }

  const snapshot = serializeGraph(graph);

  // Round-trip: el grafo serializado debe restaurarse y regenerar la MISMA query.
  const restored = makeGraph();
  deserializeGraph(restored, snapshot);
  const roundTrip = restored
    .getQueriesForGraph()
    .queries.map((q) => q.toSparql())
    .filter(Boolean)
    .join('\n');
  if (roundTrip !== explorerQuery) {
    throw new Error(
      `[${def.panelName}] round-trip distinto:\n--- original ---\n${explorerQuery}\n--- restaurada ---\n${roundTrip}`,
    );
  }

  // Validación de sintaxis con el mismo parser que usa el backend.
  const parser = new SparqlParser();
  parser.parse(explorerQuery);
  parser.parse(gisQuery);

  // URIs constantes (para prefetch de labels, igual que el Explorer).
  const constUris = new Set<string>();
  for (const el of snapshot.nodes) {
    const data = el.data as { isVar?: boolean; uris?: string[] };
    if (data.isVar) continue;
    for (const uri of data.uris ?? []) constUris.add(uri);
  }

  return {
    def,
    built,
    snapshot,
    explorerQuery,
    variables,
    gisQuery,
    constUris: [...constUris],
  };
}

// ---------------------------------------------------------------------------
// Validación en vivo contra Wikidata
// ---------------------------------------------------------------------------

interface RawBinding {
  [v: string]: { type: string; value: string };
}

async function runSparql(
  query: string,
): Promise<{ vars: string[]; bindings: RawBinding[] }> {
  const delays = [2000, 5000];
  let lastErr: unknown;
  for (let attempt = 0; attempt <= delays.length; attempt++) {
    try {
      const res = await fetch(ENDPOINT, {
        method: 'POST',
        headers: {
          'User-Agent': USER_AGENT,
          Accept: 'application/sparql-results+json',
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({ query, format: 'json' }),
        signal: AbortSignal.timeout(90_000),
      });
      if (res.status === 429 && attempt < delays.length) {
        await new Promise((r) => setTimeout(r, delays[attempt]));
        continue;
      }
      if (!res.ok) {
        throw new Error(
          `HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`,
        );
      }
      const data = (await res.json()) as {
        head: { vars: string[] };
        results: { bindings: RawBinding[] };
      };
      return { vars: data.head.vars, bindings: data.results.bindings };
    } catch (err) {
      lastErr = err;
      if (attempt < delays.length) {
        await new Promise((r) => setTimeout(r, delays[attempt]));
      }
    }
  }
  throw lastErr;
}

interface TopicMetrics {
  rows: number;
  distinctEntities: number;
  coordCoverage: number;
  dateCoverage: number;
  center: [number, number];
  zoom: number;
  rangeStart: string;
  rangeEnd: string;
}

const WKT_POINT = /^Point\((-?[\d.]+) (-?[\d.]+)\)/;

function median(nums: number[]): number {
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function zoomForSpan(spanDeg: number): number {
  // Un slot del dashboard (~500px ≈ 2 tiles de 256px) muestra ~720/2^z grados.
  const z = Math.floor(Math.log2(720 / Math.max(spanDeg, 0.5)));
  return Math.min(Math.max(z, 2), 8);
}

function analyze(
  bindings: RawBinding[],
  def: TopicDef,
  built: TopicBuild,
): TopicMetrics {
  const rows = bindings.length;
  const entities = new Set<string>();
  const lngs: number[] = [];
  const lats: number[] = [];
  const dates: number[] = [];
  let withCoords = 0;
  let withDates = 0;

  for (const b of bindings) {
    const seed = b[built.seedAlias]?.value;
    if (seed) entities.add(seed);

    const m = WKT_POINT.exec(b[built.coordAlias]?.value ?? '');
    if (m) {
      withCoords += 1;
      lngs.push(parseFloat(m[1]));
      lats.push(parseFloat(m[2]));
    }

    const dateVals = built.dateAliases
      .map((a) => b[a]?.value)
      .filter((v): v is string => !!v);
    if (dateVals.length > 0) {
      withDates += 1;
      for (const v of dateVals) {
        const t = Date.parse(v);
        if (Number.isFinite(t)) dates.push(t);
      }
    }
  }

  const coordCoverage = rows > 0 ? withCoords / rows : 0;
  const dateCoverage = rows > 0 ? withDates / rows : 0;

  // Centro del mapa: mediana de coordenadas (robusta a outliers); zoom por span.
  let center: [number, number] = def.fallback.center;
  let zoom = def.fallback.zoom;
  if (lats.length > 0) {
    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    const latSpan = maxLat - minLat;

    // Longitudes: comparar span en [-180,180) vs [0,360) por si cruza el
    // antimeridiano (p.ej. terremotos del Pacífico).
    const minLng = Math.min(...lngs);
    const maxLng = Math.max(...lngs);
    const spanA = maxLng - minLng;
    const wrapped = lngs.map((l) => (l + 360) % 360);
    const minW = Math.min(...wrapped);
    const maxW = Math.max(...wrapped);
    const spanB = maxW - minW;

    const crossesAntimeridian = spanB < spanA;
    const lngSpan = crossesAntimeridian ? spanB : spanA;
    const centerLng = crossesAntimeridian
      ? ((median(wrapped) + 180) % 360) - 180
      : median(lngs);

    center = [median(lats), centerLng];
    zoom = zoomForSpan(Math.max(latSpan, lngSpan));
  }

  // Rango del timeline con un pequeño padding.
  let rangeStart = def.fallback.rangeStart;
  let rangeEnd = def.fallback.rangeEnd;
  if (dates.length > 0) {
    const min = Math.min(...dates);
    const max = Math.max(...dates);
    const pad = Math.max((max - min) * 0.03, 400 * 24 * 3600 * 1000);
    rangeStart = new Date(min - pad).toISOString();
    rangeEnd = new Date(max + pad).toISOString();
  }

  return {
    rows,
    distinctEntities: entities.size,
    coordCoverage,
    dateCoverage,
    center,
    zoom,
    rangeStart,
    rangeEnd,
  };
}

function checkThresholds(def: TopicDef, m: TopicMetrics): string[] {
  const problems: string[] = [];
  if (m.rows < def.minRows) {
    problems.push(`filas ${m.rows} < mínimo ${def.minRows}`);
  }
  if (m.rows > MAX_ROWS) {
    problems.push(`filas ${m.rows} > máximo ${MAX_ROWS} (se truncaría en el GIS)`);
  }
  if (m.coordCoverage < def.minCoordCoverage) {
    problems.push(
      `cobertura de coords ${(m.coordCoverage * 100).toFixed(1)}% < ${def.minCoordCoverage * 100}%`,
    );
  }
  if (m.dateCoverage < def.minDateCoverage) {
    problems.push(
      `cobertura de fechas ${(m.dateCoverage * 100).toFixed(1)}% < ${def.minDateCoverage * 100}%`,
    );
  }
  return problems;
}

/** Los labels de las propiedades viven en el namespace entity (wd:P31), no en
 *  prop/direct (wdt:P31): mismo mapeo que RequestService.prefetchLabels. */
function toWikidataEntityUri(uri: string): string {
  return uri.startsWith(WDT) ? WD + uri.slice(WDT.length) : uri;
}

async function fetchLabels(uris: string[]): Promise<Record<string, string>> {
  if (uris.length === 0) return {};
  const entityToOriginal = new Map<string, string>();
  const queryUris = uris.map((u) => {
    const entity = toWikidataEntityUri(u);
    if (entity !== u) entityToOriginal.set(entity, u);
    return entity;
  });
  // Misma forma de query que RequestService.buildWikidataLabelQuery.
  const values = queryUris.map((u) => `<${u}>`).join(' ');
  const q =
    'PREFIX wikibase: <http://wikiba.se/ontology#>\nPREFIX bd: <http://www.bigdata.com/rdf#>\n' +
    `SELECT ?uri ?uriLabel WHERE {\n  VALUES ?uri { ${values} }\n  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }\n}`;
  const { bindings } = await runSparql(q);
  const out: Record<string, string> = {};
  for (const b of bindings) {
    if (b['uri'] && b['uriLabel']) {
      const uri = b['uri'].value;
      out[entityToOriginal.get(uri) ?? uri] = b['uriLabel'].value;
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Payloads
// ---------------------------------------------------------------------------

function explorerPayload(
  art: TopicArtifacts,
  labels: Record<string, string>,
): object {
  return {
    panels: [
      {
        id: 'panel-0',
        name: art.def.panelName,
        graph: art.snapshot,
        generatedQuery: art.explorerQuery,
        variables: art.variables,
        labels,
      },
    ],
    activePanelId: 'panel-0',
    settings: {
      endpointType: 'generic',
      limit: EXPLORER_RESULT_LIMIT,
    },
  };
}

function gisPayload(art: TopicArtifacts, m: TopicMetrics): object {
  return {
    query: art.gisQuery,
    backend: 'wikidata',
    layout: {
      slotsCount: 4,
      preset: 'quad',
      slots: [
        { id: 'slot-0', view: 'map' },
        { id: 'slot-1', view: 'timeline' },
        { id: 'slot-2', view: 'table' },
        { id: 'slot-3', view: 'graph' },
      ],
    },
    filters: {
      map: { center: m.center, zoom: m.zoom },
      timeline: { rangeStart: m.rangeStart, rangeEnd: m.rangeEnd },
      graph: { layout: art.def.gisGraphLayout ?? 'cola' },
    },
  };
}

// ---------------------------------------------------------------------------
// SQLite
// ---------------------------------------------------------------------------

function resolveDbPath(): string {
  const explicit = process.env['DASHBOARDS_SQLITE_PATH'];
  if (explicit && explicit.trim() !== '') return path.resolve(explicit);
  const raw = process.env['SPARQL_BACKEND'] ?? 'wikidata';
  const backend = raw.toLowerCase().replace(/[^a-z0-9_-]/g, '') || 'wikidata';
  return path.resolve(`./data/${backend}.sqlite`);
}

interface SeedRow {
  id: string;
  kind: 'explorer' | 'gis';
  name: string;
  payload: object;
}

function writeRows(rows: SeedRow[]): void {
  const dbPath = resolveDbPath();
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.exec(MIGRATIONS_SQL);

  const names = rows.map((r) => r.name);
  const placeholders = names.map(() => '?').join(', ');
  const deleted = db
    .prepare(`DELETE FROM dashboards WHERE name IN (${placeholders})`)
    .run(...names);

  const now = new Date().toISOString();
  const insert = db.prepare(
    `INSERT INTO dashboards (id, kind, name, payload, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  );
  for (const row of rows) {
    insert.run(row.id, row.kind, row.name, JSON.stringify(row.payload), now, now);
  }

  // Checkpoint para que el archivo quede autocontenido (commiteable sin -wal).
  db.pragma('wal_checkpoint(TRUNCATE)');
  db.close();

  process.stdout.write(`\nSQLite: ${dbPath}\n`);
  process.stdout.write(
    `Reemplazados ${deleted.changes} tablero(s) previos con el mismo nombre.\n`,
  );
  for (const row of rows) {
    process.stdout.write(`  [${row.kind.padEnd(8)}] ${row.name}  →  ${row.id}\n`);
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<number> {
  const dryRun = process.argv.includes('--dry-run');
  const noValidate = process.argv.includes('--no-validate');

  process.stdout.write(
    `Seed de tableros demo ${dryRun ? '(dry-run) ' : ''}${noValidate ? '(sin validación remota) ' : ''}\n`,
  );
  process.stdout.write(`Endpoint: ${ENDPOINT}\n\n`);

  const rows: SeedRow[] = [];
  let failures = 0;

  for (const def of TOPICS) {
    process.stdout.write(`■ ${def.explorerName}\n`);

    const art = buildQueries(def);
    process.stdout.write(
      `  queries OK (round-trip + sparqljs) · variables: ${art.variables.join(' ')}\n`,
    );

    let metrics: TopicMetrics;
    let labels: Record<string, string> = {};

    if (noValidate) {
      metrics = {
        rows: -1,
        distinctEntities: -1,
        coordCoverage: 1,
        dateCoverage: 1,
        center: def.fallback.center,
        zoom: def.fallback.zoom,
        rangeStart: def.fallback.rangeStart,
        rangeEnd: def.fallback.rangeEnd,
      };
    } else {
      const { bindings } = await runSparql(art.gisQuery);
      metrics = analyze(bindings, def, art.built);
      process.stdout.write(
        `  wikidata: ${metrics.rows} filas · ${metrics.distinctEntities} entidades · ` +
          `coords ${(metrics.coordCoverage * 100).toFixed(1)}% · fechas ${(metrics.dateCoverage * 100).toFixed(1)}%\n`,
      );
      process.stdout.write(
        `  mapa: centro [${metrics.center.map((n) => n.toFixed(2)).join(', ')}] zoom ${metrics.zoom} · ` +
          `timeline ${metrics.rangeStart.slice(0, 10)} → ${metrics.rangeEnd.slice(0, 10)}\n`,
      );

      const problems = checkThresholds(def, metrics);
      if (problems.length > 0) {
        failures += 1;
        for (const p of problems) process.stderr.write(`  ✗ ${p}\n`);
        continue;
      }

      labels = await fetchLabels(art.constUris);
      process.stdout.write(
        `  labels: ${Object.keys(labels).length}/${art.constUris.length} URIs constantes\n`,
      );
    }

    rows.push({
      id: crypto.randomUUID(),
      kind: 'explorer',
      name: def.explorerName,
      payload: explorerPayload(art, labels),
    });
    rows.push({
      id: crypto.randomUUID(),
      kind: 'gis',
      name: def.gisName,
      payload: gisPayload(art, metrics),
    });
  }

  if (failures > 0) {
    process.stderr.write(
      `\n${failures} tema(s) no superaron la validación; no se escribió nada.\n`,
    );
    return 1;
  }

  if (dryRun) {
    process.stdout.write(`\ndry-run: ${rows.length} tableros listos, no se escribió nada.\n`);
    return 0;
  }

  writeRows(rows);
  process.stdout.write(`\nListo: ${rows.length} tableros seedeados.\n`);
  return 0;
}

if (
  require.main === module ||
  process.argv[1]?.endsWith('seed-demo-dashboards.ts')
) {
  main()
    .then((code) => process.exit(code))
    .catch((err) => {
      process.stderr.write(`\nError: ${(err as Error).message}\n`);
      process.exit(1);
    });
}
