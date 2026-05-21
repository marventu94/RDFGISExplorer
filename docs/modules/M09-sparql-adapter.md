# M09 — SPARQL Adapter

## 1. Contexto

El backend no debe acoplarse a un endpoint SPARQL concreto. Este módulo define la **interfaz `SparqlEndpoint`** y provee dos implementaciones intercambiables vía env var. En fase 1 se trabaja contra **Wikidata** (público, no requiere infra). En fase 2 se incorpora **MillenniumDB** sin tocar el resto del backend ni el frontend.

Este módulo es el más crítico para destrabar el desarrollo: una vez listo, todos los demás módulos pueden empezar.

## 2. Alcance

**SÍ implementa:**
- Interfaz `SparqlEndpoint` con métodos `execute()` y `getPredicates()`.
- `WikidataAdapter`: implementación real contra `https://query.wikidata.org/sparql`.
- `MillenniumDBAdapter`: stub que lanza `NotImplementedError` con mensaje claro.
- Factory que decide qué adapter inyectar según `process.env.SPARQL_BACKEND`.
- Normalización de respuestas Wikidata al tipo `QueryResult` ([02-data-contracts.md](../02-data-contracts.md)).

**NO implementa:**
- Endpoints HTTP del backend (eso es M08).
- Cache de queries (fuera de alcance, eventualmente).
- Validación de sintaxis SPARQL (M08).

## 3. Requerimientos funcionales

| ID | Prioridad | Descripción | Criterio de aceptación |
|---|---|---|---|
| ADP-01 | Alta | Interfaz `SparqlEndpoint` con `execute()` y `getPredicates()` | Compila en TS estricto, está exportada y documentada con JSDoc |
| ADP-02 | Alta | `WikidataAdapter` ejecuta queries contra `query.wikidata.org` y devuelve `QueryResult` | Test E2E con query trivial (`SELECT ?x WHERE { wd:Q42 rdfs:label ?x } LIMIT 1`) retorna binding válido |
| ADP-03 | Alta | Header `User-Agent` obligatorio leído de env var | Si falta `SPARQL_USER_AGENT`, el adapter loguea warn y usa default. Test verifica header en request |
| ADP-04 | Alta | Timeout configurable vía `SPARQL_TIMEOUT_MS` (default 10000) | Test con `nock` simula respuesta >10s y verifica que se lanza `TimeoutError` |
| ADP-05 | Alta | Normalización de bindings Wikidata a `BindingValue` tipados | Test verifica que coordenadas, fechas, URIs y literales se mapean según tabla de [02-data-contracts.md](../02-data-contracts.md) §5 |
| ADP-06 | Alta | `MillenniumDBAdapter` stub lanza `NotImplementedError` | Test verifica el throw con mensaje claro |
| ADP-07 | Alta | Factory `SparqlEndpointFactory` lee `SPARQL_BACKEND` y devuelve la impl correcta | Test parametrizado con ambos valores devuelve la instancia esperada |
| ADP-08 | Media | `getPredicates()` cachea resultado en memoria por 1h | Llamadas sucesivas no hacen HTTP request adicional dentro de la ventana |

## 4. Dependencias

- **Lee de:** nada (es la capa más baja).
- **Es consumido por:** M08 (Backend API). M08 inyecta `SparqlEndpoint` por DI.
- **Librerías:** `axios ^1.6.0`, `sparqljs ^3.7.0`, `@nestjs/config ^3.2.0`.

## 5. Interfaces TypeScript

