# AGENTS.md — RDF GIS Explorer

## Arquitectura General

Plataforma de micro-frontends con **Native Federation** (`@angular-architects/native-federation`, sin Webpack).

```
AppShell (host, :4200)
├── /               → WelcomePage (dashboards recientes)
├── /explorer       → remote: rdf_explorer (:4201) → MainComponent
├── /gis            → remote: rdf_gis_explorer (:4202) → App
├── /dashboards/:id → dashboardRedirectGuard → redirige según kind (gis/explorer)
└── /**             → redirect a /

Backend NestJS (:3000)
├── /api/query/execute      → Ejecuta SPARQL vía adaptador (opción `raw`: solo bindings, sin grafo — la usa el export)
├── /api/query/summary      → Agregados del resultado completo (COUNT/AVG/MIN/MAX, top valores)
├── /api/dashboards (CRUD)  → SQLite (better-sqlite3)
├── /api/suggestions        → Autocompletado predicados + búsqueda de entidades
├── /api/config             → Configuración runtime (env + prefixes) para los frontends
└── /api/health[/sparql]    → Health checks
```

Los tipos compartidos entre backend y frontends viven en **`packages/contracts`**
(`@rdfgis/contracts`, solo tipos): `QueryResult`, `AppConfig`, `Dashboard`.

## Estructura del Monorepo

Workspace **pnpm** (`pnpm-workspace.yaml` en la raíz): un solo `pnpm install` instala todo.

| Proyecto | Path | Framework | Test Runner | Puerto |
|----------|------|-----------|-------------|--------|
| Root | `/` | concurrently | — | — |
| Contracts | `packages/contracts/` | TypeScript (solo tipos) | — | — |
| Backend | `backend/` | NestJS 11 / Node.js 24.18.0 | Jest 30 | 3000 |
| App Shell | `frontend/app_shell/` | Angular 21 | Vitest 4 (vía `ng test`) | 4200 |
| RDF Explorer | `frontend/rdf_explorer/` | Angular 21 | Vitest 4 (vía `ng test`) | 4201 |
| RDF GIS Explorer | `frontend/rdf_gis_explorer/` | Angular 21 | Vitest 4 (vía `ng test`) | 4202 |

## Comandos

```bash
./start.sh                     # dev con hot reload; --env .env.graphdb para otro backend
npm run dev                    # igual, sin el bootstrap de nvm/corepack

cd backend && pnpm run start:dev   # backend solo
cd backend && pnpm test            # unit tests (Jest)
cd backend && pnpm run lint        # ESLint

cd frontend/<app> && pnpm test     # unit tests (Vitest vía ng test)
```

## Convenciones de Código

### Backend (NestJS)
- **Patrón:** Hexagonal (Ports & Adapters). `SparqlEndpoint` es el puerto; `GenericSparqlAdapter` / `MillenniumDBAdapter` son adaptadores. El factory (`sparql-endpoint.factory.ts`) elige por `SPARQL_BACKEND` y le pasa el nombre al adaptador (`backendName` refleja el valor configurado, se reporta en `/api/health` y `QueryResult.meta.backend`).
- **DI tokens:** Symbols (`SPARQL_ENDPOINT`, `DASHBOARDS_DB`), no strings.
- **DTOs:** `class-validator` + `class-transformer`. Validación global con `ValidationPipe({ transform: true, whitelist: true })`.
- **Errores:** `HttpExceptionFilter` global mapea `TimeoutError`→408, `UpstreamError`→502, `NotImplementedError`→503.
- **DB:** `better-sqlite3` sincrónico, WAL mode. Tabla `dashboards` con JSON opaco en columna `payload`.
- **Tests:** Jest con `nock` para mock HTTP, `supertest` para endpoints, `@nestjs/testing` para modules.

### Frontend (Angular 21)
- **Standalone components** en toda la app. Sin NgModules.
- **Reactividad:** Angular Signals (`signal`, `computed`, `effect`) + RxJS `BehaviorSubject` donde aplica.
- **Native Federation:** cada remote expone un solo componente vía `federation.config.js` → `exposes: { './Component': '...' }`.
- **Estilos:** SCSS por componente. Angular Material theme en `styles.scss` del shell.
- **Tests:** archivos `*.spec.ts` junto al código, corren con Vitest vía `ng test` (ver Notas Importantes).

