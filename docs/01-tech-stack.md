# 01 — Tech Stack

> **Regla:** todas las AIs deben usar exactamente estas versiones. Si una librería rompe, se actualiza acá y se propaga al resto.

## Frontend

| Paquete | Versión | Propósito |
|---|---|---|
| `@angular/core` | `^17.3.0` | Framework base. Usar standalone components y signals donde aplique. |
| `@angular/cdk` | `^17.3.0` | Drag&drop (tabla), Sidenav (panel curado), Portal. |
| `@angular/material` | `^17.3.0` | Botones, dialogs, snackbars. No usar mat-table (se usa ag-grid). |
| `rxjs` | `^7.8.0` | BehaviorSubject para SelectionService. |
| `ag-grid-community` | `^31.0.0` | Tabla de resultados (M02). Filtro/reorder/resize built-in. |
| `ag-grid-angular` | `^31.0.0` | Binding Angular para ag-grid. |
| `cytoscape` | `^3.28.0` | Grafo (M03). |
| `cytoscape-cola` | `^2.5.1` | Layout force-directed default. |
| `cytoscape-dagre` | `^2.5.0` | Layout jerárquico alternativo. |
| `leaflet` | `^1.9.4` | Mapa (M04). |
| `leaflet.markercluster` | `^1.5.3` | Clustering automático de marcadores. |
| `leaflet-draw` | `^1.0.4` | Dibujo de área para filtrado geográfico. |
| `@turf/boolean-point-in-polygon` | `^6.5.0` | Test geométrico para filtro por polígono. |
| `vis-timeline` | `^7.7.3` | Timeline (M05). |
| `chart.js` | `^4.4.0` | Gráfico de evolución de precio en timeline (M05). |
| `codemirror` | `^6.0.1` | Editor SPARQL (M01). |
| `@codemirror/lang-sparql` | `^6.0.0` | Highlighting SPARQL. (Si no existe: usar `@codemirror/legacy-modes/sparql` o un fork.) |
| `sparqljs` | `^3.7.0` | Parsing/validación cliente opcional + servidor obligatorio. |

**Decisión: CodeMirror 6 sobre Monaco.** Bundle ~5x más liviano, suficiente para SPARQL. Monaco se justifica en IDEs completos, no acá.

**Decisión: ag-grid-community sobre mat-table.** Filtrado por columna, reorder y resize built-in. mat-table requiere implementación manual de todo eso.

## Backend

| Paquete | Versión | Propósito |
|---|---|---|
| Node.js | `20.x LTS` | Runtime. |
| `@nestjs/core` | `^10.3.0` | Framework. |
| `@nestjs/common` | `^10.3.0` | Decorators, pipes. |
| `@nestjs/platform-express` | `^10.3.0` | HTTP server. |
| `@nestjs/config` | `^3.2.0` | Variables de entorno tipadas. |
| `axios` | `^1.6.0` | Cliente HTTP a Wikidata. |
| `sparqljs` | `^3.7.0` | Parse y validación SPARQL server-side (obligatorio). |
| `better-sqlite3` | `^11.0.0` | Driver SQLite síncrono, fast, sin nativos complicados. |
| `class-validator` | `^0.14.0` | Validación de DTOs. |
| `class-transformer` | `^0.5.1` | Transformación DTO ↔ entidad. |

**Decisión: better-sqlite3 sobre TypeORM.** Schema simple (1 tabla curation_records, 1 tabla duplicates), no necesita ORM completo.

## Testing

| Paquete | Versión | Capa | Propósito |
|---|---|---|---|
| `jest` | `^29.7.0` | Back | Tests unitarios y de integración del backend. |
| `nock` | `^13.5.0` | Back | Mock de HTTP a Wikidata en tests. |
| `karma` + `jasmine` | (default Angular CLI 17) | Front | Tests unitarios de servicios y componentes con lógica. |
| `@playwright/test` | `^1.42.0` | E2E | Smoke test end-to-end (1-2 escenarios golden path). |

**Qué se testea (regla):**
- Backend: cobertura ≥70% en `services/` y `adapters/`. Controllers solo smoke.
- Frontend: `SelectionService` 100%. Componentes con lógica no trivial. Vistas puramente visuales solo smoke E2E.

## Infraestructura

| Tool | Versión | Propósito |
|---|---|---|
| Docker | `>=24` | Empaquetado. |
| Docker Compose | `v2` | Orquestación local. |
| `pnpm` | `^8.15.0` | Package manager (preferido). `npm` también funciona. |

## Estructura de monorepo

```
rdf_gis_explorer/
├── frontend/         # Angular app
│   ├── src/app/
│   │   ├── core/services/selection.service.ts
│   │   ├── features/
│   │   │   ├── sparql-input/
│   │   │   ├── table-view/
│   │   │   ├── graph-view/
│   │   │   ├── map-view/
│   │   │   ├── timeline-view/
│   │   │   └── curation-panel/
│   │   └── shared/models/    # Tipos de 02-data-contracts.md
│   └── package.json
├── backend/          # NestJS app
│   ├── src/
│   │   ├── modules/
│   │   │   ├── query/
│   │   │   ├── suggestions/
│   │   │   └── curation/
│   │   ├── adapters/
│   │   │   ├── sparql-endpoint.interface.ts
│   │   │   ├── wikidata.adapter.ts
│   │   │   └── millenniumdb.adapter.ts
│   │   └── shared/dto/       # DTOs de 02-data-contracts.md
│   └── package.json
├── shared/           # Tipos compartidos (TS) — opcional, ver 02
├── docker-compose.yml
└── docs/
```

**Decisión: NO monorepo formal (no nx, no turbo).** `frontend/` y `backend/` son carpetas hermanas con `package.json` propios. Los tipos compartidos se duplican manualmente en `shared/models/` (front) y `shared/dto/` (back) — o se publican como paquete `shared/` si crece la complejidad.
