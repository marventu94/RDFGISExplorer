import * as fs from 'node:fs';
import * as path from 'node:path';
import Database from 'better-sqlite3';
import { Parser as SparqlParser } from 'sparqljs';
import { PropertyGraph } from '../../frontend/rdf_explorer/src/app/graph/domain/graph';
import type { Node } from '../../frontend/rdf_explorer/src/app/graph/domain/node';
import type { Property } from '../../frontend/rdf_explorer/src/app/graph/domain/property';
import {
  deserializeGraph,
  serializeGraph,
  type ExplorerSerializedGraph,
} from '../../frontend/rdf_explorer/src/app/graph/domain/graph-serializer';
import { GenericAdapter } from '../../frontend/rdf_explorer/src/app/graph/domain/endpoint/generic-adapter';

export interface EvaluationDashboardRow {
  id: string;
  kind: 'gis' | 'explorer';
  name: string;
  payload: Record<string, unknown>;
}

const CONFIG_DIR = path.resolve(__dirname, '../config/evaluation');
const PREFIXES_PATH = path.resolve(
  __dirname,
  '../config/prefixes.graphdb.json',
);
const RESULT_LIMIT = 500;

/**
 * LIMIT propio de la query de cada tablero GIS. `null` = sin LIMIT.
 *
 * C1 y C3 se siembran sin LIMIT a propósito: son los casos donde interesa el
 * total de elementos. Un LIMIT propio recorta en el endpoint antes del tope del
 * backend y, al llegar menos filas que ese tope, `meta.truncated` queda en false:
 * el tablero trata el recorte como el resultado completo y tanto el panel de
 * resumen como el export se quedan con esa muestra. Sin LIMIT el recorte lo hace
 * el backend (`SPARQL_MAX_LIMIT`), que sí marca el truncamiento, y las vistas
 * paginan el volumen en lotes.
 */
export const GIS_RESULT_LIMITS: Record<
  EvaluationCaseDefinition['suffix'],
  number | null
> = {
  c1: null,
  c2: RESULT_LIMIT,
  c3: null,
  c4: RESULT_LIMIT,
};

const RDF = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#';
const RDFS = 'http://www.w3.org/2000/01/rdf-schema#';
const INM = 'http://www.semanticweb.org/luciana/ontologies/2024/8/inmontology#';
const PRONTO =
  'https://raw.githubusercontent.com/fdioguardi/pronto/main/ontology/pronto.owl#';
const REC = 'https://w3id.org/rec#';
const GR = 'http://purl.org/goodrelations/v1#';
const SIOC = 'http://rdfs.org/sioc/ns#';
const GEO = 'http://www.opengis.net/ont/geosparql#';
const TIME = 'http://www.w3.org/2006/time#';
const DC = 'http://purl.org/dc/elements/1.1/';

interface EvaluationCaseDefinition {
  suffix: 'c1' | 'c2' | 'c3' | 'c4';
  title: string;
  center: [number, number];
  zoom: number;
  rangeStart: string;
  rangeEnd: string;
  build: (graph: PropertyGraph) => void;
}

interface CaseArtifacts {
  definition: EvaluationCaseDefinition;
  snapshot: ExplorerSerializedGraph;
  explorerQuery: string;
  gisQuery: string;
  variables: string[];
  labels: Record<string, string>;
}

function makeGraph(): PropertyGraph {
  const prefixes = JSON.parse(fs.readFileSync(PREFIXES_PATH, 'utf8')) as Record<
    string,
    string
  >;
  return new PropertyGraph({
    labelUri: `${RDFS}label`,
    lang: 'es',
    prefixes: Object.entries(prefixes).map(([prefix, uri]) => ({
      prefix,
      uri,
    })),
    endpointAdapter: new GenericAdapter(),
  });
}

function varNode(
  graph: PropertyGraph,
  alias: string,
  x: number,
  y: number,
  show = true,
): Node {
  const node = graph.addNode();
  node.variable.setAlias(alias, graph);
  node.variable.options.show = show;
  node.setPosition(x, y);
  return node;
}