```ts
// backend/src/adapters/sparql-endpoint.interface.ts
import { QueryResult } from '../shared/dto/query-result.dto';

export interface ExecuteOptions {
  timeoutMs: number;
  limit: number;
  /** AbortSignal para cancelación manual. */
  signal?: AbortSignal;
}

export interface SparqlEndpoint {
  /**
   * Ejecuta una query SPARQL contra el endpoint configurado.
   * @throws TimeoutError si supera opts.timeoutMs
   * @throws UpstreamError si el endpoint devuelve 5xx
   */
  execute(query: string, opts: ExecuteOptions): Promise<QueryResult>;

  /**
   * Lista de predicados disponibles (para autocompletado del editor SPARQL).
   * Cachea internamente.
   */
  getPredicates(): Promise<string[]>;

  /** Nombre del backend para `QueryResult.meta.backend`. */
  readonly backendName: 'wikidata' | 'millenniumdb';
}

export class TimeoutError extends Error { constructor(public timeoutMs: number) { super(`Query timed out after ${timeoutMs}ms`); } }
export class UpstreamError extends Error { constructor(public status: number, message: string) { super(message); } }
export class NotImplementedError extends Error { constructor(feature: string) { super(`Not implemented: ${feature}`); } }
```

## 6. Contrato HTTP saliente (Wikidata)

```http
POST https://query.wikidata.org/sparql
Accept: application/sparql-results+json
Content-Type: application/x-www-form-urlencoded
User-Agent: rdf-gis-explorer/0.1 (contacto@email)

query=<urlencoded SPARQL>
```

Response (Wikidata canonical format):
```json
{
  "head": { "vars": ["item", "itemLabel", "coord"] },
  "results": {
    "bindings": [
      {
        "item": { "type": "uri", "value": "http://www.wikidata.org/entity/Q42" },
        "itemLabel": { "xml:lang": "en", "type": "literal", "value": "Douglas Adams" },
        "coord": { "datatype": "http://www.opengis.net/ont/geosparql#wktLiteral", "type": "literal", "value": "Point(-1.4 51.4)" }
      }
    ]
  }
}
```

El adapter mapea esto a `QueryResult` según las reglas de §5 de [02-data-contracts.md](../02-data-contracts.md).

## 7. Comportamiento esperado

### Golden path
1. M08 inyecta `SparqlEndpoint` por DI.
2. Llama `endpoint.execute(query, { timeoutMs: 10000, limit: 500 })`.
3. `WikidataAdapter` arma el body URL-encoded, agrega `User-Agent`, POST a Wikidata.
4. Recibe JSON, normaliza bindings a `BindingValue[]`, deriva `NormalizedNode[]` y `NormalizedEdge[]`.
5. Devuelve `QueryResult` con `meta.backend = 'wikidata'`, `meta.durationMs`, `meta.truncated`.

### Edge cases
- **Timeout:** `AbortController` con `setTimeout(timeoutMs)`. Si dispara, lanza `TimeoutError`.
- **Wikidata 429 (rate limit):** retry con exponential backoff (3 intentos: 500ms, 1500ms, 4500ms). Si los 3 fallan, lanza `UpstreamError(429, ...)`.
- **Wikidata 5xx:** sin retry. Lanza `UpstreamError(status, ...)`.
- **Query vacía (sin bindings):** devuelve `QueryResult` con arrays vacíos, `meta.truncated = false`.
- **Limit alcanzado:** Wikidata no avisa explícitamente. El adapter compara `bindings.length === limit` → `meta.truncated = true`.

## 8. Ejemplos

### Query Wikidata de prueba (ciudades de Argentina con coordenadas)

```sparql
PREFIX wd: <http://www.wikidata.org/entity/>
PREFIX wdt: <http://www.wikidata.org/prop/direct/>
PREFIX wikibase: <http://wikiba.se/ontology#>
PREFIX bd: <http://www.bigdata.com/rdf#>

SELECT ?city ?cityLabel ?coord ?population WHERE {
  ?city wdt:P31 wd:Q515 ;        # instance of city
        wdt:P17 wd:Q414 ;        # country = Argentina
        wdt:P625 ?coord .         # coordinates
  OPTIONAL { ?city wdt:P1082 ?population . }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "es,en" . }
}
LIMIT 50
```

### Mock de respuesta para tests (fixture)

```ts
// backend/test/fixtures/wikidata-cities.json
{
  "head": { "vars": ["city", "cityLabel", "coord", "population"] },
  "results": {
    "bindings": [
      {
        "city": { "type": "uri", "value": "http://www.wikidata.org/entity/Q1486" },
        "cityLabel": { "xml:lang": "es", "type": "literal", "value": "Buenos Aires" },
        "coord": { "datatype": "http://www.opengis.net/ont/geosparql#wktLiteral", "type": "literal", "value": "Point(-58.3816 -34.6037)" },
        "population": { "datatype": "http://www.w3.org/2001/XMLSchema#decimal", "type": "literal", "value": "3075646" }
      }
    ]
  }
}
```

