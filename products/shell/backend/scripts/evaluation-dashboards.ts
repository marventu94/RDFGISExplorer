import * as fs from 'node:fs';
import * as path from 'node:path';
import Database from 'better-sqlite3';
import { Parser as SparqlParser } from 'sparqljs';
import { PropertyGraph } from '../../../rdf-explorer/frontend/src/app/graph/domain/graph';
import type { Node } from '../../../rdf-explorer/frontend/src/app/graph/domain/node';
import type { Property } from '../../../rdf-explorer/frontend/src/app/graph/domain/property';
import {
  deserializeGraph,
  serializeGraph,
  type ExplorerSerializedGraph,
} from '../../../rdf-explorer/frontend/src/app/graph/domain/graph-serializer';
import { GenericAdapter } from '../../../rdf-explorer/frontend/src/app/graph/domain/endpoint/generic-adapter';

export interface EvaluationDashboardRow {
  id: string;
  kind: 'gis' | 'explorer';
  name: string;
  payload: Record<string, unknown>;
}

const PREFIXES_PATH = path.resolve(
  __dirname,
  '../../../../packages/explorer-backend/config/prefixes.graphdb.example.json',
);
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
  suffix: 'd1' | 'd2' | 'd3' | 'd4' | 'd5';
  title: string;
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
 * dirección (D1) se reusa esa misma, porque una rama aparte multiplicaría filas
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
 * localidad entera: City Bell (D4), por ejemplo, no existe como `inm:city` en el
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
    suffix: 'd1',
    title: 'D1 · Encontrar y verificar una casa de Berisso',
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
      // Es el mismo recurso que D2 y D3 proyectan para la antigüedad.
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
    suffix: 'd2',
    title: 'D2 · Entender la antigüedad y su procedencia en Berisso',
    build(graph) {
      const listing = varNode(graph, 'listing', 120, 180);
      const realEstate = varNode(graph, 'realEstate', 420, 180);
      addListingCore(graph, listing, realEstate, `${INM}Apartment`);
      literalProp(graph, listing, `${RDFS}label`, 'realEstateLabel');
      // La fecha es obligatoria: D2 debe conservar dimensiones G+S+T.
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
    suffix: 'd3',
    title: 'D3 · Explorar departamentos de Berisso por fecha y zona',
    build(graph) {
      const listing = varNode(graph, 'listing', 120, 180);
      const realEstate = varNode(graph, 'realEstate', 420, 180);
      addListingCore(graph, listing, realEstate, `${INM}Apartment`);
      literalProp(graph, listing, `${RDFS}label`, 'realEstateLabel');
      // La fecha es obligatoria: D3 debe conservar dimensiones G+S+T.
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
    suffix: 'd4',
    title: 'D4 · Explorar lotes y exportar departamentos de City Bell',
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
      // Dimensions también usa gr:hasValue, pero sus valores son longitudes.
      typeIs(graph, surfaceFeature, `${INM}Surface`, 1080, 520);
      connect(graph, surfaceFeature, `${INM}hasValue`, surfaceSpec);
      literalProp(graph, surfaceSpec, `${GR}hasValue`, 'superficie');
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
    suffix: 'd5',
    title: 'D5 · Construir y guardar una consulta de casas de Berisso',
    build(graph) {
      // Punto de partida acotado. El participante agrega precio y moneda,
      // ejecuta, guarda una copia y transfiere el resultado a GIS.
      const listing = varNode(graph, 'listing', 120, 180);
      const realEstate = varNode(graph, 'realEstate', 420, 180);
      addListingCore(graph, listing, realEstate, `${INM}House`);
      connect(graph, listing, `${GR}hasBusinessFunction`,
        constNode(graph, `${GR}Sell`, 80, 360));
      literalProp(graph, listing, `${RDFS}label`, 'realEstateLabel');
      addCityFilter(graph, realEstate, 'berisso', 640, -20);
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
  // Mismo método y alcance que el handoff real; el backend aplica su tope.
  const gisQuery = queries[0].toSparqlFullProjection();
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
        name: artifacts.definition.title,
        graph: artifacts.snapshot,
        generatedQuery: artifacts.explorerQuery,
        variables: artifacts.variables,
        labels: artifacts.labels,
      },
    ],
    activePanelId: 'panel-0',
  };
}

/** Consultas de auditoría derivadas de los mismos grafos que carga la interfaz. */
export function buildEvaluationQueries(): Array<{ id: string; query: string }> {
  return CASES.map(buildCaseArtifacts).map((item) => ({
    id: `eval-explorer-${item.definition.suffix}`,
    query: item.gisQuery,
  }));
}

export function buildEvaluationRows(): EvaluationDashboardRow[] {
  return CASES.map(buildCaseArtifacts).map((item) => ({
    id: `eval-explorer-${item.definition.suffix}`,
    kind: 'explorer',
    name: item.definition.title,
    payload: explorerPayload(item),
  }));
}

/** Restablece la base a los cinco escenarios de evaluación.
 * Borra también tableros manuales. Usa una transacción sobre el mismo archivo
 * para que el servidor activo vea el cambio sin reemplazar su conexión SQLite.
 */
export function seedEvaluationDatabase(targetPath: string): void {
  const rows = buildEvaluationRows();
  const resolved = path.resolve(targetPath);
  fs.mkdirSync(path.dirname(resolved), { recursive: true });
  const db = new Database(resolved);
  try {
    db.pragma('busy_timeout = 5000');
    db.exec(`
      CREATE TABLE IF NOT EXISTS dashboards (
        id TEXT PRIMARY KEY,
        kind TEXT NOT NULL CHECK (kind IN ('gis','explorer')),
        name TEXT NOT NULL,
        payload TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_dashboards_updated ON dashboards(updated_at DESC);
    `);
    const remove = db.prepare('DELETE FROM dashboards');
    const upsert = db.prepare(`
      INSERT INTO dashboards (id, kind, name, payload, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        kind = excluded.kind, name = excluded.name, payload = excluded.payload,
        updated_at = excluded.updated_at
    `);
    db.transaction(() => {
      remove.run();
      const baseTime = Date.now();
      rows.forEach((row, index) => {
        const timestamp = new Date(baseTime - index * 1000).toISOString();
        upsert.run(row.id, row.kind, row.name, JSON.stringify(row.payload), timestamp, timestamp);
      });
    })();
  } finally {
    db.close();
  }
}