function constNode(
  graph: PropertyGraph,
  uri: string,
  x: number,
  y: number,
): Node {
  const node = graph.addNode();
  node.addUri(uri);
  node.mkConst();
  node.setPosition(x, y);
  return node;
}

function constProp(node: Node, uri: string): Property {
  const prop = node.newProp();
  prop.addUri(uri);
  prop.mkConst();
  return prop;
}

function connect(
  graph: PropertyGraph,
  source: Node,
  predicate: string,
  target: Node,
  optional = false,
): Property {
  const prop = constProp(source, predicate);
  prop.optional = optional;
  graph.addEdge(prop, target);
  return prop;
}

function literalProp(
  graph: PropertyGraph,
  source: Node,
  predicate: string,
  alias: string,
  optional = false,
  show = true,
): Property {
  const prop = constProp(source, predicate);
  prop.optional = optional;
  prop.mkLiteral();
  const literal = prop.getLiteral();
  literal?.setAlias(alias, graph);
  if (literal) literal.options.show = show;
  return prop;
}

function typeIs(
  graph: PropertyGraph,
  subject: Node,
  classUri: string,
  x: number,
  y: number,
): void {
  connect(graph, subject, `${RDF}type`, constNode(graph, classUri, x, y));
}

function addListingCore(
  graph: PropertyGraph,
  listing: Node,
  realEstate: Node,
  realEstateClass: string,
): void {
  connect(graph, listing, `${SIOC}about`, realEstate);
  typeIs(graph, listing, `${PRONTO}RealEstateListing`, 60, 20);
  typeIs(graph, realEstate, realEstateClass, 440, 20);
}

function addRequiredGeometry(
  graph: PropertyGraph,
  realEstate: Node,
  x: number,
  y: number,
): void {
  const site = varNode(graph, 'siteGeo', x, y, false);
  connect(graph, realEstate, `${REC}includes`, site);
  typeIs(graph, site, `${REC}Site`, x + 180, y - 100);
  const geometry = varNode(graph, 'geometry', x + 220, y + 80, false);
  connect(graph, site, `${GEO}hasGeometry`, geometry);
  literalProp(graph, geometry, `${GEO}asWKT`, 'wkt');
}

/**
 * Filtro por ciudad/partido sobre una dirección ya armada.
 *
 * `inm:address` es texto libre del scraper: filtrarlo por nombre de localidad
 * mezcla calles homónimas de otros partidos y, sobre todo, se pierde la enorme
 * mayoría de los avisos (la dirección casi nunca nombra la localidad). El eje
 * administrativo del modelo es `inm:city` → `district_*` con su `rdfs:label`.
 *
 * El filtro va sobre el label y no sobre la URI porque el dataset trae el mismo
 * partido bajo varios distritos (`district_GBA_Sur_Berisso`,
 * `district_Buenos_Aires_Berisso`, `district_Buenos_Aires_Interior_Berisso`):
 * son la misma localidad duplicada por la taxonomía de regiones del scraper.
 *
 * Cuelga de la `?postalAddress` que se le pase: cuando el caso ya proyecta una
 * dirección (C1) se reusa esa misma, porque una rama aparte multiplicaría filas
 * por producto cartesiano sin agregar información.
 */
function addCityFilterToAddress(
  graph: PropertyGraph,
  postalAddress: Node,
  value: string,
  x: number,
  y: number,
): void {
  const city = varNode(graph, 'ciudad', x, y, false);
  connect(graph, postalAddress, `${INM}city`, city);
  const label = literalProp(graph, city, `${RDFS}label`, 'ciudadLabel');
  label.getLiteral()?.addFilter('regex', { regex: `^${value}$` }, graph);
}

/**
 * Cadena inmueble → feature de dirección → dirección, que es donde cuelgan barrio
 * y partido.
 *
 * Aunque la rama se use solo como filtro, el origen se proyecta igual: el
 * inmueble suele tener una dirección por fuente (`feature_address_1` del
 * Scraper y `feature_address_2` de AVE) y la proyección completa del handoff
 * lleva `?locationFeature` a la tabla del GIS, así que la duplicación se ve
 * aunque el caso no muestre la dirección. Sin el origen esas filas repetidas
 * parecen un error de la consulta.
 */