### Shared deps de federation (¡leer antes de tocar `federation.config.js`!)
- Base: `shareAll({ singleton: true, strictVersion: true })` en host y remotes.
- **El host comparte `@angular/material` y `@angular/cdk` explícitamente con `includeSecondaries: { keepAll: true }`** aunque no los importe en su código. Motivo: con `ignoreUnusedDeps`, si el host no los provee, cada remote carga su PROPIA copia del CDK; con dos copias vivas aparecen los warnings NG0912 (Component ID collision) y `MatDialog` crashea (`this._portalOutlet is undefined`: el `viewChild(CdkPortalOutlet)` heredado no matchea la directiva de la otra copia). `keepAll: true` es lo que hace que la entrada sobreviva al filtro de `ignoreUnusedDeps`.
- **AG Grid es privativo del remote GIS** (está en su `skip`): si se comparte, el host lo omite del import map y el remote no resuelve el specifier.
- Leaflet, sparqljs, exceljs y otros CJS/UMD tampoco se comparten (skip en el remote GIS); `leaflet-global.ts` setea `window.L` para los plugins.
- Patch de `@softarc/native-federation` (`frontend/rdf_gis_explorer/patches/`): resuelve package.json de deps transitivas no-hoisted en el store de pnpm. Referenciado en `pnpm-workspace.yaml`.

### Comunicación Shell ↔ Remotes
- **QueryHandoffService** (duplicado deliberadamente en `rdf_explorer` y `rdf_gis_explorer`; los servicios de app no se pueden compartir por federation): `sessionStorage` + `CustomEvent('query-handoff')` + `storage` event. TTL 5 min. Semántica de un solo uso (`consume()`).
- **Dashboards:** API REST `/api/dashboards`. El shell tiene `DashboardStoreService` reactivo; los remotes tienen sus propios API clients. Todos usan URLs **relativas** (`/api/...`) — nunca hardcodear `http://localhost:3000` (rompe Docker; el proxy dev y nginx ya rutean `/api`).
- **Proxy dev:** cada frontend tiene `proxy.conf.json` que redirige `/api` → `http://localhost:3000`. En Docker, el `nginx.conf` de cada frontend hace lo mismo hacia `backend:3000`.

## Módulos del Backend

| Módulo | Path | Responsabilidad |
|--------|------|-----------------|
| `SparqlModule` | `modules/sparql/` | `@Global()`. Provee token `SPARQL_ENDPOINT` vía factory según `SPARQL_BACKEND` |
| `QueryModule` | `modules/query/` | Ejecuta SPARQL. Valida con `sparqljs.Parser`. Aplica límites y timeout. `POST /api/query/summary`: envuelve la query del usuario como subquery y agrega sobre el resultado completo |
| `DashboardsModule` | `modules/dashboards/` | CRUD dashboards en SQLite. Payload JSON opaco (máx 1MB). `kind` ∈ {gis, explorer} |
| `SuggestionsModule` | `modules/suggestions/` | Autocompletado de predicados + búsqueda de entidades |
| `HealthModule` | `modules/health/` | `/api/health` (usado por Docker) + `/api/health/sparql` (chequea el endpoint upstream) |
| `AppConfigModule` | `modules/app-config/` | `GET /api/config`: env + `defaultPrefixes` + `describe`/`classColors`/`defaults` |

(No hay módulo de settings: se eliminó junto con su tabla SQLite al quedar sin
consumidores. Los defaults que necesita el Explorer viajan en `/api/config`.)

## Adaptadores SPARQL

- **`GenericSparqlAdapter`** (completo): cliente SPARQL 1.1 genérico (POST form-urlencoded). URL vía `SPARQL_ENDPOINT_URL`, Basic Auth opcional (`SPARQL_USERNAME`/`SPARQL_PASSWORD`), retry con backoff en 429, normalización de tipos (uri, literal, coordinate WKT, date, bnode), construcción de grafo (nodes+edges), cache de predicados 1h. Se usa para cualquier `SPARQL_BACKEND` distinto de `millenniumdb`.
- **`MillenniumDBAdapter`** (stub): lanza `NotImplementedError`. Pendiente fase 2.
- **Interfaz:** `SparqlEndpoint { execute(), getPredicates(), backendName }` (`backendName: string` = valor de `SPARQL_BACKEND`).

