# RDF GIS Explorer

Plataforma unificada para exploracion visual de grafos de conocimiento (KG) con dimensiones geo-espaciales y temporales. Combina dos herramientas — **RDF Explorer** (construccion visual de queries SPARQL) y **RDF GIS Explorer** (dashboard de vistas coordinadas: tabla, grafo, mapa, linea de tiempo) — bajo un unico *AppShell* con Module Federation.

Tesis de Maestria en Ingenieria de Software — Venturino, Martin M. — LIFIA / UNLP, 2025.

---

## Stack

- **Frontend:** Angular 21 (Module Federation via `@angular-architects/native-federation`)
  - `frontend/app_shell/` — Host en `:4200`
  - `frontend/rdf_explorer/` — Remote en `:4201`
  - `frontend/rdf_gis_explorer/` — Remote en `:4202`
- **Backend:** NestJS 11 sobre Node.js (`:3000`)
- **DB:** SQLite via `better-sqlite3` (`backend/data/`)
- **Endpoint SPARQL:** Wikidata (default) / MillenniumDB (stub) — patron Adapter
- **Testing:** Vitest (unitarios frontend), Jest (backend)
- **Package manager:** pnpm 10 (frontend), npm (backend)

---

## Como levantar el proyecto

### Desarrollo local

```bash
# Instalar dependencias del backend
cd backend && npm install && cd ..

# Instalar dependencias del app shell
cd frontend/app_shell && pnpm install && cd ../..

# Instalar dependencias de rdf_explorer
cd frontend/rdf_explorer && pnpm install && cd ../..

# Instalar dependencias de rdf_gis_explorer
cd frontend/rdf_gis_explorer && pnpm install && cd ../..

# Levantar backend (:3000), shell (:4200), explorer (:4201) y gis (:4202)
npm run dev
```

| Servicio | URL |
|----------|-----|
| App Shell (host) | http://localhost:4200 |
| RDF Explorer (remote) | http://localhost:4200/explorer |
| RDF GIS Explorer (remote) | http://localhost:4200/gis |
| Backend API | http://localhost:3000 |

### Docker

```bash
cp .env.example .env
docker compose up
```

---

## Flujo principal de la plataforma

1. **Welcome** (`/`) — Tableros recientes guardados (mix de Explorer y GIS) con filtros y CTAs.
2. **RDF Explorer** (`/explorer`) — Construccion visual de queries SPARQL; guardar workspace.
3. **Handoff** — Boton "Explorar en GIS" migra la query generada al dashboard GIS.
4. **RDF GIS Explorer** (`/gis`) — Ejecutar query, explorar resultados en 1-4 vistas coordinadas, guardar dashboard.
5. **Persistencia** — Todo se guarda en el backend NestJS; recargar y abrir desde Welcome restaura el estado identico.

---

## Estructura del repo

```
backend/                # NestJS 11 + SQLite (better-sqlite3)
  src/
    adapters/           # SparqlEndpoint: WikidataAdapter, MillenniumDBAdapter (stub)
    common/filters/     # HttpExceptionFilter global
    db/                 # SQLite provider + migrations
    modules/
      dashboards/       # CRUD dashboards (SQLite)
      health/           # Health check + SPARQL endpoint check
      query/            # Ejecucion de queries SPARQL
      sparql/           # Modulo global: provee SPARQL_ENDPOINT token
      suggestions/      # Autocompletado de predicados
    shared/dto/         # Contrato QueryResult (front<->back)
frontend/
  app_shell/            # Host Angular 21 + WelcomePage + routing + Module Federation
    src/app/
      core/             # DashboardStoreService, QueryHandoffService, SnackbarService
      pages/            # WelcomePage, SettingsPage
      shell/            # TopBar
  rdf_explorer/         # Remote: editor visual SPARQL (Cytoscape.js)
    src/app/
      core/             # SettingsService, RequestService, QueryService, WorkspacePersistence
      graph/            # Dominio puro (PropertyGraph, Node, Edge, Query, Filter)
        canvas-graph/   # Visualizacion Cytoscape.js
        domain/         # Modelo de dominio sin Angular
      pages/main/       # Layout 3 paneles (search + canvas + tools)
      tools/            # describe, edit, sparql, settings, help, log
      shell/            # search-panel, canvas-panel, tools-panel
  rdf_gis_explorer/     # Remote: dashboard 4 vistas coordinadas
    src/app/
      core/services/    # SelectionService, DashboardPersistence, LayoutService
      features/
        dashboard/      # Orquestador: editor + grid de vistas + navbar
        sparql-input/   # Editor CodeMirror 6 + ejecucion SPARQL
        table-view/     # AG Grid Community
        map-view/       # Leaflet + markercluster + draw + geocoder
        graph-view/     # Cytoscape.js (cola + dagre layouts)
        timeline-view/  # vis-timeline + Chart.js
      shared/models/    # Tipos compartidos (QueryResult, BindingValue, etc.)
```

---

## API Endpoints

**Prefijo global:** `/api`

| Metodo | Ruta | Descripcion |
|--------|------|-------------|
| POST | `/api/query/execute` | Ejecuta consulta SPARQL |
| GET | `/api/suggestions/predicates` | Lista predicados disponibles |
| GET | `/api/dashboards` | Lista todos los dashboards |
| GET | `/api/dashboards/recent?limit=10` | Lista los N mas recientes |
| GET | `/api/dashboards/:id` | Obtiene un dashboard |
| POST | `/api/dashboards` | Crea dashboard `{ kind, name, payload }` |
| PUT | `/api/dashboards/:id` | Actualiza dashboard |
| DELETE | `/api/dashboards/:id` | Elimina dashboard |
| GET | `/api/health` | Health check basico |
| GET | `/api/health/sparql` | Health check del endpoint SPARQL |

---

## Tests

```bash
# Backend (Jest)
cd backend && npm test

# Frontend app_shell (Vitest)
cd frontend/app_shell && pnpm test

# Frontend rdf_explorer (Vitest)
cd frontend/rdf_explorer && pnpm test

# Frontend rdf_gis_explorer (Vitest)
cd frontend/rdf_gis_explorer && pnpm test
```

---

## Variables de entorno

| Variable | Default | Uso |
|----------|---------|-----|
| `SPARQL_BACKEND` | `wikidata` | Selecciona adaptador (`wikidata` / `millenniumdb`) |
| `SPARQL_ENDPOINT_URL` | `https://query.wikidata.org/sparql` | URL del endpoint SPARQL |
| `SPARQL_USER_AGENT` | `rdf-gis-explorer/0.1` | User-Agent (obligatorio para Wikidata) |
| `SPARQL_TIMEOUT_MS` | `30000` | Timeout de consultas (ms) |
| `SPARQL_DEFAULT_LIMIT` | `500` | Limite por defecto |
| `SPARQL_MAX_LIMIT` | `2000` | Limite maximo |
| `BACKEND_PORT` | `3000` | Puerto del backend |
| `FRONTEND_PORT` | `4200` | Puerto del frontend (Docker) |
| `CORS_ORIGINS` | `http://localhost:4200` | Origenes CORS (separados por coma) |
| `SQLITE_PATH` | `./data/curation.db` | Ruta SQLite |

---

## Contacto

Martin M. Venturino — `marventurino@gmail.com`