function addLocationAddress(
  graph: PropertyGraph,
  realEstate: Node,
  x: number,
  y: number,
): Node {
  const feature = varNode(graph, 'locationFeature', x, y, false);
  const address = varNode(graph, 'locationValue', x + 180, y, false);
  connect(graph, realEstate, `${INM}hasFeature`, feature);
  connect(graph, feature, `${INM}hasValue`, address);
  const origin = varNode(graph, 'origenDireccion', x, y - 140);
  connect(graph, feature, `${INM}hasOrigin`, origin);
  return address;
}

/** Filtro por partido/localidad, armando la dirección desde el inmueble. */
function addCityFilter(
  graph: PropertyGraph,
  realEstate: Node,
  value: string,
  x: number,
  y: number,
): void {
  const address = addLocationAddress(graph, realEstate, x, y);
  addCityFilterToAddress(graph, address, value, x + 360, y);
}

/**
 * Filtro por barrio. Es el nivel correcto cuando el caso es un barrio y no una
 * localidad entera: City Bell (C2), por ejemplo, no existe como `inm:city` en el
 * dataset — es barrio de La Plata.
 */
function addNeighborhoodFilter(
  graph: PropertyGraph,
  realEstate: Node,
  value: string,
  x: number,
  y: number,
): void {
  const address = addLocationAddress(graph, realEstate, x, y);
  const neighborhood = varNode(graph, 'neighborhood', x + 360, y, false);
  connect(graph, address, `${INM}neighborhood`, neighborhood);
  const label = literalProp(graph, neighborhood, `${RDFS}label`, 'barrioLabel');
  label.getLiteral()?.addFilter('regex', { regex: `^${value}$` }, graph);
}

function addPrice(
  graph: PropertyGraph,
  listing: Node,
  x: number,
  y: number,
): void {
  const feature = varNode(graph, 'priceFeature', x, y, false);
  const specification = varNode(graph, 'priceSpecification', x + 200, y, false);
  connect(graph, listing, `${INM}hasFeature`, feature);
  typeIs(graph, feature, `${INM}Price`, x, y - 120);
  connect(graph, feature, `${INM}hasValue`, specification);
  literalProp(graph, specification, `${GR}hasCurrency`, 'moneda');
  literalProp(graph, specification, `${GR}hasCurrencyValue`, 'precio');
}

