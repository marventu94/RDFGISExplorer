# AGENTS.md — RDF GIS Explorer

## Arquitectura General

Plataforma de micro-frontends con **Module Federation** (`@angular-architects/native-federation`, sin Webpack).

```
AppShell (host, :4200)
├── /           → WelcomePage (dashboards recientes)
├── /settings   → SettingsPage
├── /explorer   → remote: rdf_explorer (:4201) → MainComponent
├── /gis        → remote: rdf_gis_explorer (:4202) → App
└── /dashboards/:id → dashboardRedirectGuard → redirige segun kind

Backend NestJS (:3000)
├── /api/query/execute      → Ejecuta SPARQL via adaptador
├── /api/dashboards (CRUD)  → SQLite (better-sqlite3)
├── /api/suggestions        → Autocompletado predicados
└── /api/health             → Health checks
```

## Estructura del Monorepo

| Proyecto | Path | Framework | PM | Test Runner | Puerto |
|----------|------|-----------|-----|-------------|--------|
| Root | `/` | concurrently | npm | - | - |
| Backend | `backend/` | NestJS 11 | npm | Jest 30 | 3000 |
| App Shell | `frontend/app_shell/` | Angular 21 | pnpm 10 | Vitest 4 | 4200 |
| RDF Explorer | `frontend/rdf_explorer/` | Angular 21 | pnpm 10 | Vitest 4 | 4201 |
| RDF GIS Explorer | `frontend/rdf_gis_explorer/` | Angular 21 | pnpm 10 | Vitest 4 | 4202 |

## Comandos

```bash
# Dev (levanta todo)
npm run dev

# Backend
cd backend && npm run start:dev    # dev server
cd backend && npm test             # unit tests (Jest)
cd backend && npm run lint         # ESLint

# Frontend (cada app por separado)
cd frontend/app_shell && pnpm test       # Vitest
cd frontend/rdf_explorer && pnpm test    # Vitest
cd frontend/rdf_gis_explorer && pnpm test # Vitest
```

## Convenciones de Codigo

### Backend (NestJS)
- **Patron:** Hexagonal (Ports & Adapters). `SparqlEndpoint` es el puerto, `WikidataAdapter`/`MillenniumDBAdapter` son adaptadores.
- **DI tokens:** Symbols (`SPARQL_ENDPOINT`, `DASHBOARDS_DB`), no strings.
- **DTOs:** `class-validator` + `class-transformer`. Validacion global con `ValidationPipe({ transform: true, whitelist: true })`.
- **Errores:** `HttpExceptionFilter` global mapea `TimeoutError`→408, `UpstreamError`→502, `NotImplementedError`→503.
- **DB:** `better-sqlite3` sincronico, WAL mode. Tabla `dashboards` con JSON opaco en columna `payload`.
- **Tests:** Jest con `nock` para mock HTTP, `supertest` para endpoints, `@nestjs/testing` para modules.

### Frontend (Angular 21)
- **Standalone components** en toda la app. Sin NgModules.
- **Reactividad:** Angular Signals (`signal`, `computed`, `effect`) + RxJS `BehaviorSubject` donde aplica.
- **Module Federation:** Cada remote expone un solo componente via `federation.config.js` → `exposes: { './Component': '...' }`.
- **Shared deps:** `shareAll({ singleton: true, strictVersion: true })` — todas las deps son singletons compartidos.
- **Estilos:** SCSS inline en componentes. Angular Material theme en `styles.scss` del shell.
- **Tests:** Vitest (no Karma/Jasmine). Archivos `*.spec.ts` junto al codigo.

### Comunicacion Shell ↔ Remotes
- **QueryHandoffService:** `sessionStorage` + `CustomEvent('query-handoff')` + `storage` event. TTL 5 min. Semantica de un solo uso (`consume()`).
- **Dashboards:** API REST `/api/dashboards`. El shell tiene `DashboardStoreService` reactivo. Los remotes tienen sus propios API clients.
- **Proxy dev:** Cada frontend tiene `proxy.conf.json` que redirige `/api` → `http://localhost:3000`.

## Modulos del Backend

| Modulo | Path | Responsabilidad |
|--------|------|-----------------|
| `SparqlModule` | `modules/sparql/` | `@Global()`. Provee token `SPARQL_ENDPOINT` via factory segun `SPARQL_BACKEND` env |
| `QueryModule` | `modules/query/` | Ejecuta SPARQL. Valida con `sparqljs.Parser`. Aplica limites y timeout |
| `DashboardsModule` | `modules/dashboards/` | CRUD dashboards en SQLite. Payload JSON opaco. Valida `kind` ∈ {gis, explorer} |
| `SuggestionsModule` | `modules/suggestions/` | Autocompletado de predicados. Cache en memoria (1h TTL) |
| `HealthModule` | `modules/health/` | Health check basico + verificacion real del endpoint SPARQL |

## Adaptadores SPARQL

- **`WikidataAdapter`** (completo): Retry con backoff en 429, normalizacion de tipos (uri, literal, coordinate, date, bnode), construccion de grafo (nodes+edges), cache de predicados.
- **`MillenniumDBAdapter`** (stub): Lanza `NotImplementedError`. Pendiente fase 2.
- **Interfaz:** `SparqlEndpoint { execute(), getPredicates(), backendName }`.

## Contrato Front↔Back: `QueryResult`

Definido en `backend/src/shared/dto/query-result.dto.ts` y espejado en `frontend/rdf_gis_explorer/src/app/shared/models/`.

