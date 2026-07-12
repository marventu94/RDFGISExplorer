# RDF GIS Explorer

Plataforma unificada para exploración visual de grafos de conocimiento (KG) con dimensiones geo-espaciales y temporales. Combina dos herramientas — **RDF Explorer** (construcción visual de queries SPARQL) y **RDF GIS Explorer** (dashboard de vistas coordinadas: tabla, grafo, mapa, línea de tiempo) — bajo un único *AppShell* con Module Federation.

El backend actúa como proxy configurable hacia **cualquier endpoint SPARQL 1.1**: se valida hoy contra Wikidata y una instancia de GraphDB, y se adapta a otros endpoints configurando la URL, credenciales y prefixes por variables de entorno (ver [Configuración de backends SPARQL](#configuración-de-backends-sparql)).

Tesis de Maestría en Ingeniería de Software — Venturino, Martín M. — LIFIA / UNLP, 2025.

---

## Stack

- **Frontend:** Angular 21 (Native Federation vía `@angular-architects/native-federation`)
  - `frontend/app_shell/` — Host en `:4200`
  - `frontend/rdf_explorer/` — Remote en `:4201`
  - `frontend/rdf_gis_explorer/` — Remote en `:4202`
- **Backend:** NestJS 11 sobre Node.js 24.18.0 (`:3000`)
- **DB:** SQLite vía `better-sqlite3` (`backend/data/`, un archivo por backend SPARQL)
- **Endpoint SPARQL:** genérico SPARQL 1.1 (URL configurable) / Wikidata / MillenniumDB (stub) — patrón Adapter
- **Testing:** Jest (backend), Vitest (frontends — ver [Tests](#tests))
- **Package manager:** pnpm (workspace único en la raíz, `pnpm-workspace.yaml`)

---

## Cómo levantar el proyecto

### Desarrollo local

#### Requisitos previos

- **nvm** (`https://github.com/nvm-sh/nvm`) — `start.sh` lo usa para leer `.nvmrc` y activar la versión correcta de Node.
- **Node.js 24.18.0** — `start.sh` corre `nvm install` / `nvm use` automáticamente; si no usás `start.sh`, asegurate de tener Node 24 activo.
- **corepack / pnpm** — el script habilita `pnpm` vía corepack. Si no usás `start.sh`, necesitás `pnpm` instalado globalmente.

#### `start.sh`

`start.sh` es el entrypoint recomendado para levantar todo el stack en modo dev con hot reload. Se encarga de:

1. Leer el archivo `.env` indicado (default `.env`).
2. Activar la versión de Node definida en `.nvmrc` mediante `nvm`.
3. Habilitar `pnpm` vía corepack.
4. Instalar dependencias del workspace si no están presentes.
5. Recompilar módulos nativos (p. ej. `better-sqlite3`) si cambió la major version de Node.
6. Arrancar backend + 3 frontends con `concurrently` (Ctrl+C detiene todo).

```bash
# Uso básico — levanta con .env (Wikidata por defecto)
./start.sh

# Levantar con otro archivo de entorno, por ejemplo GraphDB
./start.sh .env.graphdb
./start.sh --env .env.graphdb
```

> La variable `DOTENV_CONFIG_PATH` se exporta con el path absoluto del `.env` elegido, así que backend y frontends la leen consistentemente.

| Servicio | URL |
|----------|-----|
| App Shell (host) | http://localhost:4200 |
| RDF Explorer (remote) | http://localhost:4200/explorer |
| RDF GIS Explorer (remote) | http://localhost:4200/gis |
| Backend API | http://localhost:3000/api |

### Docker / Podman

Las imágenes se buildean con **contexto en la raíz del repo** (los Dockerfiles
comparten el lockfile del workspace pnpm y el paquete `packages/contracts`).

```bash
# Wikidata (default, sin credenciales)
docker compose up

# GraphDB local (requiere credenciales)
cp .env.graphdb.example .env.graphdb
# editá .env.graphdb con tus credenciales
ENV_FILE=.env.graphdb docker compose up
```

| Archivo | Trackeado en git | Contenido |
|---------|------------------|-----------|
| `.env` | Sí | Configuración por defecto (Wikidata) |
| `.env.graphdb` | **No** | Configuración local con credenciales de GraphDB |
| `.env.graphdb.example` | Sí | Template para GraphDB (sin credenciales reales) |

> `.env.graphdb` está en `.gitignore` para no subir credenciales. Cada desarrollador debe crear el suyo a partir de `.env.graphdb.example`.

---

## Flujo principal de la plataforma

1. **Welcome** (`/`) — Tableros recientes guardados (mix de Explorer y GIS) con filtros y CTAs.
2. **RDF Explorer** (`/explorer`) — Construcción visual de queries SPARQL; guardar workspace.
3. **Handoff** — Botón "Explorar en GIS" migra la query generada al dashboard GIS.
4. **RDF GIS Explorer** (`/gis`) — Ejecutar query, explorar resultados en 1-4 vistas coordinadas, guardar dashboard.
5. **Persistencia** — Todo se guarda en el backend NestJS; recargar y abrir desde Welcome restaura el estado idéntico.

---

## Estructura del repo

```
packages/
  contracts/            # @rdfgis/contracts: tipos compartidos back<->front (QueryResult, AppConfig, Dashboard)
backend/                # NestJS 11 + SQLite (better-sqlite3)
  config/               # prefixes.<backend>.json (prefixes SPARQL por backend)
  src/
    adapters/           # SparqlEndpoint: GenericSparqlAdapter, MillenniumDBAdapter (stub)
    common/filters/     # HttpExceptionFilter global
    db/                 # SQLite provider (un archivo por SPARQL_BACKEND)
    modules/
      app-config/       # GET /api/config: runtime config para los frontends
      dashboards/       # CRUD dashboards/workspaces (SQLite)
      health/           # Health check + verificación del endpoint SPARQL
      query/            # Ejecución de queries SPARQL (validación sparqljs, límites, timeout)
      sparql/           # Módulo global: provee el token SPARQL_ENDPOINT
      suggestions/      # Autocompletado de predicados + búsqueda de entidades
    shared/dto/         # Re-exporta el contrato QueryResult desde @rdfgis/contracts
frontend/
  app_shell/            # Host Angular 21 + WelcomePage + routing + Native Federation
    src/app/
      core/             # DashboardStoreService, DashboardApiClient, redirect guard
      pages/welcome/    # WelcomePage
      shell/            # TopBar
  rdf_explorer/         # Remote: editor visual SPARQL (Cytoscape.js)
    src/app/
      core/             # RequestService, QueryService, WorkspacePersistence, QueryHandoff
      graph/            # Dominio puro (PropertyGraph, Node, Edge, Query, Filter)
        canvas-graph/   # Visualización Cytoscape.js
        domain/         # Modelo de dominio sin Angular
      pages/main/       # Layout 3 paneles (search + canvas + tools)
      tools/            # describe, edit, sparql, log
      shell/            # search-panel, canvas-panel, tools-panel
  rdf_gis_explorer/     # Remote: dashboard 4 vistas coordinadas
    src/app/
      core/services/    # SelectionService, DashboardPersistence, AppConfig, Layout
      features/
        dashboard/      # Orquestador: editor + grid de vistas + navbar
        sparql-input/   # Editor CodeMirror 6 + ejecución SPARQL (precarga prefixes)
        table-view/     # AG Grid Community
        map-view/       # Leaflet + markercluster + draw + geocoder
        graph-view/     # Cytoscape.js (cola + dagre layouts)
        timeline-view/  # vis-timeline + Chart.js
      shared/models/    # Tipos compartidos (QueryResult, BindingValue, etc.)
```

---

## API Endpoints

**Prefijo global:** `/api`

| Método | Ruta | Descripción |
|--------|------|-------------|
| POST | `/api/query/execute` | Ejecuta consulta SPARQL `{ sparql, limit? }` |
| GET | `/api/suggestions/predicates` | Lista predicados disponibles (cache 1h) |
| GET | `/api/suggestions/entities?q=&limit=&classUri=` | Búsqueda de entidades |
| GET | `/api/config` | Configuración pública del backend (incluye `defaultPrefixes`) |
| GET | `/api/dashboards` | Lista todos los dashboards |
| GET | `/api/dashboards/recent?limit=10` | Lista los N más recientes |
| GET | `/api/dashboards/:id` | Obtiene un dashboard |
| POST | `/api/dashboards` | Crea dashboard `{ kind, name, payload }` |
| PUT | `/api/dashboards/:id` | Actualiza dashboard |
| DELETE | `/api/dashboards/:id` | Elimina dashboard |
| GET | `/api/health` | Health check básico (usado por Docker healthcheck) |
| GET | `/api/health/sparql` | Health check del endpoint SPARQL upstream |

---

## Tests

```bash
# Backend (Jest)
cd backend && pnpm test

# Frontends (Vitest vía ng test)
cd frontend/app_shell && pnpm test
cd frontend/rdf_explorer && pnpm test
cd frontend/rdf_gis_explorer && pnpm test
```

> El builder `unit-test` de Angular usa el target `esbuild:development` como
> `buildTarget` (configurado en cada `angular.json`) porque el target `build`
> de native-federation no sirve para compilar tests.

---

## Variables de entorno

| Variable | Default | Uso |
|----------|---------|-----|
| `SPARQL_BACKEND` | `wikidata` | Nombre del backend. `millenniumdb` usa su stub; cualquier otro valor (`wikidata`, `graphdb`, `generic`, ...) usa el adaptador genérico. Define también el archivo SQLite y el de prefixes. |
| `SPARQL_ENDPOINT_URL` | `https://query.wikidata.org/sparql` | URL del endpoint SPARQL. Para GraphDB: `http://<host>:7200/repositories/<repoId>` |
| `SPARQL_USERNAME` / `SPARQL_PASSWORD` | — | Basic Auth (GraphDB protegido) |
| `SPARQL_ENTITY_SEARCH_QUERY` | — | Query opcional para `/api/suggestions/entities`. Reemplaza `$keyword` y `$limit`. |
| `SPARQL_USER` | `rdf-gis-explorer/0.1` | User-Agent (obligatorio para Wikidata) |
| `SPARQL_TIMEOUT_MS` | `30000` | Timeout de consultas (ms) |
| `SPARQL_DEFAULT_LIMIT` | `500` | Límite por defecto |
| `SPARQL_MAX_LIMIT` | `2000` | Límite máximo |
| `SPARQL_PREFIXES_PATH` | `backend/config/prefixes.${SPARQL_BACKEND}.json` | Archivo JSON `{ prefix: uri }` con los prefixes del backend |
| `BACKEND_PORT` | `3000` | Puerto del backend |
| `FRONTEND_PORT` / `RDF_EXPLORER_PORT` / `RDF_GIS_EXPLORER_PORT` | `4200` / `4201` / `4202` | Puertos de los frontends (Docker/Podman) |
| `CORS_ORIGINS` | `http://localhost:4200` | Orígenes CORS (separados por coma) |
| `DASHBOARDS_SQLITE_PATH` | `backend/data/${SPARQL_BACKEND}.sqlite` | Override del SQLite de dashboards |
| `SPARQL_PROTECTED_BACKENDS` | `wikidata,graphdb` | Backends cuyos SQLite se preservan en `clean:unused-data` |

---

## Configuración de backends SPARQL

La configuración del endpoint SPARQL es **single source of truth** en el backend. Los frontends la obtienen vía `GET /api/config` al iniciar.

### Wikidata

```env
SPARQL_BACKEND=wikidata
SPARQL_ENDPOINT_URL=https://query.wikidata.org/sparql
SPARQL_USER=mi-app/1.0 (mailto:mi@email.com)
```

El frontend detecta `supportsWikibaseLabel: true` y usa `wbsearchentities` para la búsqueda de entidades en RDF Explorer.

### GraphDB local con autenticación

```env
SPARQL_BACKEND=graphdb
SPARQL_ENDPOINT_URL=http://localhost:7200/repositories/<repo-id>
SPARQL_USERNAME=<usuario>
SPARQL_PASSWORD=<contraseña>

# Opcional: query personalizada para búsqueda de entidades
# SPARQL_ENTITY_SEARCH_QUERY=SELECT DISTINCT ?uri ?label WHERE { ?uri <http://www.w3.org/2000/01/rdf-schema#label> ?label . FILTER regex(?label, "$keyword", "i") } LIMIT $limit
```

El frontend detecta `supportsWikibaseLabel: false` y delega la búsqueda de entidades al backend (`GET /api/suggestions/entities`), que ejecuta `SPARQL_ENTITY_SEARCH_QUERY` (default: `rdfs:label` + `FILTER regex`).

### Prefixes

Los prefixes se configuran por backend en `backend/config/prefixes.<backend>.json`
(o en la ruta que indique `SPARQL_PREFIXES_PATH`):

```json
{ "rdf": "http://www.w3.org/1999/02/22-rdf-syntax-ns#", "wd": "http://www.wikidata.org/entity/" }
```

- El repo trae `prefixes.wikidata.json`; para GraphDB copiá `prefixes.graphdb.example.json` a `prefixes.graphdb.json` y ajustá (está gitignoreado por si contiene namespaces internos).
- Viajan a los frontends como `defaultPrefixes` en `GET /api/config`.
- **RDF Explorer** los usa para generar queries y abreviar URIs.
- **RDF GIS Explorer** los precarga como bloque `PREFIX ...` en el editor SPARQL (editor vacío o tablero nuevo).
- El backend **no** inyecta prefixes en las queries: la query enviada a `/api/query/execute` debe ser autocontenida.

### Agregar un nuevo backend

1. Crear `.env.mibackend` con `SPARQL_BACKEND=mibackend` y la URL/credenciales del endpoint. El adaptador genérico (`GenericSparqlAdapter`) se usa automáticamente.
2. Crear `backend/config/prefixes.mibackend.json` con los prefixes del dataset.
3. Opcionalmente definir `SPARQL_ENTITY_SEARCH_QUERY` si el default no aplica.
4. Solo si el endpoint necesita lógica propia (protocolo no estándar), crear un adaptador `SparqlEndpoint` en `backend/src/adapters/` y agregar el caso en `sparql-endpoint.factory.ts`.
5. Los frontends se adaptan automáticamente vía `/api/config`.

---

## MCP Server para GraphDB

El repo incluye una configuración opcional para usar el [MCP server de GraphDB](https://github.com/keonchennl/mcp-server-graphdb) y explorar el dataset con herramientas SPARQL desde el agente/IDE.

### Setup

```bash
# 1. Clonar y compilar el server (queda en mcp-server-graphdb/, gitignoreado)
./scripts/setup-mcp-graphdb.sh

# 2. Copiar la config de ejemplo (la config real no se sube)
cp .vscode/mcp.json.example .vscode/mcp.json
```

### Cómo funciona

- `.vscode/mcp.json` apunta a `scripts/run-mcp-graphdb.mjs`.
- El wrapper lee `.env.graphdb` y parsea `SPARQL_ENDPOINT_URL` (`http://host:7200/repositories/<repo>`) en `GRAPHDB_ENDPOINT` + `GRAPHDB_REPOSITORY`.
- `SPARQL_USERNAME` / `SPARQL_PASSWORD` se reenvían como `GRAPHDB_USERNAME` / `GRAPHDB_PASSWORD` si están definidas.
- El server clonado (`mcp-server-graphdb/dist/index.js`) queda **gitignoreado**.

### Uso

Reiniciá el workspace en VSCode / Claude Desktop para que levante el server `graphdb`. Después el agente puede ejecutar `sparqlQuery` y `listGraphs` contra tu repositorio.

---

## Contacto

Martín M. Venturino — `marventurino@gmail.com`
