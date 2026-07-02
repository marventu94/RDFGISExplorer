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
├── /api/settings (GET/PUT) → Preferencias del usuario (SQLite, singleton)
├── /api/config             → Configuracion runtime (env) + defaults
└── /api/health             → Health checks
```

## Estructura del Monorepo

| Proyecto | Path | Framework | PM | Test Runner | Puerto |
|----------|------|-----------|-----|-------------|--------|
| Root | `/` | concurrently | npm | - | - |
| Backend | `backend/` | NestJS 11 / Node.js 24.18.0 | npm | Jest 30 | 3000 |
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
- **Patron:** Hexagonal (Ports & Adapters). `SparqlEndpoint` es el puerto, `GenericSparqlAdapter`/`MillenniumDBAdapter` son adaptadores.
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
| `SuggestionsModule` | `modules/suggestions/` | Autocompletado de predicados + busqueda de entidades (`/api/suggestions/entities`) |
| `HealthModule` | `modules/health/` | Health check basico + verificacion real del endpoint SPARQL |
| `AppConfigModule` | `modules/app-config/` | `GET /api/config`: runtime config (env) + `labelUri`, `describe` y `defaults` para nuevas settings |
| `SettingsModule` | `modules/settings/` | `GET/PUT /api/settings`: preferencias del usuario en SQLite (singleton, JSON opaco en `data`) |

## Adaptadores SPARQL

- **`GenericSparqlAdapter`** (completo): Cliente SPARQL 1.1 generico. URL configurable via `SPARQL_ENDPOINT_URL`. Soporte opcional de Basic Auth via `SPARQL_USERNAME`/`SPARQL_PASSWORD`. Retry con backoff en 429, normalizacion de tipos (uri, literal, coordinate, date, bnode), construccion de grafo (nodes+edges), cache de predicados. `SPARQL_BACKEND=wikidata` es un alias que usa este adaptador por compatibilidad historica.
- **`MillenniumDBAdapter`** (stub): Lanza `NotImplementedError`. Pendiente fase 2.
- **Configuracion runtime:** `GET /api/config` expone backend, endpoint URL, capabilities, `supportsWikibaseLabel` y configuracion de busqueda. Los frontends consumen este endpoint para adaptar UI (search, seed queries, handoff).
- **Busqueda de entidades:** `GET /api/suggestions/entities` usa `wbsearchentities` para Wikidata o `SPARQL_ENTITY_SEARCH_QUERY` para backends genericos.
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
- **Settings Explorer:** `SettingsService` consume `GET/PUT /api/settings` (SQLite). El front no tiene estado persistente propio. `load()` se ejecuta en `APP_INITIALIZER`.
- **Layout GIS:** `localStorage` (`rdf-gis-explorer:dashboard-layout`) — UI state puro, no es config.
- **Handoff:** `sessionStorage` (`platform.handoff.pending`) + `CustomEvent`.
- **AutoRun handoff:** `localStorage` (`platform.handoff.autoRun`) — preferencia de UX per-device.

## Configuracion y Settings

Dos endpoints, dos responsabilidades, una sola fuente de verdad (el backend):

### Runtime config — `GET /api/config` (read-only para el cliente)

Derivado de variables de entorno. Configura el comportamiento de toda la plataforma:

```ts
AppConfig {
  backend, endpointUrl, hasBasicAuth, userAgent, timeoutMs, defaultLimit, maxLimit,
  capabilities, supportsWikibaseLabel, defaultPrefixes, search,
  labelUri,            // rdfs:label por default
  describe,            // UI hints: { exclude, objects, datatype, text, image, external }
  defaults             // bootstrap para nuevas settings (SettingsDefaults)
}
```

`AppConfigService` (frontend) cachea esta respuesta y la expone como `signal<AppConfig | null>`. Consumidores: `DescribeService` (usa `describe`), `PropertyGraphService` (usa `defaultPrefixes`), `SettingsService` (usa `defaults`).

### Preferencias del usuario — `GET/PUT /api/settings` (persiste en SQLite)

Tabla `settings` con un único registro (`id = 1`, columna `data` JSON opaco, `updated_at`). El front no toca SQLite directo — todo via API:

```ts
AppSettings {
  lang, labelUri, searchClass, resultLimit, wikibaseAdapter, endpointType, endpointLabel
}
```

Validación con `class-validator` (DTOs en `modules/settings/dto/`). Errores → 400 con `{ error: 'INVALID_SETTINGS' }`.

`SettingsService` (frontend) inyecta `AppConfigService` + `SettingsApiService`:
- En el constructor, bootstrap con los `defaults` de la config
- `load()` (async) hace GET y sobreescribe con lo persistido
- `update(key, value)` aplica local + PUT fire-and-forget; rollback si falla
- `reset()` restaura defaults + PUT full

### Lo que NO se persiste

- **Endpoint URL**: viene de `SPARQL_ENDPOINT_URL` (env). El front no puede apuntar a otro endpoint sin tocar el backend.
- **Prefixes**: vienen de `AppConfig.defaultPrefixes`. Neutrales (rdf, rdfs) o Wikidata (wd, wdt, etc.) según el backend activo.
- **Wikidata/Dbpedia hardcodeados**: eliminados. Los URIs específicos de Wikidata viven en `AppConfigService` solo cuando `backend === 'wikidata'`.

## Routing del Shell

| Path | Carga | Componente |
|------|-------|------------|
| `/` | Lazy local | `WelcomePageComponent` |
| `/settings` | Lazy local | `SettingsPageComponent` |
| `/explorer` | `loadRemoteModule('rdf_explorer')` | `MainComponent` |
| `/gis` | `loadRemoteModule('rdf_gis_explorer')` | `App` |
| `/dashboards/:id` | Guard redirect | `dashboardRedirectGuard` → `/gis?dashboardId=` o `/explorer?workspaceId=` |

## Variables de Entorno

Ver archivos `.env`, `.env.wikidata` y `.env.graphdb.example`. Las principales:

| Variable | Default | Uso |
|----------|---------|-----|
| `SPARQL_BACKEND` | `wikidata` | `generic`, `wikidata` (alias de generic) o `millenniumdb` |
| `SPARQL_ENDPOINT_URL` | `https://query.wikidata.org/sparql` | URL del endpoint SPARQL. GraphDB: `/repositories/{repoId}` |
| `SPARQL_USERNAME` | — | Usuario para Basic Auth |
| `SPARQL_PASSWORD` | — | Password para Basic Auth |
| `SPARQL_USERNAME` | — | Usuario para Basic Auth |
| `SPARQL_PASSWORD` | — | Password para Basic Auth |
| `SPARQL_ENTITY_SEARCH_QUERY` | — | Query opcional para busqueda de entidades. Reemplaza `$keyword` y `$limit` |
| `SPARQL_USER` | `rdf-gis-explorer/0.1` | Obligatorio para Wikidata |
| `SPARQL_TIMEOUT_MS` | `30000` | Timeout en ms |
| `SPARQL_DEFAULT_LIMIT` | `500` | Limite por defecto |
| `SPARQL_MAX_LIMIT` | `2000` | Limite maximo |
| `BACKEND_PORT` | `3000` | Puerto backend |
| `CORS_ORIGINS` | `http://localhost:4200` | CORS |
| `DASHBOARDS_SQLITE_PATH` | `data/${SPARQL_BACKEND}.sqlite` | Path SQLite dashboards. Si está set, override del default. |
| `SETTINGS_SQLITE_PATH` | mismo que `DASHBOARDS_SQLITE_PATH` | Path SQLite settings. Por defecto reusa el de dashboards. |
| `SPARQL_PROTECTED_BACKENDS` | `wikidata,graphdb` | Backends cuyos archivos SQLite en `data/` se conservan al correr `npm run clean:unused-data`. |

