# RDF GIS Explorer

Herramienta web para exploración visual de grafos de conocimiento (KG) con dimensiones geo-espaciales y temporales. Tesis de Maestría en Ingeniería de Software — Venturino, Martín M. — LIFIA / UNLP, 2025.

El usuario ingresa una consulta SPARQL y obtiene cuatro vistas coordinadas (tabla, grafo, mapa, línea de tiempo). La selección en una vista se propaga al resto vía linking & brushing.

> **Estado actual:** documentación de diseño. La implementación se reparte entre múltiples AIs siguiendo los MDs de `docs/modules/`.

---

## Stack

- **Frontend:** Angular 21 (Module Federation vía `@angular-architects/native-federation`)
  - `frontend/app_shell/` — Host en `:4200`
  - `frontend/rdf_explorer/` — Remote en `:4201`
  - `frontend/rdf_gis_explorer/` — Remote en `:4202`
- **Backend:** NestJS sobre Node.js 20 LTS (`:3000`)
- **Endpoint SPARQL:** Wikidata (fase 1, default) / MillenniumDB (fase futura) — patrón Adapter
- **Overlay de curado:** SQLite

---

## Cómo levantar el proyecto

### Desarrollo local (con `npm run dev`)

Desde la raíz del repo se pueden levantar los 4 servicios simultáneamente:

```bash
# Instalar dependencias del backend
npm install

# Instalar dependencias del app_shell
cd frontend/app_shell && npm install && cd ../..

# Instalar dependencias de rdf_explorer
cd frontend/rdf_explorer && npm install && cd ../..

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

> **Nota:** Si `npm run dev` muestra errores de `ENOSPC` (límite de file watchers), aumentá el límite del sistema: `sudo sysctl fs.inotify.max_user_watches=524288`.

### Docker

Ver [`docs/03-setup-and-docker.md`](docs/03-setup-and-docker.md).

```bash
# Resumen (lee el MD para detalles)
cp .env.example .env
docker compose up
```

---

## Organización de la documentación

Toda la documentación vive en `docs/`. Cada AI ejecutora debe leer **dos bloques** antes de implementar su módulo:

### Docs base (TODA AI los lee primero)

| Archivo | Para qué sirve |
|---|---|
| [`docs/00-architecture.md`](docs/00-architecture.md) | Visión global, capas, flujo de datos, patrones |
| [`docs/01-tech-stack.md`](docs/01-tech-stack.md) | Versiones exactas de librerías, justificación |
| [`docs/02-data-contracts.md`](docs/02-data-contracts.md) | **Fuente única de tipos** compartidos front↔back |
| [`docs/03-setup-and-docker.md`](docs/03-setup-and-docker.md) | Cómo levantar local + docker-compose + env vars |
| [`docs/04-conventions-and-glossary.md`](docs/04-conventions-and-glossary.md) | Naming, testing, glosario del dominio (KG, SPARQL, etc.) |

### Docs de módulo (UNA AI por módulo)

| Módulo | Archivo | Responsabilidad |
|---|---|---|
| M00 | [`docs/modules/M00-app-shell.md`](docs/modules/M00-app-shell.md) | Layout principal: grid 2x2 resizable + navbar + sidenav |
| M01 | [`docs/modules/M01-sparql-input.md`](docs/modules/M01-sparql-input.md) | Editor SPARQL + biblioteca de queries |
| M02 | [`docs/modules/M02-table-view.md`](docs/modules/M02-table-view.md) | Vista de tabla con paginado/filtro/orden |
| M03 | [`docs/modules/M03-graph-view.md`](docs/modules/M03-graph-view.md) | Vista de grafo Cytoscape.js + focus+context |
| M04 | [`docs/modules/M04-map-view.md`](docs/modules/M04-map-view.md) | Vista de mapa Leaflet + filtro por área |
| M05 | [`docs/modules/M05-timeline-view.md`](docs/modules/M05-timeline-view.md) | Vista de línea de tiempo vis-timeline |
| M06 | [`docs/modules/M06-curation.md`](docs/modules/M06-curation.md) | Panel de detalle + curado de datos |
| M07 | [`docs/modules/M07-selection-service.md`](docs/modules/M07-selection-service.md) | SelectionService central (linking & brushing) |
| M08 | [`docs/modules/M08-backend-api.md`](docs/modules/M08-backend-api.md) | API REST NestJS |
| M09 | [`docs/modules/M09-sparql-adapter.md`](docs/modules/M09-sparql-adapter.md) | Adapter SPARQL: Wikidata + (stub) MillenniumDB |

### Coordinación entre AIs

Ver [`docs/ai-workflow.md`](docs/ai-workflow.md) — orden de implementación, branches, handoff, regla de oro: **nadie modifica `02-data-contracts.md` sin acuerdo explícito**.

---

## Contacto

Martín M. Venturino — `marventurino@gmail.com` — Director: Dr. Diego Torres — Co-director: Dr. Sergio Firmenich