const CASES: EvaluationCaseDefinition[] = [
  {
    suffix: 'c1',
    title: 'C1 · Casas en venta en Berisso',
    center: [-34.87, -57.88],
    zoom: 12,
    rangeStart: '2018-01-01T00:00:00.000Z',
    rangeEnd: '2026-01-01T00:00:00.000Z',
    build(graph) {
      const listing = varNode(graph, 'listing', 120, 180);
      const realEstate = varNode(graph, 'realEstate', 440, 180);
      addListingCore(graph, listing, realEstate, `${INM}House`);
      connect(
        graph,
        listing,
        `${GR}hasBusinessFunction`,
        constNode(graph, `${GR}Sell`, 80, 360),
      );
      literalProp(graph, listing, `${RDFS}label`, 'realEstateLabel');

      const addressFeature = varNode(graph, 'addressFeature', 700, 60, false);
      const postalAddress = varNode(graph, 'postalAddress', 900, 60, false);
      connect(graph, realEstate, `${INM}hasFeature`, addressFeature);
      typeIs(graph, addressFeature, `${INM}Address`, 700, -80);
      connect(graph, addressFeature, `${INM}hasValue`, postalAddress);
      // La dirección se proyecta como dato de la fila, no como filtro.
      literalProp(graph, postalAddress, `${INM}address`, 'direccion');
      // Un mismo inmueble suele traer una dirección por fuente
      // (`feature_address_1` del Scraper y `feature_address_2` de AVE, con su
      // propio `time:hasTime`): son dos filas del mismo aviso, con la misma
      // calle escrita distinto. Sin el origen la duplicación parece un error de
      // la consulta; con él, la fila dice de qué fuente viene cada variante.
      // Es el mismo recurso que C3 proyecta para la antigüedad.
      const addressOrigin = varNode(graph, 'origenDireccion', 920, -60);
      connect(graph, addressFeature, `${INM}hasOrigin`, addressOrigin);
      addCityFilterToAddress(graph, postalAddress, 'berisso', 1100, 60);

      addPrice(graph, listing, 360, 420);
      const priceTime = varNode(graph, 'priceTime', 780, 420, false);
      connect(
        graph,
        graph.nodes.find((node) => node.variable.alias === 'priceFeature')!,
        `${TIME}hasTime`,
        priceTime,
      );
      literalProp(graph, priceTime, `${TIME}inXSDDateTimeStamp`, 'fechaPrecio');
      addRequiredGeometry(graph, realEstate, 700, 260);
    },
  },
  {
    suffix: 'c2',
    title: 'C2 · Producto típico de City Bell',
    center: [-34.86, -58.05],
    zoom: 12,
    rangeStart: '2018-01-01T00:00:00.000Z',
    rangeEnd: '2026-01-01T00:00:00.000Z',
    build(graph) {
      const listing = varNode(graph, 'listing', 120, 180);
      const realEstate = varNode(graph, 'realEstate', 420, 180);
      addListingCore(graph, listing, realEstate, `${INM}Apartment`);
      literalProp(graph, listing, `${RDFS}label`, 'realEstateLabel');
      literalProp(graph, listing, `${SIOC}read_at`, 'fechaLectura');
      addNeighborhoodFilter(graph, realEstate, 'city bell', 640, -20);

      const building = varNode(graph, 'building', 680, 180, false);
      connect(graph, realEstate, `${REC}includes`, building);
      typeIs(graph, building, `${REC}Building`, 900, 100);
      literalProp(graph, building, `${PRONTO}has_number_of_rooms`, 'ambientes');

      const siteSurface = varNode(graph, 'siteSurface', 680, 380, false);
      const surfaceFeature = varNode(graph, 'surfaceFeature', 880, 380, false);
      const surfaceSpec = varNode(
        graph,
        'surfaceSpecification',
        1080,
        380,
        false,
      );
      connect(graph, realEstate, `${REC}includes`, siteSurface);
      typeIs(graph, siteSurface, `${REC}Site`, 680, 520);
      connect(graph, siteSurface, `${INM}hasFeature`, surfaceFeature);
      connect(graph, surfaceFeature, `${INM}hasValue`, surfaceSpec);
      literalProp(graph, surfaceSpec, `${GR}hasValue`, 'superficieCubierta');
      literalProp(
        graph,
        surfaceSpec,
        `${GR}hasUnitOfMeasurement`,
        'unidadSuperficie',
      );

      addPrice(graph, listing, 300, 480);
      addRequiredGeometry(graph, realEstate, 900, 600);
    },
  },
  {
    suffix: 'c3',
    title: 'C3 · Departamentos a estrenar y usados en Berisso',
    center: [-34.87, -57.88],
    zoom: 12,
    rangeStart: '2020-01-01T00:00:00.000Z',
    rangeEnd: '2026-01-01T00:00:00.000Z',
    build(graph) {
      const listing = varNode(graph, 'listing', 120, 180);
      const realEstate = varNode(graph, 'realEstate', 420, 180);
      addListingCore(graph, listing, realEstate, `${INM}Apartment`);
      literalProp(graph, listing, `${RDFS}label`, 'realEstateLabel');
      // La fecha es obligatoria: C3 debe conservar dimensiones G+S+T.
      literalProp(graph, listing, `${DC}date`, 'fechaPublicacion');
      addCityFilter(graph, realEstate, 'berisso', 640, -20);

      const ageFeature = varNode(graph, 'featureAntiguedad', 680, 220, false);
      connect(graph, realEstate, `${INM}hasFeature`, ageFeature);
      typeIs(graph, ageFeature, `${INM}PropertyAge`, 900, 120);
      literalProp(graph, ageFeature, `${INM}hasValue`, 'antiguedad');
      const origin = varNode(graph, 'origenAntiguedad', 920, 300);
      connect(graph, ageFeature, `${INM}hasOrigin`, origin);

      addRequiredGeometry(graph, realEstate, 700, 480);
    },
  },
  {
    suffix: 'c4',
    title: 'C4 · Fechas de publicación y tandas de lectura',
    center: [-38.0, -57.55],
    zoom: 10,
    rangeStart: '2018-01-01T00:00:00.000Z',
    rangeEnd: '2026-01-01T00:00:00.000Z',
    build(graph) {
      const listing = varNode(graph, 'listing', 120, 180);
      const realEstate = varNode(graph, 'realEstate', 420, 180);
      addListingCore(graph, listing, realEstate, `${INM}Apartment`);
      literalProp(graph, listing, `${RDFS}label`, 'realEstateLabel');
      literalProp(graph, listing, `${DC}date`, 'fechaPublicacion');
      const readAt = literalProp(
        graph,
        listing,
        `${SIOC}read_at`,
        'fechaLectura',
      );
      readAt
        .getLiteral()
        ?.addFilter(
          'datefrom',
          { date: '2023-05-01', granularity: 'day' },
          graph,
        );
      readAt
        .getLiteral()
        ?.addFilter(
          'dateto',
          { date: '2025-04-30', granularity: 'day' },
          graph,
        );

      const cityFeature = varNode(graph, 'cityFeature', 660, -20, false);
      const cityValue = varNode(graph, 'cityValue', 840, -20, false);
      const city = varNode(graph, 'city', 1020, -20, false);
      connect(graph, realEstate, `${INM}hasFeature`, cityFeature);
      connect(graph, cityFeature, `${INM}hasValue`, cityValue);
      connect(graph, cityValue, `${INM}city`, city);
      // Misma razón que en `addLocationAddress`: una dirección por fuente.
      const cityOrigin = varNode(graph, 'origenDireccion', 660, -160);
      connect(graph, cityFeature, `${INM}hasOrigin`, cityOrigin);
      const cityLabel = literalProp(graph, city, `${RDFS}label`, 'ciudadLabel');
      cityLabel
        .getLiteral()
        ?.addFilter('regex', { regex: '^mar del plata$' }, graph);

      const building = varNode(graph, 'building', 680, 220, false);
      connect(graph, realEstate, `${REC}includes`, building);
      typeIs(graph, building, `${REC}Building`, 900, 140);
      const rooms = literalProp(
        graph,
        building,
        `${PRONTO}has_number_of_rooms`,
        'ambientes',
      );
      rooms.getLiteral()?.addFilter('geq', { number: 0 }, graph);
      rooms.getLiteral()?.addFilter('leq', { number: 2 }, graph);
      addRequiredGeometry(graph, realEstate, 700, 480);
    },
  },
];

