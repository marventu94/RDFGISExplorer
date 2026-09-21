# AGENTS.md — RDF GIS Explorer

## General architecture

Microfrontend platform using **Native Federation** (`@angular-architects/native-federation`, without
Webpack).

```
AppShell (host, :4200)
├── /               → WelcomePage (recent dashboards)
├── /explorer       → remote: rdf_explorer (:4201) → MainComponent
├── /gis            → remote: rdf_gis_explorer (:4202) → App
├── /dashboards/:id → dashboardRedirectGuard → redirects by kind (gis/explorer)
└── /**             → redirect to /

Shell backend (:3000) → `/api/dashboards` (exclusive CRUD, SQLite)
RDF backend (:3001)   → query, summary, suggestions, config, and health
GIS backend (:3002)   → query, summary, suggestions, config, and health
```

Types shared by backends and frontends live in **`packages/contracts`**
(`@rdfgis/contracts`, types only): `QueryResult`, `AppConfig`, and
`Dashboard`.

## Monorepo structure

**pnpm** workspace (`pnpm-workspace.yaml` at the root): one `pnpm install`
installs everything.

| Project | Path | Framework | Test runner | Port |
|---------|------|-----------|-------------|------|
| Root | `/` | concurrently | — | — |
| Contracts | `packages/contracts/` | TypeScript (types only) | — | — |
| Shell backend | `products/shell/backend/` | NestJS 11 | Jest 30 | 3000 |
| Explorer runtimes | `packages/explorer-backend/` | NestJS 11 | Jest 30 | 3001/3002 |
| App Shell | `products/shell/frontend/` | Angular 21 | Vitest 4 (through `ng test`) | 4200 |
| RDF Explorer | `products/rdf-explorer/frontend/` | Angular 21 | Vitest 4 (through `ng test`) | 4201 |
| RDF GIS Explorer | `products/gis-explorer/frontend/` | Angular 21 | Vitest 4 (through `ng test`) | 4202 |

## Commands

```bash
./start.sh                     # dev with hot reload; use --env .env.custom for another endpoint
npm run dev                    # same, without nvm/corepack bootstrap

cd packages/explorer-backend && pnpm run start:dev   # backend only
cd packages/explorer-backend && pnpm test            # unit tests (Jest)
cd packages/explorer-backend && pnpm run lint        # ESLint
pnpm run dev:rdf-standalone       # RDF Explorer + its own backend
pnpm run dev:gis-standalone       # GIS Explorer + its own backend

cd products/<product>/frontend && pnpm test
```

## Code conventions

### Backend (NestJS)

- **Pattern:** Hexagonal (Ports & Adapters). `SparqlEndpoint` is the port; `GenericSparqlAdapter` serves configurable SPARQL endpoints, and `WikidataAdapter` adds its public integrations. The factory passes `SPARQL_BACKEND` as `backendName`, reported by `/api/health` and `QueryResult.meta.backend`.
- **DI tokens:** Symbols (`SPARQL_ENDPOINT`, `DASHBOARDS_DB`), not strings.
- **DTOs:** `class-validator` + `class-transformer`. Global validation through `ValidationPipe({ transform: true, whitelist: true })`.
- **Errors:** global `HttpExceptionFilter` maps `TimeoutError`→408 and `UpstreamError`→502.
- **DB:** synchronous `better-sqlite3`, WAL mode. The `dashboards` table stores opaque JSON in `payload`.
- **Tests:** Jest with `nock` for HTTP mocks, `supertest` for endpoints, and `@nestjs/testing` for modules.

### Frontend (Angular 21)

- **Standalone components** throughout. No NgModules.
- **Reactivity:** Angular Signals (`signal`, `computed`, `effect`) plus RxJS `BehaviorSubject` where appropriate.
- **Native Federation:** each remote exposes one component through `federation.config.js` → `exposes: { './Component': '...' }`.
- **Styles:** per-component SCSS. Angular Material theme in the Shell's `styles.scss`.
- **Tests:** colocated `*.spec.ts` files, run with Vitest through `ng test` (see Important notes).

### Federation shared dependencies (read before changing `federation.config.js`)

