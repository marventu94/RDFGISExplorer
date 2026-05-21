# 00 — Arquitectura general

## 1. Visión

RDF GIS Explorer es una SPA con backend que media entre el cliente y un endpoint SPARQL (Wikidata en fase 1, MillenniumDB en fase 2). El backend además mantiene un overlay SQLite de correcciones manuales que **nunca se mezcla** con el grafo original.

## 2. Capas

```
┌──────────────────────────────────────────────────────────────────┐
│                       FRONTEND (Angular 17)                      │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌─────────┐ │
│  │  M01     │ │   M02    │ │   M03    │ │   M04    │ │  M05    │ │
│  │ SPARQL   │ │  Table   │ │  Graph   │ │   Map    │ │Timeline │ │
│  │  Input   │ │   View   │ │  View    │ │   View   │ │  View   │ │
│  └────┬─────┘ └────┬─────┘ └────┬─────┘ └────┬─────┘ └────┬────┘ │
│       └────────────┴────────────┼────────────┴────────────┘      │
│                                 ▼                                │
│                  ┌────────────────────────────┐                  │
│                  │  M07 SelectionService      │                  │
│                  │  (RxJS BehaviorSubjects)   │                  │
│                  └─────────────┬──────────────┘                  │
│                                ▼                                 │
│                  ┌────────────────────────────┐                  │
│                  │   M06 Curation Panel       │                  │
│                  └────────────────────────────┘                  │
└──────────────────────────────┬───────────────────────────────────┘
                               │ HTTP (REST + JSON)
┌──────────────────────────────▼───────────────────────────────────┐
│                       BACKEND (NestJS)                           │
│  ┌─────────────┐  ┌──────────────────┐  ┌──────────────────────┐ │
│  │ M08 Query   │  │  M08 Suggestion  │  │   M08 Curation       │ │
│  │  Module     │  │      Module      │  │      Module          │ │
│  └──────┬──────┘  └────────┬─────────┘  └──────────┬───────────┘ │
│         └──────────────────┤                       │             │
│                            ▼                       ▼             │
│            ┌────────────────────────┐  ┌────────────────────┐    │
│            │  M09 SparqlEndpoint    │  │  SQLite (overlay)  │    │
│            │  (Adapter interface)   │  │   curation.db      │    │
│            └───────┬──────────┬─────┘  └────────────────────┘    │
│                    │          │                                  │
│         ┌──────────▼───┐  ┌───▼──────────────┐                   │
│         │ WikidataAdpt │  │MillenniumDBAdpt  │                   │
│         │  (fase 1)    │  │  (fase 2, stub)  │                   │
│         └──────┬───────┘  └────────┬─────────┘                   │
└────────────────┼───────────────────┼─────────────────────────────┘
                 │                   │
                 ▼                   ▼
       query.wikidata.org    millenniumdb (LIFIA)
```

## 3. Flujo principal de datos

1. Usuario escribe SPARQL en M01 (editor).
2. Frontend hace `POST /query/execute` con `{ sparql, limit }`.
3. M08 Query Module valida sintaxis (sparqljs), aplica timeout (10s) y limit (≤500 default, ≤2000 con confirmación).
4. M09 SparqlEndpoint (Adapter) ejecuta contra el endpoint configurado y normaliza la respuesta a `QueryResult` ([ver 02-data-contracts.md](02-data-contracts.md)).
5. Backend devuelve `QueryResult` al frontend.
6. Frontend llama `SelectionService.setQueryResult(result)`.
7. Las 4 vistas (M02-M05) están suscriptas a `queryResult$` y renderizan en paralelo.
8. Cualquier interacción del usuario (click en fila / nodo / marcador / item de timeline) llama `SelectionService.select(node)` o `addFilter(filter)`.
9. Los `BehaviorSubject` notifican a todas las vistas, que reaccionan en ≤200ms.

## 4. Patrón Adapter (M09)

El backend nunca conoce el endpoint concreto. Inyecta `SparqlEndpoint` (interfaz) y el módulo M09 provee la implementación según `process.env.SPARQL_BACKEND`:

- `wikidata` → `WikidataAdapter` (default, fase 1).
- `millenniumdb` → `MillenniumDBAdapter` (stub que tira `NotImplementedError` hasta fase 2).

Cambiar de backend = cambiar 1 env var. Las vistas no se enteran.

## 5. Patrón SelectionService (M07)

Singleton Angular basado en RxJS. Mantiene tres `BehaviorSubject` públicos como observables:

- `selectedNode$: Observable<NormalizedNode | null>`
- `activeFilters$: Observable<Filter[]>`
- `queryResult$: Observable<QueryResult | null>`

API mutadora: `select(node)`, `clearSelection()`, `addFilter(filter)`, `removeFilter(id)`, `setQueryResult(result)`.

## 6. Overlay de curado (M06 + M08)

- El grafo SPARQL (Wikidata o MillenniumDB) es **solo lectura**.
- SQLite local guarda `curation_records` con `node_uri`, `field_name`, `raw_value`, `script_value`, `manual_value`, `author`, `timestamp`.
- Cuando el frontend muestra un nodo, fusiona los valores en este orden: `manual_value` > `script_value` > `raw_value`.

## 7. Performance budget

| Métrica | Objetivo |
|---|---|
| Query end-to-end (≤500 resultados) | < 3s |
| Propagación de selección entre vistas | < 200ms |
| Renderizado inicial del grafo (≤300 nodos) | < 2s |
| Cambio de mapa base | < 500ms |

## 8. Decisiones arquitectónicas clave

| ID | Decisión | Justificación |
|---|---|---|
| ADR-01 | Adapter `SparqlEndpoint` desde día 1 | Permite desarrollar con Wikidata sin esperar a MillenniumDB. |
| ADR-02 | SelectionService como singleton RxJS | Patrón Angular nativo, sin store extra (NgRx innecesario). |
| ADR-03 | Overlay SQLite separado del grafo | Auditabilidad + grafo original intacto. |
| ADR-04 | Límite duro de 300 nodos en grafo | Cytoscape.js se degrada visualmente por encima. |
| ADR-05 | Backend valida SPARQL antes de ejecutar | Errores legibles, evita queries inválidas viajando hasta Wikidata. |
