# 04 — Convenciones y Glosario

## Parte 1: Convenciones de código

### Naming

| Caso | Convención | Ejemplo |
|---|---|---|
| Archivos | `kebab-case` | `selection.service.ts`, `graph-view.component.ts` |
| Clases / Interfaces / Tipos | `PascalCase` | `class WikidataAdapter`, `interface QueryResult` |
| Funciones / variables | `camelCase` | `executeQuery()`, `selectedNode` |
| Constantes globales | `SCREAMING_SNAKE_CASE` | `DEFAULT_LIMIT`, `MAX_NODES_IN_GRAPH` |
| Componentes Angular (selector) | `kebab-case` con prefijo `app-` | `<app-graph-view>` |
| Carpetas | `kebab-case` plural cuando agrupan | `services/`, `modules/`, `features/` |

### Estructura de carpetas

**Frontend (`frontend/src/app/`):**
```
core/
  services/             # singletons globales (SelectionService)
  guards/
  interceptors/
features/
  <feature-name>/
    <feature>.component.ts
    <feature>.component.html
    <feature>.component.scss
    <feature>.component.spec.ts
    <sub-component>.component.ts
shared/
  models/               # tipos de 02-data-contracts.md
  pipes/
  directives/
```

**Backend (`backend/src/`):**
```
modules/
  <module-name>/
    <module>.module.ts
    <module>.controller.ts
    <module>.service.ts
    dto/
      <name>.dto.ts
    <module>.service.spec.ts
adapters/
  sparql-endpoint.interface.ts
  wikidata.adapter.ts
  millenniumdb.adapter.ts
shared/
  dto/                  # contratos de 02-data-contracts.md
  filters/
  pipes/
main.ts
```

### TypeScript

- `strict: true` en `tsconfig.json` (front y back).
- Sin `any` excepto en bordes con librerías sin tipos. Usar `unknown` + narrowing.
- Sin `// @ts-ignore`. Si algo no compila, se arregla en el código o se reporta como issue.
- Imports relativos solo dentro de la misma feature. Cross-feature usa alias `@app/...` / `@shared/...`.

### Estilo

- Prettier con config default + `printWidth: 100`, `singleQuote: true`, `semi: true`.
- ESLint con plugin Angular oficial + `@typescript-eslint/recommended`.
- Tabs: **2 espacios**. Sin tabs reales.

### Tests

| Capa | Qué se testea | Cómo |
|---|---|---|
| Backend services | Lógica de negocio, validaciones, adapters | Jest. Mock de HTTP con `nock`. |
| Backend controllers | Wiring (smoke) | Jest + `supertest`. Solo 1-2 casos por endpoint. |
| Backend adapters | Normalización de respuestas | Jest. Mock de Wikidata con fixtures JSON reales. |
| Frontend SelectionService | API completa, latencia <200ms | Karma+Jasmine. Cobertura 100%. |
| Frontend componentes con lógica | Filtros, mappers, eventos | Karma+Jasmine. |
| Frontend vistas visuales puras | Solo smoke | E2E con Playwright (1 escenario golden path) |
| End-to-end | "Click en tabla → highlight en grafo" | Playwright. 2-3 escenarios. |

**Regla:** un PR no se mergea con tests rotos. Cobertura mínima en services: 70%.

### Commits