## Prefixes SPARQL

- Fuente: `backend/config/prefixes.${SPARQL_BACKEND}.json` (override: `SPARQL_PREFIXES_PATH`). El repo trae `prefixes.wikidata.json` y `prefixes.graphdb.example.json`; `prefixes.graphdb.json` real está gitignoreado.
- Se exponen como `defaultPrefixes` en `GET /api/config`.
- **rdf_explorer** los usa en la generación de queries y para abreviar URIs (describe panel).
- **rdf_gis_explorer** precarga el bloque `PREFIX ...` en el editor CodeMirror (`SparqlInputComponent.seedDefaultPrefixes()`): al iniciar con editor vacío y al crear tablero nuevo. Nunca pisa un handoff ni un tablero cargado.
- El backend **no** inyecta prefixes al ejecutar: la query debe ser autocontenida (la validación con `sparqljs` en front y back lo exige).
- El `Dockerfile` del backend copia `config/` — si se agregan archivos de config nuevos fuera de esa carpeta, actualizar el Dockerfile.

## Contratos Front↔Back: `@rdfgis/contracts`

La fuente de verdad única es **`packages/contracts/src/`** (`query-result.ts`,
`query-summary.ts`, `app-config.ts`, `dashboard.ts`). Los archivos históricos
(`backend/src/shared/dto/query-result.dto.ts`, `frontend/rdf_gis_explorer/src/app/shared/models/*`,
`frontend/rdf_explorer/src/app/core/endpoint-adapter.ts`, etc.) son re-exports
type-only — **los cambios de contrato se hacen SOLO en el paquete** y tsc los
propaga/valida en las 4 apps. El paquete va en `devDependencies` (`workspace:*`):
al ser solo tipos no entra en el `shareAll` de federation ni en el runtime.
Se compila con su script `prepare` en cada `pnpm install`.

```typescript
QueryResult {
  variables: string[]
  bindings: ResultBinding[]      // filas raw
  nodes: NormalizedNode[]        // grafo normalizado
  edges: NormalizedEdge[]
  meta: { durationMs, truncated, limitApplied, backend }  // backend: string
}

BindingValue = { type: 'uri' } | { type: 'literal' } | { type: 'bnode' } | { type: 'coordinate' } | { type: 'date' }

NormalizedNode { uri, label, type?, attributes, coordinate?, temporalEvents?, flags? }
NormalizedEdge { id, source, target, predicate, predicateLabel? }
```

## RDF Explorer — Dominio del Grafo

El corazón de rdf_explorer es un **modelo de dominio puro** (sin Angular) en `graph/domain/`:

- **`PropertyGraph`**: contenedor de nodes, edges. Mutaciones, query building (BFS → SPARQL), drop handling.
- **`RDFResource`** (abstract) → `Node`, `Property`, `Literal`. Cada uno tiene `Variable` (alias, filtros).
- **`Query`**: genera SPARQL desde el grafo. BFS, triples, OPTIONALs, VALUES, FILTERs, SERVICE wikibase:label.
- **`Filter`**: 9 tipos (text, lang, regex, leq, geq, isuri, isliteral, datefrom, dateto).
- **`GraphSerializer`**: serializa/deserializa PropertyGraph ↔ JSON para persistencia.
- **`PropertyGraphService`**: wrapper Angular con signals. `revision` counter para reactividad.
- **`CanvasGraphComponent`**: Cytoscape.js con compound nodes, edgehandles, context-menus, drag&drop.

## RDF GIS Explorer — Vistas Coordinadas

4 vistas sincronizadas vía `SelectionService` (BehaviorSubject):

| Vista | Librería | Filtra por | Emite |
|-------|----------|-----------|-------|
| Table | AG Grid 35 (`rowSelection` con la API objeto ≥32.2) | Quick filter | select, focus |
| Map | Leaflet 1.9 + markercluster + draw | GeoFilter (polygon) | select, focus |
| Graph | Cytoscape 3.34 (cola+dagre) | Cap de nodos config-driven (`limits.graphMaxNodes`, default 300) | select, focus |
| Timeline | vis-timeline 8.x | TemporalFilter (rango) | select, focus |

