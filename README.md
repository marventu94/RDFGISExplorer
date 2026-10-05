# RDF GIS Explorer

A data exploration platform for graph databases accessible through SPARQL 1.1.
It integrates three deployable products:

- **Shell**: navigation, integration, and dashboard persistence.
- **RDF Explorer**: visual SPARQL query construction.
- **GIS Explorer**: coordinated analysis through table, graph, map, and timeline views.

The platform is independent of both the data domain and any specific engine.
The explorers' backend uses a SPARQL client configurable by URL, credentials,
prefixes, and limits. The bundled configuration targets Wikidata to provide an
immediately usable demo.

Process and responsibility boundaries are detailed in
[docs/product-architecture.md](docs/product-architecture.md). Design decisions
are documented in [docs/design-decisions.md](docs/design-decisions.md) and
[docs/graph-rendering-decisions.md](docs/graph-rendering-decisions.md).

## Quick start with Wikidata demo dashboards

With nvm and corepack/pnpm installed, run these commands from the repository
root to create the demo dashboards and start the platform with the bundled
Wikidata configuration:

```bash
nvm use
corepack enable
pnpm install
pnpm --dir products/shell/backend run seed:demo-dashboards
./start.sh
```

Open http://localhost:4200 and choose a demo dashboard from the welcome page.
The seed creates five RDF Explorer workspaces and five equivalent GIS dashboards in
`products/shell/backend/data/wikidata.sqlite` by default. Opening a dashboard
executes its saved query against live Wikidata to populate the views.

The seed validates the queries against Wikidata before saving. To create the
dashboards without that remote validation, use:

```bash
pnpm --dir products/shell/backend run seed:demo-dashboards -- --no-validate
```

Wikidata access is still required when opening the dashboards. To preview and
validate the seed without writing to SQLite, use:

```bash
pnpm --dir products/shell/backend run seed:demo-dashboards -- --dry-run
```

Running the seed again replaces demo dashboards with matching names. If you
override `DASHBOARDS_SQLITE_PATH`, check the target database before running it;
relative paths are resolved from `products/shell/backend`.

## Visual tour

### Shell

The entry point brings the explorers together and lets users open, manage, and
resume saved dashboards.

![Shell showing recent Wikidata dashboards](docs/assets/01-shell-dashboard.png)

### RDF Explorer

The visual builder models a query as a graph and generates its SPARQL
representation without relying on a specific domain.

![Visual query construction in RDF Explorer](docs/assets/02-rdf-explorer.png)

### GIS Explorer

Results are explored through four coordinated views: map, timeline, table, and
graph.

![Coordinated result exploration in GIS
Explorer](docs/assets/03-gis-explorer.png)

## Technology stack

| Area | Technologies | Role |
| --- | --- | --- |
| Language and runtime | TypeScript 5.9, Node.js 24.18.0 | Shared contracts, frontend and backend code |
| Frontend | Angular 21, Angular Material/CDK, SCSS | Standalone components, UI controls and styling |
| Microfrontends | Native Federation 21 | Shell host and independently deployable RDF/GIS remotes |
| Reactive state | Angular Signals, RxJS 7 | Application state and coordinated view updates |
| Backend | NestJS 11, class-validator, class-transformer | REST APIs, dependency injection and request validation |
| Persistence | SQLite, better-sqlite3 | Saved dashboards and workspaces in the Shell |
| RDF queries | SPARQL 1.1, sparqljs 3 | Configurable endpoint access and query parsing/validation |
| Graphs | Cytoscape.js 3, cola and dagre layouts | Visual query builder and graph exploration |
| Maps | Leaflet 1.9, markercluster, leaflet-draw, Turf.js | Geographic visualization, clustering and polygon filtering |
| Tables and timeline | AG Grid 35, vis-timeline 8 | Tabular results and temporal exploration |
| Query editor and export | CodeMirror 6, ExcelJS 4 | SPARQL editing and XLSX export |
| Workspace and deployment | pnpm workspaces, Docker Compose | Monorepo dependencies and containerized services |
| Tests and linting | Jest 30, Vitest 4, nock, supertest, ESLint 9 | Backend/frontend tests, HTTP mocks and static checks |

## Local development

Requirements: Node.js 24.18.0, corepack/pnpm, and nvm for the complete
bootstrap flow.

```bash
./start.sh

# Use a custom SPARQL configuration
./start.sh --env .env.custom
```

`start.sh` activates the Node version, installs dependencies when
necessary, and starts all three frontends and backends with hot reload.

| Service | URL |
| --- | --- |
| Shell | http://localhost:4200 |
| Integrated RDF Explorer | http://localhost:4200/explorer |
| Integrated GIS Explorer | http://localhost:4200/gis |
| Shell API | http://localhost:3000/api |
| RDF API | http://localhost:3001/api |
| GIS API | http://localhost:3002/api |

Each explorer can also run with its own runtime:

```bash
pnpm run dev:rdf-standalone
pnpm run dev:gis-standalone
docker compose up
```

## Structure

```text
packages/
  contracts/          types shared by backends and frontends
  platform-bridge/    Shell-to-remote integration contracts
  explorer-backend/   shared SPARQL runtime, without dashboard persistence
products/
  shell/              host and dashboard-only API
  rdf-explorer/       visual query builder and its own runtime
  gis-explorer/       coordinated views and its own runtime
```