- Convención: [Conventional Commits](https://www.conventionalcommits.org/).
- Prefijos: `feat`, `fix`, `chore`, `docs`, `test`, `refactor`.
- Scope = módulo: `feat(M03): focus+context on node selection`
- Body opcional, pero referencia el ID del requerimiento si aplica: `Closes GRAPH-02`.

### Branches

- `main`: estable. Solo merges de PRs aprobados.
- `feat/m0X-<slug>`: trabajo por módulo. Ej: `feat/m03-graph-focus-context`.
- `fix/<slug>`: bugfixes.
- `docs/<slug>`: cambios de documentación.

### Definition of Done (por módulo)

Una AI considera un módulo "hecho" cuando:
1. Todos los requerimientos del MD están implementados y verificables.
2. Tests del módulo pasan.
3. Lint y typecheck pasan (`pnpm run lint && pnpm run typecheck`).
4. Build de producción no rompe.
5. El módulo se puede demostrar localmente con `docker compose up`.
6. PR abierto con descripción que linkea al MD del módulo.

---

## Parte 2: Glosario del dominio

### Grafos de conocimiento y SPARQL

| Término | Definición |
|---|---|
| **KG (Knowledge Graph)** | Grafo de conocimiento. Datos estructurados como nodos (entidades) y aristas (relaciones tipadas). |
| **RDF (Resource Description Framework)** | Modelo de datos basado en tripletas `(sujeto, predicado, objeto)`. Base de la web semántica. |
| **TTL (Turtle)** | Formato textual para serializar RDF. Más legible que RDF/XML. |
| **SPARQL** | Lenguaje de consulta para RDF. Sintaxis similar a SQL. Soporta `SELECT`, `ASK`, `CONSTRUCT`, `DESCRIBE`. |
| **Tripleta / Triple** | Unidad mínima de información en RDF. Ej: `<inmueble1> <tienePrecio> "100000"`. |
| **Sujeto** | El "qué" de la tripleta. Un IRI o blank node. |
| **Predicado** | La "propiedad" o relación. Siempre un IRI. |
| **Objeto** | El "valor". Puede ser otro IRI o un literal. |
| **IRI / URI** | Identificador único de un recurso. Ej: `http://www.wikidata.org/entity/Q42`. |
| **Literal** | Valor crudo: string, número, fecha. Puede llevar datatype (`^^xsd:integer`) o lang tag (`@es`). |
| **Blank node (bnode)** | Nodo anónimo. Usado para agrupar tripletas sin identificarlo globalmente. |
| **Prefijo** | Atajo para un namespace. `PREFIX wd: <http://www.wikidata.org/entity/>` permite escribir `wd:Q42`. |
| **Ontología** | Vocabulario formal: clases, propiedades y sus relaciones. Define el "schema" del KG. |
| **owl:sameAs** | Predicado OWL que declara que dos IRIs identifican la misma entidad. Usado en deduplicación. |
| **rdfs:label** | Predicado para el nombre legible de un recurso. |
| **rdf:type** | Predicado que asigna una clase a una entidad (`<inmueble1> rdf:type <Inmueble>`). |
| **Endpoint SPARQL** | Servicio HTTP que acepta queries SPARQL y devuelve resultados (JSON, XML, CSV). |
| **MillenniumDB** | Base de datos de grafos desarrollada en Chile, usada por LIFIA para hospedar el OVS. |
| **Wikidata** | KG público colaborativo (Wikimedia). Endpoint: `https://query.wikidata.org/sparql`. |

### Visualización e interacción

| Término | Definición |
|---|---|
| **Linking & brushing** | Técnica de visualización: la selección en una vista resalta los mismos datos en las otras vistas coordinadas. |
| **Focus + Context** | Estrategia para grafos densos: el nodo seleccionado y sus vecinos se muestran prominentemente, el resto se desvanece. |
| **Force-directed layout** | Algoritmo de layout que simula fuerzas físicas entre nodos. Bueno para grafos sin jerarquía. Implementación: `cola.js`. |
| **Clustering** | Agrupar marcadores cercanos en el mapa para evitar saturación visual. Implementación: `leaflet.markercluster`. |
| **Marker** | Pin en el mapa que representa un nodo georeferenciado. |
| **Vista coordinada** | Vista que comparte estado con otras vistas vía un servicio central (SelectionService). |
| **FlyTo** | Animación de Leaflet que mueve el mapa con zoom suave hacia un punto. |
| **Overlay de curado** | Almacenamiento separado (SQLite) que guarda correcciones sin modificar el grafo original. |
| **Deduplicador** | Componente externo al alcance de este proyecto que sugiere pares de nodos posibles duplicados. |
| **Anomalía** | Dato que un script detecta como sospechoso (ej: precio negativo, fecha futura). Se marca visualmente sin auto-corregir. |

### OVS (Observatorio de Valores del Suelo)

| Término | Definición |
|---|---|
| **OVS** | Grafo TTL hospedado en MillenniumDB con datos de inmuebles, barrios, precios e inmobiliarias del Gran La Plata. |
| **LINTA** | Laboratorio de Investigaciones del Territorio y el Ambiente, equipo que consume el OVS. |
| **cartoARBA** | Sistema GIS de ARBA (Agencia de Recaudación Bs As). Integración fuera de alcance. |
| **GeoNode** | Plataforma GIS open-source. Integración fuera de alcance. |

### Stack y conceptos técnicos

| Término | Definición |
|---|---|
| **Adapter (patrón)** | Patrón de diseño que envuelve una interfaz incompatible para que parezca otra. Acá: `SparqlEndpoint` envuelve Wikidata o MillenniumDB. |
| **BehaviorSubject** | Tipo de Subject de RxJS que recuerda el último valor emitido. Base del SelectionService. |
| **Standalone component** | Componente Angular 14+ que declara sus imports directamente, sin NgModule. |
| **Signal** | Primitiva reactiva de Angular 16+. Alternativa a BehaviorSubject en algunos casos. |
| **DTO (Data Transfer Object)** | Estructura para transferir datos entre capas/servicios. En NestJS, valida con `class-validator`. |
| **Pipe** | Transformador de valor. Angular: en templates. NestJS: en pipeline de request. |