- Baseline: `shareAll({ singleton: true, strictVersion: true })` in the host and remotes.
- **The host explicitly shares `@angular/material` and `@angular/cdk` with `includeSecondaries: { keepAll: true }`**, even though its code does not import them. With `ignoreUnusedDeps`, if the host does not provide them, each remote loads its OWN CDK copy; two live copies cause NG0912 warnings (Component ID collision) and make `MatDialog` crash (`this._portalOutlet is undefined`: inherited `viewChild(CdkPortalOutlet)` does not match the directive from the other copy). `keepAll: true` keeps the entry from being removed by the `ignoreUnusedDeps` filter.
- **AG Grid belongs exclusively to the GIS remote** (it is in its `skip`): if shared, the host omits it from the import map and the remote cannot resolve the specifier.
- Leaflet, sparqljs, exceljs, and other CJS/UMD packages are not shared either (they are in the GIS remote's `skip`); `leaflet-global.ts` assigns `window.L` for plugins.
- The `@softarc/native-federation` patch (`products/gis-explorer/frontend/patches/`) resolves package.json files for non-hoisted transitive dependencies in the pnpm store. It is referenced in `pnpm-workspace.yaml`.

### Shell ↔ remote communication

- **QueryHandoffService** is deliberately duplicated in `rdf_explorer` and `rdf_gis_explorer`; application services cannot be shared through federation. It uses `sessionStorage` + `CustomEvent('query-handoff')` + the `storage` event, a 5-minute TTL, and one-time `consume()` semantics.
- **Dashboards:** only the Shell exposes `/api/dashboards` and registers `DashboardHost` in `@rdfgis/platform-bridge`. Integrated remotes use that mediation; standalone mode hides persistence.
- **Explorer APIs:** standalone mode uses `/api`; the Shell configures `/rdf-api` and `/gis-api`, always as relative URLs.

## Backend modules

| Module | Path | Responsibility |
|--------|------|----------------|
| `SparqlModule` | `modules/sparql/` | `@Global()`. Provides the `SPARQL_ENDPOINT` token through a factory based on `SPARQL_BACKEND` |
| `QueryModule` | `modules/query/` | Executes SPARQL, validates with `sparqljs.Parser`, and applies limits and timeout. `POST /api/query/summary` wraps the user's query as a subquery and aggregates over the complete result |
| `DashboardsModule` | `modules/dashboards/` | Dashboard CRUD in SQLite. Opaque JSON payload (max 1 MB). `kind` ∈ {gis, explorer} |
| `SuggestionsModule` | `modules/suggestions/` | Predicate autocomplete and entity search |
| `HealthModule` | `modules/health/` | `/api/health` (used by Docker) and `/api/health/sparql` (checks the upstream endpoint) |
| `AppConfigModule` | `modules/app-config/` | `GET /api/config`: env + `defaultPrefixes` + `describe`/`classColors`/`defaults` |

There is no settings module: it and its SQLite table were removed when no
consumers remained. Explorer defaults are delivered through `/api/config`.

## SPARQL adapters

- **`GenericSparqlAdapter`**: generic SPARQL 1.1 client (form-urlencoded POST). URL from `SPARQL_ENDPOINT_URL`; optional Basic Auth through `SPARQL_USERNAME`/`SPARQL_PASSWORD`; retry with backoff on 429; type normalization (uri, literal, coordinate WKT, date, bnode); graph construction (nodes + edges); and a one-hour predicate cache. Used for every `SPARQL_BACKEND` except `wikidata`.
- **`WikidataAdapter`**: extends the generic adapter with public entity search and a `wikibase:label` descriptor.
- **Interface:** `SparqlEndpoint { execute(), getPredicates(), backendName }` (`backendName: string` is the `SPARQL_BACKEND` value).

## SPARQL prefixes

- Source: `packages/explorer-backend/config/prefixes.${SPARQL_BACKEND}.json` (override: `SPARQL_PREFIXES_PATH`). The repository includes `prefixes.wikidata.json`; private configurations use ignored local files.
- Exposed as `defaultPrefixes` by `GET /api/config`.
- **rdf_explorer** uses them for query generation and URI abbreviation in the describe panel.
- **rdf_gis_explorer** seeds the `PREFIX ...` block in the CodeMirror editor (`SparqlInputComponent.seedDefaultPrefixes()`) when starting with an empty editor and when creating a new dashboard. It never overwrites a handoff or loaded dashboard.
- The backend **does not** inject prefixes during execution: queries must be self-contained (front- and backend `sparqljs` validation requires this).
- The backend `Dockerfile` copies `config/`; update it if new configuration files are placed elsewhere.

## Front↔back contracts: `@rdfgis/contracts`

The single source of truth is **`packages/contracts/src/`** (`query-result.ts`,
`query-summary.ts`, `app-config.ts`, `dashboard.ts`). Historical files
(`packages/explorer-backend/src/shared/dto/query-result.dto.ts`, `products/gis-explorer/frontend/src/app/shared/models/*`, `products/rdf-explorer/frontend/src/app/core/endpoint-adapter.ts`, etc.) are type-only
re-exports. **Make contract changes ONLY in the package**; tsc propagates and
validates them across all four applications. The types-only package is in
`devDependencies` (`workspace:*`), so it enters neither federation's
`shareAll` nor runtime bundles. Its `prepare` script builds it
on every `pnpm install`.

```typescript
QueryResult {
  variables: string[]
  bindings: ResultBinding[]      // raw rows
  nodes: NormalizedNode[]        // normalized graph
  edges: NormalizedEdge[]
  meta: { durationMs, truncated, limitApplied, backend }  // backend: string
}

BindingValue = { type: 'uri' } | { type: 'literal' } | { type: 'bnode' } | { type: 'coordinate' } | { type: 'date' }

NormalizedNode { uri, label, queryVariable?, classes?, classification?, attributes, coordinate?, temporalEvents?, flags? }
NormalizedEdge { id, source, target, predicate, predicateLabel? }
```

## RDF Explorer — graph domain

The heart of rdf_explorer is a pure domain model (without Angular) in
`graph/domain/`:

- **`PropertyGraph`**: node and edge container. Mutations, query building (BFS → SPARQL), and drop handling.
- **`RDFResource`** (abstract) → `Node`, `Property`, `Literal`. Each has a `Variable` (alias, filters).
- **`Query`**: generates SPARQL from the graph using BFS, triples, OPTIONALs, VALUES, FILTERs, and SERVICE wikibase:label. Date filters (`datefrom`/`dateto`) serialize as `^^xsd:dateTime`; `toSparql()` automatically declares `PREFIX xsd:` when needed (sparqljs requires it for validation). `toSparqlFullProjection()` projects ALL variables (selectAll plus removal of empty `?<literal>Label` variables, without mutating state). It is used for **handoff to GIS** (`main.component.handoffToGis`, `sparql-panel.handoffQuery`); the minimal `toSparql()` projection would leave GIS without coordinates, dates, or edges. The demo-dashboard seed uses the same method for the GIS query, so runtime handoff and seeded dashboards produce the same query.
- **`Filter`**: 9 types (text, lang, regex, leq, geq, isuri, isliteral, datefrom, dateto).
- **`GraphSerializer`**: serializes/deserializes PropertyGraph ↔ JSON for persistence.
- **`PropertyGraphService`**: Angular wrapper with signals and a `revision` counter for reactivity.
- **`CanvasGraphComponent`**: Cytoscape.js with compound nodes, edgehandles, context menus, and drag-and-drop.

## RDF GIS Explorer — coordinated views

Four views are synchronized through `SelectionService` (BehaviorSubject):

| View | Library | Filters by | Emits |
|------|---------|------------|-------|
| Table | AG Grid 35 (`rowSelection` with the object API ≥32.2) | Quick filter | select, focus |
| Map | Leaflet 1.9 + markercluster + draw | GeoFilter (polygon) | select, focus |
| Graph | Cytoscape 3.34 (cola+dagre) | Config-driven node cap (`limits.graphMaxNodes`, default 300; the selected node always enters the budget, and a runtime cap change rebuilds the view once). Top-N trimming and class coloring in pure `graph-view/graph-elements.ts` | select, focus |
| Timeline | vis-timeline 8.x | TemporalFilter (range) | select, focus |

**Coordinated View:** each view emits `setFocus(uris)` when panning/zooming.
The others adjust their viewport. A global navbar toggle controls this
behavior.

**Graph entity mode:** activated only through the `Ver estructura` action on
an explicit selection; coordinated focus never changes the mode or root. It
operates exclusively on the retrieved `QueryResult`, without additional
SPARQL. Pure logic lives in `features/graph-view/entity-subgraph.ts` (deterministic selection, paths,
hubs, budget) and `entity-exploration.ts` (root, active node, branches, pins,
history). State is transient; leaving restores camera/layout/level.
`entity-summary-text.ts` and `entity-structure.ts` generate view/structure copies with
full URIs, opaque blank nodes, and exact multiplicities; `EntitySummaryClipboardService`
implements clipboard plus manual fallback.

**SelectionService:** central source of truth. `queryResult$`,
`selectedNode$`, `activeFilters$`, `focus$`, `filteredQueryResult$`
(applies geo + temporal filters), `visibleQueryResult$` (consumed by all four
views: filtered result restricted to the current batch plus pinning),
`lotState$`, `lotSize$`, and `currentLot$`. Batch methods:
`setLotSize()`, `setCurrentLot()`, `nextLot()`, `previousLot()`.

**Global batches with pinning:** when the filtered result exceeds
`lotSize` **rows** (default 300, config-driven through
`limits.lotDefaultSize`/`lotSizeOptions`), all four views show **the same batch**.
Pure logic lives in `shared/stats/lots.ts` (`sliceLot`, `restrictResultToUris`).
The batch paginates `bindings` in **original query order**, never
sorting them. Visible nodes are the URIs/bnodes from batch rows **plus their
one-hop neighbors** through `edges`, recovering intermediate nodes
removed from the SELECT by backend `pickVariables`; visible edges connect
visible nodes. Bnodes are normalized through `bindingGraphId` (rows contain
raw `b0`; nodes/edges use `_:b0`). The selected node
is **injected** into the visible batch even when no batch row references it,
together with its edges to visible nodes; deselection removes it. New query →
batch 1; filtering retains a still-valid batch and clamps it when
`lotCount` shrinks. With one batch, `visibleQueryResult$` is identical to
`filteredQueryResult$` (no overhead). The navbar batch navigator
(`"Lote X de N · T filas"`, previous/next, size selector, warning icon when the
backend truncated, volume-warning tooltip) appears only when N > 1.

**Coverage chips:** pure helper `shared/stats/coverage-stats.ts` (`computeCoverageStats`) plus
`shared/components/coverage-chip`. Alert counts include only **main entities** (nodes with
their own attributes, coordinate, or temporal events); structural model nodes
(features, addresses, geometries) do not count as lacking coordinates/dates.
Map (`"Mostrando X de N entidades[ del lote] · Y sin coordenada"`), timeline (same with `"sin fecha"`), and graph
(`"Lote X de N · M filas"`, or `"Mostrando 300 de N nodos (top por conexiones)"` when the visible batch exceeds
`MAX_NODES`) compute over the visible batch. The chip is hidden when
there is no alert.

**Summary panel:** collapsible `features/dashboard/summary-panel` below the navbar plus pure
`shared/stats/result-summary.ts` helpers (`classifyVariables`, `computeLocalSummary`). It shows
aggregates (total rows, avg/min/max per numeric variable, temporal range, top
12 values per categorical variable) over **the complete query result**, unlike
coverage chips describing the visible batch. View filters do not affect it.
Classification is heuristic and domain-agnostic: numeric if ≥90% of non-null
values are numeric literals, temporal if normalized type is `date`,
categorical if ≤20 distinct values; caps 3/2/3. Non-truncated results are
computed locally; truncated results call `POST /api/query/summary`, which wraps the
query as a subquery (PREFIX at the outer level, `?__agg_*` aliases,
per-section degradation through `failed`). It recalculates only for a
new query (`queryResult$`), not batch or filter changes. It publishes the
latest `QuerySummary` through `SummaryStateService` (export uses its COUNT for
real progress).

**Full Excel export (XLSX):** the navbar's `Exportar Excel` button is the
application's sole export point. Pure logic lives in `shared/export/`
(`export-query.ts`, `result-exporter.ts`, `xlsx.ts`) with Angular glue in
`ResultExportService`. It wraps the user's query as a subquery with
`ORDER BY` over ALL projected variables (total order for deterministic
OFFSET/LIMIT pagination; an existing ORDER BY is honored) and traverses the
**complete result** page by page (page size = config `maxLimit`) by
calling `/api/query/execute` with `raw: true` (no graph or intermediate-node
projection). Page timeout → retry at half size (2000→1000→500, minimum
250). At 50,000 rows a dialog offers partial export marked `PARCIAL`,
query copy, or cancel. Progress uses the summary COUNT when available. A
non-truncated result exports directly from the client. Like summary, it does
not export the visible batch or apply view filters. The `exceljs`
workbook has a `Resultado` sheet (formatted header, frozen row,
autofilter, content-adjusted widths, typed number/date cells) and a
`Proveniencia` sheet (backend, query, ISO timestamp, rows,
`PARCIAL` marker); each row retains full URIs and opaque bnodes.

**Staged loading dialog:** when opening a dashboard (`?dashboardId=…` or the
`Tableros` menu), the `features/dashboard/load-progress` overlay shows the required
stages and duration: `Recuperando el tablero` (`GET /api/dashboards/:id` plus layout/filters),
`Ejecutando la consulta` (`POST /api/query/execute`; final detail includes rows, endpoint
`meta.durationMs`, and truncation), `Procesando resultados`, and `Renderizando vistas`.
Summary is computed separately and appears later in its panel, so it is not
part of the dialog. State lives in signal-based `DashboardLoadProgressService` over pure
`shared/progress/load-stages.ts` (immutable reducers + `formatDuration`);
`DashboardPersistenceService` manages it, and views call `reportViewRendered`. The dialog
closes after **the layout's views** render (`expectViews(layout.visibleSlots())`), with a
2.5-second margin if one does not report. Because `SelectionService` fan-out is
synchronous, declare `expectViews` **before** `setQueryResult`.
`DashboardPersistenceService.isHydrating` remains the data flag, not the dialog flag.

## Persistence

- **GIS dashboards:** `DashboardPersistenceService` serializes query + layout + filters + selection to `/api/dashboards` (`kind: 'gis'`).
- **Explorer workspaces:** `WorkspacePersistenceService` serializes panels (tabs) + graph to `/api/dashboards` (`kind: 'explorer'`). Dashboard and tab names are independent but synchronized for **single-panel** workspaces: on save, the dialog renames the active panel to the workspace name (`main.component.openSaveDialog`); on load (`loadWorkspaceAsTabs`), the single tab takes the dashboard `name`, so seeded/legacy dashboards with short panel names such as `WWII battles` display the dashboard name. Multi-panel workspaces retain each tab name.
- **GIS layout:** `localStorage` (`rdf-gis-explorer:dashboard-layout`)—pure UI state.
- **Handoff:** `sessionStorage` (`platform.handoff.pending`) + `CustomEvent`; `localStorage` (`platform.handoff.autoRun`) stores the auto-run preference.

## Dashboard SQLite persistence

The Shell keeps its SQLite files in `products/shell/backend/data/` (override:
`DASHBOARDS_SQLITE_PATH`). Explorer backends do not persist dashboards.

```bash
cd products/shell/backend
pnpm run clean:unused-data          # reports unused SQLite files, exits 1 if any exist
pnpm run clean:unused-data:force    # deletes them (including -shm/-wal siblings)
```

`SPARQL_PROTECTED_BACKENDS` (default `wikidata`) controls which files in
`data/` remain even when not active.

## Runtime configuration — `GET /api/config`

Derived from environment variables plus `config/prefixes.*.json`. Read-only for
clients:

```ts
AppConfig {
  backend, endpointUrl, hasBasicAuth, userAgent, timeoutMs, defaultLimit, maxLimit,
  capabilities, supportsWikibaseLabel, defaultPrefixes, search,
  labelUri,     // defaults to rdfs:label
  describe,     // UI hints: { exclude, objects, datatype, text, image, external }
  classColors,  // colors by class (config/class-colors.${SPARQL_BACKEND}.json; {} if absent)
  defaults,     // Explorer defaults (lang, resultLimit, labelUri, searchClass, endpointType)
  limits,       // unified backend-env limits: { graphMaxNodes, lotDefaultSize,
                //   lotSizeOptions[], tablePageSizeOptions[], exportMaxRows,
                //   exportMinPageSize, summaryTopCategorical }
}
```

**Limits channel:** all query and visualization limits live in backend
environment variables (see the README table) and travel in `AppConfig.limits`.
GIS consumes them through `LimitsService` (a signal with equivalent defaults
until configuration arrives; `App` updates it in
`ngOnInit`): graph (`graphMaxNodes`), batches
(`lotDefaultSize`/`lotSizeOptions`, clamping the current size when it falls
outside the new offering), table (`tablePageSizeOptions`), and export
(`exportMaxRows`/`exportMinPageSize`).

Each frontend has its own `AppConfigService`, deliberately duplicated because of
federation, and caches the response. Wikidata-specific URIs (describe hints,
searchClass Q5) live in its adapter descriptor; other endpoints receive neutral
RDF defaults. Class colors load from `packages/explorer-backend/config/class-colors.${SPARQL_BACKEND}.json` (override:
`CLASS_COLORS_PATH`) and remain empty if absent.

## Environment variables

See `.env` (tracked Wikidata configuration) and `README.md#sparql-configuration`.
There is no `LOG_LEVEL` or `SQLITE_PATH`.

## TypeScript path aliases

### rdf_gis_explorer

```
@shared/*   → src/app/shared/*
@core/*     → src/app/core/*
@features/* → src/app/features/*
```

## Important notes

- There are **no NgModules** in the frontend. Everything uses standalone components + `provideX()` in `app.config.ts`.
- The Shell **does NOT expose components** as a remote; it only consumes remotes. Its `app.config.ts` has no initializers (the former Shell `SettingsService` was removed because nothing consumed its result).
- **Frontend tests:** each `angular.json` test target sets `buildTarget: <project>:esbuild:development` + `runner: vitest` (the native-federation `build` target cannot compile tests). `tsconfig.spec.json` must include `src/polyfills.ts`. In specs, `vi.mock` factories are hoisted; helpers shared by the factory and tests belong inside `vi.hoisted()` (see the `graph-view` and `timeline-view` specs).
- **SPARQL interpolation:** never interpolate user input into a literal without escaping `\`, `"`, `'`, and line breaks (backend: `escapeSparqlLiteral` in `suggestions.service.ts`; explorer: `escapeKeyword`). With `String.replace`, pass replacement as a function so `$&`/`$'` are not expanded. Validate external URIs with `isValidUri` before inserting them into `VALUES { <...> }`.
- **Docker:** images build with the repository root as context (`docker-compose.yml` uses `context: .` + `dockerfile: <dir>/Dockerfile`) to share the workspace lockfile and common packages. The pattern copies manifests and patches, installs the workspace filter, and builds its dependencies. The dashboard volume mounts at `/repo/products/shell/backend/data`.
- **Cytoscape:** do NOT pass `wheelSensitivity` in options, even as `1.0`. The default is already 1, and Cytoscape ≥3.31 normalizes scrolling by `deltaMode` (integrated Firefox/Linux fix); specifying it only triggers a warning.
- **Known benign warning:** `wrong event specified: touchleave` comes from Leaflet 1.9 + leaflet-draw upstream; it is not our bug.
- The GIS remote's **APP_INITIALIZER** (`rdf_gis_explorer/app.config.ts`) runs only standalone. When loaded as a remote, configuration loads asynchronously (`App.ngOnInit` / `AppConfigService.load()` with `shareReplay`). Do not assume configuration is synchronously available in GIS components.
- The backend **does NOT use an ORM.** It uses direct SQL queries with `better-sqlite3`.
- **`sparqljs`** is used in the backend for validation and in GIS for frontend validation.
- **Unified limits (historical coupling resolved):** there is no hard-coded `@Max(2000)` in the DTO or fixed caps in front/back. All limits are backend environment variables delivered through `AppConfig.limits` (see Limits channel under `/api/config`). GIS **does not send its own limit**: `ApiService.executeQuery` without an explicit `limit` requests the backend's published `maxLimit`; the client paginates volume through batches.
- **Invalid WKT does not abort a query:** when a `wktLiteral` cannot be parsed as a Point (dirty data such as `POINT(None None)`), the adapter degrades it to a plain literal instead of throwing (`generic-sparql.adapter.ts` `normalizeValue`).

## Git rule

**Do not commit or push without explicit user approval.** `git add`,
`git status`, `git diff`, `git fetch`, and other reads are
allowed; anything that changes history/state (`commit`,
`push`, `merge`, `rebase`, `reset`,
`branch -D`, `tag`, `cherry-pick`, `revert`,
`--force`, etc.) requires authorization in the same turn
(`commit it` / `make a commit` / `push it`). When
authorized, commits are signed under the user's git configuration and never
include a Claude Co-Authored-By trailer.