The remotes use `/api` in standalone mode. When integrated into the
Shell, the bridge configures `/rdf-api` and `/gis-api`. Only the
Shell exposes `/api/dashboards` and accesses SQLite.

## API

The explorer runtimes expose query execution and summaries, suggestions,
configuration, and health checks under `/api`. The Shell exposes
CRUD operations at `/api/dashboards` and `/api/dashboards/recent?limit=N`.

## SPARQL configuration

The backend configuration is the single source of truth and reaches the
frontends through `GET /api/config`.

```env
SPARQL_BACKEND=custom
SPARQL_ENDPOINT_URL=https://example.org/sparql
SPARQL_USERNAME=
SPARQL_PASSWORD=
SPARQL_PREFIXES_PATH=packages/explorer-backend/config/prefixes.custom.json
CLASS_COLORS_PATH=packages/explorer-backend/config/class-colors.custom.json
```

Every `SPARQL_BACKEND` value other than `wikidata` uses the generic
SPARQL adapter. The `wikidata` mode adds only that service's public
integrations, such as its search API and `wikibase:label`.

Prefix files are JSON objects of the form `{ "prefix": "uri" }`. The backend does
not inject them at execution time: every query must be self-contained.

| Variable | Default | Purpose |
| --- | --- | --- |
| `SPARQL_BACKEND` | `wikidata` | Configuration identifier |
| `SPARQL_ENDPOINT_URL` | public Wikidata endpoint | SPARQL 1.1 URL |
| `SPARQL_USERNAME` / `SPARQL_PASSWORD` | — | Optional Basic Auth |
| `SPARQL_ENTITY_SEARCH_QUERY` | search by `rdfs:label` | Entity/resource search template (`$keyword`, `$limit`, optional `$offset`) |
| `SPARQL_SERVER_TIMEOUT_PARAM` | `timeout` for GraphDB; disabled elsewhere | Server timeout form parameter, in seconds; empty disables it |
| `SPARQL_TIMEOUT_MS` | `30000` | Timeout in ms |
| `SPARQL_MAX_LIMIT` | `2000` | Maximum rows returned by a query request; also used when the request omits a response limit |
| `SPARQL_PREFIXES_PATH` | `config/prefixes.${SPARQL_BACKEND}.json` | Prefixes |
| `CLASS_COLORS_PATH` | `config/class-colors.${SPARQL_BACKEND}.json` | RDF colors |
| `DASHBOARDS_SQLITE_PATH` | `data/${SPARQL_BACKEND}.sqlite` | Shell SQLite database |
| `SPARQL_PROTECTED_BACKENDS` | `wikidata` | Databases preserved during cleanup |
| `GIS_GRAPH_MAX_NODES` | `300` | Graph node cap |
| `GIS_LOT_DEFAULT_SIZE` | `300` | Initial batch size |
| `GIS_LOT_SIZE_OPTIONS` | `100,300,500` | Available batch sizes |
| `GIS_TABLE_PAGE_SIZE_OPTIONS` | `50,100,200` | Table page sizes |
| `EXPORT_MAX_ROWS` | `50000` | Full-export cap |
| `EXPORT_MIN_PAGE_SIZE` | `250` | Minimum retry page size |
| `SUMMARY_TOP_CATEGORICAL_LIMIT` | `12` | Number of top categorical values |

## Guided RDF discovery

RDF Explorer searches **classes** and **resources** by label or URI. Drag a class
onto the canvas to create a typed variable, or a resource to add that specific
entity. Resource search uses the endpoint's configured entity search; Wikidata
uses its public search API.

The right-hand **Explorer** panel shows incoming and outgoing relationships for
the selected variable or resource. Filter connections locally, then drag a
relationship onto the canvas to add a branch. **Agregar con tipo observado**
explicitly applies the observed class/datatype; dragging a concrete value
constrains the branch. Compatible existing branches are reused. Optionality and
value filters remain editable in the query editor.

Suggestions follow the connected graph structure and term types; canvas value
filters apply only when executing the query. Catalogues and connections use
bounded samples, so missing terms and counts do not describe the complete dataset
or universal schema constraints. The endpoint's inference and dataset scope apply.

Discovery is read-only, with caching, bounded queues and timeouts. Upstream
failures temporarily pause new discovery requests while cached results remain
available. Tune sampling, result limits, caching and request budgets through
`DISCOVERY_*` environment variables; defaults are defined in
[discovery.service.ts](packages/explorer-backend/src/modules/discovery/discovery.service.ts).
Resource search can be customized with `SPARQL_ENTITY_SEARCH_QUERY`.

Explorer backends expose `GET /api/discovery/catalog`,
`POST /api/discovery/connections` and `POST /api/discovery/paths`, with shared types
in `@rdfgis/contracts`. The simplified panel uses catalogue and connections;
the path API remains available separately.

## Quality checks

```bash
pnpm -r --if-present test
pnpm -r --if-present build
docker compose config --quiet
git diff --check
```

## Contact

Martín M. Venturino — `marventurino@gmail.com`