**Coordinated View:** cada vista emite `setFocus(uris)` al hacer pan/zoom. Las demás ajustan su viewport. Toggle global en navbar.

**SelectionService:** fuente central de verdad. `queryResult$`, `selectedNode$`, `activeFilters$`, `focus$`, `filteredQueryResult$` (aplica filtros geo+temporal), `visibleQueryResult$` (lo que consumen las 4 vistas: el resultado filtrado restringido al lote actual + pinning), `lotState$`, `lotSize$`, `currentLot$`. Métodos de lotes: `setLotSize()`, `setCurrentLot()`, `nextLot()`, `previousLot()`.

**Lotes globales con pinning:** cuando el resultado filtrado supera `lotSize` **filas** (default 300, config-driven vía `limits.lotDefaultSize`/`lotSizeOptions`), las 4 vistas muestran **el mismo lote**. La lógica pura vive en `shared/stats/lots.ts` (`sliceLot`, `restrictResultToUris`): el lote pagina `bindings` en el **orden original de la query** (nunca se reordena). Los nodos visibles son los URIs/bnodes de las filas del lote **más sus vecinos a 1 salto** por `edges` (así se recuperan los nodos intermedios que el backend recorta del SELECT con `pickVariables`), y las edges visibles son las que conectan nodos visibles. El nodo seleccionado se **inyecta** en el lote visible aunque no esté referenciado por las filas del lote (con sus edges hacia nodos visibles); al deseleccionar deja de inyectarse. Query nueva → lote 1; al filtrar se conserva el lote si sigue válido y se clampea si `lotCount` se reduce. Con un solo lote `visibleQueryResult$` es idéntico a `filteredQueryResult$` (sin overhead). El navbar tiene el navegador de lotes ("Lote X de N · T filas", anterior/siguiente, selector de tamaño, icono de warning si el backend truncó; tooltip con el aviso de volumen) — solo visible cuando N > 1.

**Chips de cobertura:** helper puro `shared/stats/coverage-stats.ts` (`computeCoverageStats`) + componente `shared/components/coverage-chip`. Los conteos de alerta usan solo **entidades principales** (nodos con atributos, coordenada o eventos temporales propios); los nodos estructurales del modelo (features, direcciones, geometrías) no cuentan como "sin coordenada/fecha". Mapa ("Mostrando X de N entidades[ del lote] · Y sin coordenada"), timeline (ídem "sin fecha") y grafo ("Lote X de N · M filas", o "Mostrando 300 de N nodos (top por conexiones)" si el lote visible excede `MAX_NODES`). Computan sobre el lote visible; el chip se oculta cuando no hay alerta.

**Panel de resumen:** componente `features/dashboard/summary-panel` (colapsable, bajo el navbar) + helpers puros `shared/stats/result-summary.ts` (`classifyVariables`, `computeLocalSummary`). Muestra agregados (total de filas, avg/min/max por var numérica, rango por temporal, top 12 valores por categórica) computados sobre **el resultado completo de la query** — distinto de los chips de cobertura, que describen el lote visible. Los filtros de las vistas no lo afectan. La clasificación de variables es heurística y domain-agnostic (numérica si ≥90% de los valores no nulos son literales numéricos, temporal si el tipo normalizado es `date`, categórica si ≤20 valores distintos; caps 3/2/3). Si el resultado **no** está truncado se computa localmente; si está truncado se llama a `POST /api/query/summary`, que envuelve la query como subquery (PREFIX al nivel externo, alias `?__agg_*`, degradación por sección vía `failed`). Se recalcula solo con query nueva (`queryResult$`), no al cambiar de lote ni al filtrar. Publica el último `QuerySummary` en `SummaryStateService` (el export usa su COUNT para el progreso real).