function labelForUri(uri: string): string {
  const hash = uri.lastIndexOf('#');
  const slash = uri.lastIndexOf('/');
  return decodeURIComponent(uri.slice(Math.max(hash, slash) + 1));
}

function buildCaseArtifacts(
  definition: EvaluationCaseDefinition,
): CaseArtifacts {
  const graph = makeGraph();
  definition.build(graph);
  const queries = graph.getQueriesForGraph().queries;
  if (queries.length !== 1) {
    throw new Error(
      `[${definition.title}] se esperaba una consulta conexa; hay ${queries.length}`,
    );
  }
  const explorerQuery = queries[0].toSparql();
  const gisLimit = GIS_RESULT_LIMITS[definition.suffix];
  const gisQuery = queries[0].toSparqlFullProjection(
    gisLimit === null ? {} : { limit: gisLimit },
  );
  if (!explorerQuery || !gisQuery) {
    throw new Error(`[${definition.title}] no se pudo generar la consulta`);
  }

  const snapshot = serializeGraph(graph);
  const restored = makeGraph();
  deserializeGraph(restored, snapshot);
  const roundTrip = restored.getQueriesForGraph().queries[0]?.toSparql();
  if (roundTrip !== explorerQuery) {
    throw new Error(`[${definition.title}] el grafo no conserva su consulta`);
  }

  const parser = new SparqlParser();
  parser.parse(explorerQuery);
  parser.parse(gisQuery);

  const labels: Record<string, string> = {};
  for (const element of snapshot.nodes) {
    const data = element.data as { isVar?: boolean; uris?: string[] };
    if (data.isVar) continue;
    for (const uri of data.uris ?? []) labels[uri] = labelForUri(uri);
  }

  return {
    definition,
    snapshot,
    explorerQuery,
    gisQuery,
    variables: queries[0].select.map((resource) => String(resource.variable)),
    labels,
  };
}