### Normalización esperada

```ts
{
  variables: ["city", "cityLabel", "coord", "population"],
  bindings: [
    {
      city: { type: 'uri', value: 'http://www.wikidata.org/entity/Q1486' },
      cityLabel: { type: 'literal', value: 'Buenos Aires', lang: 'es' },
      coord: { type: 'coordinate', value: { lat: -34.6037, lng: -58.3816 }, raw: 'Point(-58.3816 -34.6037)' },
      population: { type: 'literal', value: '3075646', datatype: 'http://www.w3.org/2001/XMLSchema#decimal' }
    }
  ],
  nodes: [{
    uri: 'http://www.wikidata.org/entity/Q1486',
    label: 'Buenos Aires',
    coordinate: { lat: -34.6037, lng: -58.3816 },
    attributes: { /* ... */ }
  }],
  edges: [],
  meta: { durationMs: 245, truncated: false, limitApplied: 50, backend: 'wikidata' }
}
```

## 9. Criterios de aceptación

- [ ] Interfaz `SparqlEndpoint` exportada desde `adapters/sparql-endpoint.interface.ts`.
- [ ] `WikidataAdapter` ejecuta la query de ejemplo de §8 contra el endpoint real y devuelve >1 binding.
- [ ] Header `User-Agent` está presente en el request (verificable con un test `nock`).
- [ ] Timeout funciona: query simulada con respuesta >10s lanza `TimeoutError`.
- [ ] Normalización de coordenadas WKT (`Point(lng lat)`) → `{ lat, lng }` con orden correcto (¡ojo! WKT es lng-lat, devolvemos lat-lng).
- [ ] Normalización de fechas con `xsd:date` y `xsd:dateTime` a ISO 8601.
- [ ] `MillenniumDBAdapter` lanza `NotImplementedError("MillenniumDB adapter — pending fase 2")`.
- [ ] Factory `SparqlEndpointFactory` con `SPARQL_BACKEND=wikidata` → `WikidataAdapter`; con `=millenniumdb` → `MillenniumDBAdapter`.
- [ ] Cobertura ≥80% en `adapters/wikidata.adapter.ts`.

## 10. Prompt para AI ejecutora

```
Sos un experto en NestJS 10 y TypeScript estricto. Tu tarea es implementar el módulo M09 (SPARQL Adapter).

Lee primero (obligatorio):
- docs/00-architecture.md
- docs/01-tech-stack.md
- docs/02-data-contracts.md (especialmente §1, §2 y §5)
- docs/04-conventions-and-glossary.md
- docs/modules/M09-sparql-adapter.md (este archivo, completo)

NO leas otros módulos. M09 es la capa más baja: no consume de nadie.

Archivos a crear:
- backend/src/adapters/sparql-endpoint.interface.ts
- backend/src/adapters/wikidata.adapter.ts
- backend/src/adapters/millenniumdb.adapter.ts
- backend/src/adapters/sparql-endpoint.factory.ts
- backend/src/adapters/wikidata.adapter.spec.ts
- backend/src/adapters/sparql-endpoint.factory.spec.ts
- backend/test/fixtures/wikidata-cities.json
- backend/src/shared/dto/query-result.dto.ts (los tipos de 02-data-contracts.md como clases con class-validator donde aplique)

Restricciones:
- NO modifiques 02-data-contracts.md.
- NO toques nada fuera de backend/src/adapters/ y backend/src/shared/dto/.
- Usa axios para HTTP. Usa nock para tests.
- TS strict, sin `any`, sin `@ts-ignore`.

Definición de hecho:
- Todos los criterios de §9 verificados con tests pasando.
- `pnpm run lint` y `pnpm run typecheck` limpios.
- README breve en `backend/src/adapters/README.md` explicando cómo agregar un nuevo adapter en el futuro.
```