**Export completo a Excel (XLSX):** botón "Exportar Excel" del navbar (único punto de exportación de la app). Lógica pura en `shared/export/` (`export-query.ts`, `result-exporter.ts`, `xlsx.ts`) + glue Angular en `ResultExportService`. Envuelve la query del usuario como subquery con `ORDER BY` sobre TODAS las variables proyectadas (orden total → paginación OFFSET/LIMIT determinista; si la query ya trae ORDER BY se respeta) y recorre el **resultado completo** página a página (página = `maxLimit` del config) llamando a `/api/query/execute` con `raw: true` (sin grafo ni proyección de intermedios). Timeout de página → reintento con página mitad (2000→1000→500, mínimo 250). Tope 50.000 filas → diálogo (exportar parcial marcado PARCIAL / copiar query / cancelar). Progreso real con el COUNT del summary si está disponible. Si el resultado **no** está truncado exporta directo desde el cliente (sin paginar). Misma semántica que el summary: no exporta el lote visible ni aplica los filtros de las vistas. El workbook (generado con `exceljs`) lleva hoja "Resultado" (encabezado con formato, fila congelada, autofiltro, anchos ajustados al contenido, celdas tipadas: números y fechas como valores, no texto) y hoja "Proveniencia" (backend, query, timestamp ISO, filas, marca PARCIAL); URIs completas y bnodes opacos por fila.

## Persistencia

- **Dashboards GIS:** `DashboardPersistenceService` serializa query + layout + filtros + selección → `/api/dashboards` (`kind: 'gis'`).
- **Workspaces Explorer:** `WorkspacePersistenceService` serializa paneles (tabs) + grafo → `/api/dashboards` (`kind: 'explorer'`).
- **Layout GIS:** `localStorage` (`rdf-gis-explorer:dashboard-layout`) — UI state puro.
- **Handoff:** `sessionStorage` (`platform.handoff.pending`) + `CustomEvent`; `localStorage` (`platform.handoff.autoRun`) para la preferencia de auto-ejecución.

## Persistencia SQLite por backend

Cada backend tiene su propio archivo SQLite, derivado de `SPARQL_BACKEND`: `data/${SPARQL_BACKEND}.sqlite` (override: `DASHBOARDS_SQLITE_PATH`).

```bash
cd backend
pnpm run clean:unused-data          # reporta archivos SQLite sin uso, exit 1 si hay
pnpm run clean:unused-data:force    # los borra (incluye -shm/-wal siblings)
```

`SPARQL_PROTECTED_BACKENDS` (default `wikidata,graphdb`) controla qué archivos en `data/` se preservan aunque no sean el activo.

## Configuración runtime — `GET /api/config`

Derivada de env vars + `config/prefixes.*.json`. Read-only para el cliente:

```ts
AppConfig {
  backend, endpointUrl, hasBasicAuth, userAgent, timeoutMs, defaultLimit, maxLimit,
  capabilities, supportsWikibaseLabel, defaultPrefixes, search,
  labelUri,     // rdfs:label por default
  describe,     // UI hints: { exclude, objects, datatype, text, image, external }
  classColors,  // colores por clase (solo poblado para wikidata)
  defaults,     // defaults que consume el Explorer (lang, resultLimit, labelUri, searchClass, endpointType)
  limits,       // límites unificados (env del backend): { graphMaxNodes, lotDefaultSize,
                //   lotSizeOptions[], tablePageSizeOptions[], exportMaxRows,
                //   exportMinPageSize, summaryTopCategorical }
}
```

**Canal de límites:** todos los límites de queries y visualización viven en env vars del backend (ver tabla del README) y viajan en `AppConfig.limits`. El GIS los consume con `LimitsService` (signal con defaults equivalentes hasta que la config llega; `App` lo actualiza en `ngOnInit`): grafo (`graphMaxNodes`), lotes (`lotDefaultSize`/`lotSizeOptions`, con clamp del tamaño actual si queda fuera de la nueva oferta), tabla (`tablePageSizeOptions`) y export (`exportMaxRows`/`exportMinPageSize`).

Cada frontend tiene su propio `AppConfigService` (duplicación deliberada por federation) que cachea la respuesta. Los URIs específicos de Wikidata (describe hints, classColors, searchClass Q5) viven en el `AppConfigService` del backend y solo se emiten cuando `backend === 'wikidata'`; para otros backends se emiten defaults RDF neutros.

## Variables de Entorno

Ver `.env` (Wikidata, trackeado) y `.env.graphdb.example`. La tabla completa está en `README.md#variables-de-entorno`. No hay `LOG_LEVEL` ni `SQLITE_PATH` (obsoletas, eliminadas).