```typescript
QueryResult {
  variables: string[]
  bindings: ResultBinding[]      // filas raw
  nodes: NormalizedNode[]        // grafo normalizado
  edges: NormalizedEdge[]
  meta: { durationMs, truncated, limitApplied, backend }
}

BindingValue = { type: 'uri' } | { type: 'literal' } | { type: 'bnode' } | { type: 'coordinate' } | { type: 'date' }

NormalizedNode { uri, label, type?, attributes, coordinate?, temporalEvents?, flags? }
NormalizedEdge { id, source, target, predicate, predicateLabel? }
```

## RDF Explorer — Dominio del Grafo

El corazon de rdf_explorer es un **modelo de dominio puro** (sin Angular) en `graph/domain/`:

- **`PropertyGraph`**: Contenedor de nodes, edges. Mutaciones, query building (BFS → SPARQL), drop handling.
- **`RDFResource`** (abstract) → `Node`, `Property`, `Literal`. Cada uno tiene `Variable` (alias, filtros).
- **`Query`**: Genera SPARQL desde el grafo. BFS, triples, OPTIONALS, VALUES, FILTERs, SERVICE wikibase:label.
- **`Filter`**: 9 tipos (text, lang, regex, leq, geq, isuri, isliteral, datefrom, dateto).
- **`GraphSerializer`**: Serializa/deserializa PropertyGraph ↔ JSON para persistencia.
- **`PropertyGraphService`**: Wrapper Angular con signals. `revision` counter para reactividad.
- **`CanvasGraphComponent`**: Cytoscape.js con compound nodes, edgehandles, context-menus, drag&drop.

## RDF GIS Explorer — Vistas Coordinadas

4 vistas sincronizadas via `SelectionService` (BehaviorSubject):

| Vista | Libreria | Filtra por | Emite |
|-------|----------|-----------|-------|
| Table | AG Grid 35 | Quick filter | select, focus |
| Map | Leaflet 1.9 + markercluster + draw | GeoFilter (polygon) | select, focus |
| Graph | Cytoscape 3.33 (cola+dagre) | Max 300 nodos | select, focus |
| Timeline | vis-timeline 8.5 | TemporalFilter (rango) | select, focus |

**Coordinated View:** Cada vista emite `setFocus(uris)` al hacer pan/zoom. Las demas ajustan su viewport. Toggle global en navbar.

**SelectionService:** Fuente central de verdad. `queryResult$`, `selectedNode$`, `activeFilters$`, `focus$`, `filteredQueryResult$` (aplica filtros geo+temporal).

## Persistencia

- **Dashboards GIS:** `DashboardPersistenceService` serializa query + layout + filtros + seleccion → POST `/api/dashboards`.
- **Workspaces Explorer:** `WorkspacePersistenceService` serializa paneles (tabs) + grafo → POST `/api/dashboards`.
- **Layout GIS:** `localStorage` (`rdf-gis-explorer:dashboard-layout`).
- **Settings Explorer:** `localStorage` (`rdfexplorer.settings.v1`).
- **Handoff:** `sessionStorage` (`platform.handoff.pending`) + `CustomEvent`.
- **AutoRun handoff:** `localStorage` (`platform.handoff.autoRun`).

## Routing del Shell

| Path | Carga | Componente |
|------|-------|------------|
| `/` | Lazy local | `WelcomePageComponent` |
| `/settings` | Lazy local | `SettingsPageComponent` |
| `/explorer` | `loadRemoteModule('rdf_explorer')` | `MainComponent` |
| `/gis` | `loadRemoteModule('rdf_gis_explorer')` | `App` |
| `/dashboards/:id` | Guard redirect | `dashboardRedirectGuard` → `/gis?dashboardId=` o `/explorer?workspaceId=` |

## Variables de Entorno

Ver `.env.example`. Las principales:

| Variable | Default | Uso |
|----------|---------|-----|
| `SPARQL_BACKEND` | `wikidata` | `wikidata` o `millenniumdb` |
| `SPARQL_USER_AGENT` | `rdf-gis-explorer/0.1` | Obligatorio para Wikidata |
| `SPARQL_TIMEOUT_MS` | `30000` | Timeout en ms |
| `SPARQL_DEFAULT_LIMIT` | `500` | Limite por defecto |
| `SPARQL_MAX_LIMIT` | `2000` | Limite maximo |
| `BACKEND_PORT` | `3000` | Puerto backend |
| `CORS_ORIGINS` | `http://localhost:4200` | CORS |
| `DASHBOARDS_SQLITE_PATH` | `./data/dashboards.sqlite` | Path SQLite |

## Path Aliases (TypeScript)

### rdf_gis_explorer
```
@shared/*  → src/app/shared/*
@core/*    → src/app/core/*
@features/* → src/app/features/*
```

## Notas Importantes

- **No hay NgModules** en el frontend. Todo es standalone components + `provideX()` en `app.config.ts`.
- **El shell NO expone componentes** como remote. Solo consume remotes.
- **rdf_explorer expone** `MainComponent` (pagina completa de 3 paneles).
- **rdf_gis_explorer expone** `App` (componente raiz con navbar + dashboard).
- **`leaflet-global.ts`** en GIS: hack para federation — setea `window.L = L` para plugins CJS.
- **Patch de `@softarc/native-federation`** en GIS: `patches/@softarc__native-federation@3.5.5.patch`.
- **El backend NO usa ORM.** Queries SQL directas con `better-sqlite3`.
- **`sparqljs`** se usa tanto en backend (validacion) como en GIS (validacion en el frontend).
- **Fases futuras:** MillenniumDB adapter, curation records, duplicate detection (tablas en `db/migrations.sql` no migradas).