function explorerPayload(artifacts: CaseArtifacts): Record<string, unknown> {
  return {
    panels: [
      {
        id: 'panel-0',
        name: `DRAFT · ${artifacts.definition.title}`,
        graph: artifacts.snapshot,
        generatedQuery: artifacts.explorerQuery,
        variables: artifacts.variables,
        labels: artifacts.labels,
      },
    ],
    activePanelId: 'panel-0',
    // `limit` acá es decorativo: al cargar un workspace el Explorer no lo lee
    // (`workspace-persistence.service.fromPayload`), toma su límite de
    // `/api/config` → `defaults.resultLimit` (env `SPARQL_DEFAULT_LIMIT`).
    settings: { endpointType: 'generic', limit: RESULT_LIMIT },
  };
}

function gisPayload(artifacts: CaseArtifacts): Record<string, unknown> {
  const definition = artifacts.definition;
  return {
    query: artifacts.gisQuery,
    backend: 'graphdb',
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
      map: { center: definition.center, zoom: definition.zoom },
      timeline: {
        rangeStart: definition.rangeStart,
        rangeEnd: definition.rangeEnd,
      },
      table: { pageSize: 100 },
      graph: { layout: 'cola' },
    },
  };
}

export function buildEvaluationRows(): EvaluationDashboardRow[] {
  const artifacts = CASES.map(buildCaseArtifacts);
  const rows: EvaluationDashboardRow[] = artifacts.map((item) => ({
    id: `eval-${item.definition.suffix}`,
    kind: 'gis',
    name: item.definition.title,
    payload: gisPayload(item),
  }));

  rows.push(
    ...artifacts.map((item) => ({
      id: `draft-explorer-${item.definition.suffix}`,
      kind: 'explorer' as const,
      name: `DRAFT · ${item.definition.title}`,
      payload: explorerPayload(item),
    })),
  );

  const explorerPayloadC5 = JSON.parse(
    fs.readFileSync(path.join(CONFIG_DIR, 'c5-explorer.json'), 'utf8'),
  ) as Record<string, unknown>;
  rows.push({
    id: 'eval-c5',
    kind: 'explorer',
    name: 'C5 · Construcción visual y handoff',
    payload: explorerPayloadC5,
  });
  return rows;
}

const MIGRATIONS_SQL = `
CREATE TABLE dashboards (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('gis','explorer')),
  name TEXT NOT NULL,
  payload TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX idx_dashboards_updated ON dashboards(updated_at DESC);
`;

export function seedEvaluationDatabase(targetPath: string): void {
  const resolved = path.resolve(targetPath);
  fs.mkdirSync(path.dirname(resolved), { recursive: true });
  const tempPath = `${resolved}.tmp-${process.pid}`;
  for (const suffix of ['', '-wal', '-shm']) {
    fs.rmSync(`${tempPath}${suffix}`, { force: true });
  }

  const db = new Database(tempPath);
  try {
    db.pragma('journal_mode = WAL');
    db.exec(MIGRATIONS_SQL);
    const insert = db.prepare(`
      INSERT INTO dashboards (id, kind, name, payload, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    const baseTime = Date.now();
    const transaction = db.transaction((rows: EvaluationDashboardRow[]) => {
      rows.forEach((row, index) => {
        const timestamp = new Date(baseTime - index * 1000).toISOString();
        insert.run(
          row.id,
          row.kind,
          row.name,
          JSON.stringify(row.payload),
          timestamp,
          timestamp,
        );
      });
    });
    transaction(buildEvaluationRows());
    db.pragma('wal_checkpoint(TRUNCATE)');
  } finally {
    db.close();
  }

  for (const suffix of ['-wal', '-shm']) {
    fs.rmSync(`${resolved}${suffix}`, { force: true });
  }
  fs.renameSync(tempPath, resolved);
}