## Persistencia SQLite por backend

Cada backend tiene su propio archivo SQLite, derivado de `SPARQL_BACKEND`:

| `SPARQL_BACKEND` | Archivo SQLite (default) |
|---|---|
| `wikidata` | `data/wikidata.sqlite` |
| `graphdb` | `data/graphdb.sqlite` |
| `generic` | `data/generic.sqlite` |
| `millenniumdb` | `data/millenniumdb.sqlite` |

`SETTINGS_SQLITE_PATH` reusa el de dashboards por default. Ambos paths pueden overridearse con sus env vars respectivas.

Limpieza de archivos sin uso:

```bash
cd backend
npm run clean:unused-data            # reporta candidatos, exit 1 si hay
npm run clean:unused-data:force     # los borra (incluye -shm/-wal siblings)
```

`SPARQL_PROTECTED_BACKENDS` (default `wikidata,graphdb`) controla qué archivos en `data/` se preservan aunque no sean el activo. Útil cuando el proyecto puede correr con varios backends.

`data/curation.db` y `data/dashboards.sqlite` (path pre-refactor) son detectados como `legacy-path` u `orphan-backend` y aparecen como candidatos por default.

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

## Regla de git

**No commitear ni pushear sin OK explicito del usuario.** Esta regla esta formalizada en el skill `no-commit-without-ok`. `git add`, `git status`, `git diff`, `git fetch` y demas lecturas son libres; todo lo que modifique el historial/estado (`commit`, `push`, `merge`, `rebase`, `reset`, `branch -D`, `tag`, `cherry-pick`, `revert`, `--force`, etc.) requiere autorizacion explicita en el mismo turno ("comitea" / "hace commit" / "subi"). Combinado con el skill `crear-commit`: cuando se autoriza, los commits se firman a nombre del usuario (config de git), nunca con Co-Authored-By de Claude.