## Path Aliases (TypeScript)

### rdf_gis_explorer
```
@shared/*   → src/app/shared/*
@core/*     → src/app/core/*
@features/* → src/app/features/*
```

## Notas Importantes

- **No hay NgModules** en el frontend. Todo es standalone components + `provideX()` en `app.config.ts`.
- **El shell NO expone componentes** como remote; solo consume remotes. Su `app.config.ts` no tiene initializers (el ex-`SettingsService` del shell se eliminó: nadie consumía el resultado).
- **Tests de frontends**: el target `test` de cada `angular.json` fija `buildTarget: <proyecto>:esbuild:development` + `runner: vitest` (el target `build` de native-federation no sirve para compilar tests). `tsconfig.spec.json` debe incluir `src/polyfills.ts`. En specs, las factories de `vi.mock` se hoistean: helpers compartidos entre factory y tests van dentro de `vi.hoisted()` (ver `graph-view` y `timeline-view` specs).
- **Interpolación en SPARQL**: nunca interpolar input del usuario en un literal sin escapar `\`, `"`, `'` y saltos de línea (backend: `escapeSparqlLiteral` en `suggestions.service.ts`; explorer: `escapeKeyword`). Con `String.replace`, pasar el reemplazo como función para que `$&`/`$'` no se expandan. URIs externas se validan con `isValidUri` antes de entrar a `VALUES { <...> }`.
- **Docker**: las 4 imágenes se buildean con contexto en la **raíz del repo** (`docker-compose.yml` usa `context: .` + `dockerfile: <dir>/Dockerfile`) para compartir el lockfile del workspace y `packages/contracts`. El patrón: copiar manifests de todo el workspace + patches, `pnpm install --frozen-lockfile --filter "{./<dir>}..."`, copiar el código de la app, buildear contracts y la app. El volumen de datos del backend monta en `/repo/backend/data`.
- **Cytoscape:** NO pasar `wheelSensitivity` en las opciones (ni siquiera `1.0`): el default ya es 1 y Cytoscape ≥3.31 normaliza el scroll por `deltaMode` (fix Firefox/Linux integrado); definir la opción solo dispara un warning.
- **Warning benigno conocido:** `wrong event specified: touchleave` viene de Leaflet 1.9 + leaflet-draw (upstream), no es un bug nuestro.
- **APP_INITIALIZER del remote GIS** (`rdf_gis_explorer/app.config.ts`) solo corre standalone; cargado como remote, la config se carga async (`App.ngOnInit` / `AppConfigService.load()` con `shareReplay`). No asumir config disponible sincrónicamente en componentes del GIS.
- **El backend NO usa ORM.** Queries SQL directas con `better-sqlite3`.
- **`sparqljs`** se usa en backend (validación) y en GIS (validación en el frontend).
- **Límites unificados (resuelto el acoplamiento histórico):** ya no hay `@Max(2000)` hardcodeado en el DTO ni caps fijos en front/back: todos los límites son env del backend y llegan a los frontends vía `AppConfig.limits` (ver "Canal de límites" en la sección de `/api/config`). El GIS **no manda límite propio**: `ApiService.executeQuery` sin `limit` explícito pide el `maxLimit` que publica el backend (el volumen se pagina en cliente con los lotes).
- **WKT inválido no aborta la query:** si un literal `wktLiteral` no parsea como Point (datos sucios, p.ej. `POINT(None None)`), el adaptador lo degrada a literal plano en vez de lanzar error (`generic-sparql.adapter.ts` `normalizeValue`).
- **Fases futuras:** MillenniumDB adapter, curation records, duplicate detection (tablas en `db/migrations.sql`, hoy sin uso).

## Regla de git

**No commitear ni pushear sin OK explícito del usuario.** `git add`, `git status`, `git diff`, `git fetch` y demás lecturas son libres; todo lo que modifique el historial/estado (`commit`, `push`, `merge`, `rebase`, `reset`, `branch -D`, `tag`, `cherry-pick`, `revert`, `--force`, etc.) requiere autorización explícita en el mismo turno ("comiteá" / "hacé commit" / "subí"). Cuando se autoriza, los commits se firman a nombre del usuario (config de git), nunca con Co-Authored-By de Claude.
