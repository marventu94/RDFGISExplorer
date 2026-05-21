# M08 — Backend API (NestJS)

## 1. Contexto

Capa REST que media entre el frontend y los adapters SPARQL (M09) + SQLite (M06). Expone los endpoints que las vistas consumen, valida sintaxis SPARQL antes de delegar al adapter, y gestiona el overlay de curado.

## 2. Alcance

**SÍ implementa:**
- Módulos NestJS: `QueryModule`, `SuggestionModule`, `CurationModule`.
- Endpoints HTTP detallados en §6.
- Validación de SPARQL con `sparqljs` antes de ejecutar.
- Aplicación de `LIMIT`/timeout configurables.
- Manejo de errores y mapeo a códigos HTTP de [02-data-contracts.md §6](../02-data-contracts.md).
- Conexión a SQLite con `better-sqlite3` y migraciones simples.
- Health checks: `/health`, `/health/sparql`.
- CORS configurable.

**NO implementa:**
- Adapters SPARQL concretos (M09).
- UI de curado (M06 frontend).
- Autenticación (fuera de alcance — toda escritura usa `author` desde el header `X-Author`).

## 3. Requerimientos funcionales

| ID | Prioridad | Descripción | Criterio de aceptación |
|---|---|---|---|
| API-01 | Alta | `POST /query/execute` valida sparql y ejecuta vía `SparqlEndpoint` | E2E: query válida devuelve `QueryResult`; query inválida devuelve 400 con `INVALID_SPARQL` |
| API-02 | Alta | Limit default 500, cap 2000 | Request con `limit=3000` → 413 con `LIMIT_EXCEEDED` |
| API-03 | Alta | Timeout 10s | Query lenta devuelve 408 con `TIMEOUT` |
| API-04 | Alta | `GET /suggestions/predicates` con caché 1h | Llamadas dentro de la ventana usan caché (verificable con spy) |
| API-05 | Alta | `GET /curation/:nodeUri` devuelve registros del nodo | Test con SQLite en memoria |
| API-06 | Alta | `POST /curation` crea registro con author, timestamp | Persistido en SQLite; response 201 con el record |
| API-07 | Alta | `PATCH /curation/:id` actualiza `manual_value` o `status` | Solo el author original o role admin puede modificar (validación simple por header) |
| API-08 | Alta | `GET /curation/duplicates/:nodeUri` lista candidatos | Devuelve `DuplicateCandidate[]` |
| API-09 | Alta | `POST /curation/duplicates/:id/decision` confirma/rechaza | Update de `decision`, `decidedBy`, `decidedAt` |
| API-10 | Alta | Health checks funcionan | `GET /health` 200; `GET /health/sparql` ejecuta query trivial |
| API-11 | Alta | CORS configurable por env | Origins de `CORS_ORIGINS` aceptados; otros rechazados |
| API-12 | Media | Logging estructurado (json lines) con nivel configurable | Todos los requests loguean method, path, status, duración |

## 4. Dependencias

- **Lee de:** M09 (SparqlEndpoint, inyectado por DI).
- **Es consumido por:** todos los módulos frontend (M01 a M06 directa o indirectamente vía un `ApiService`).
- **Librerías:** `@nestjs/core`, `@nestjs/common`, `@nestjs/config`, `axios`, `sparqljs`, `better-sqlite3`, `class-validator`, `class-transformer`.

## 5. Interfaces TypeScript

Los DTOs viven en `backend/src/shared/dto/`. Reflejan los tipos de [02-data-contracts.md](../02-data-contracts.md).

```ts
// query.dto.ts
import { IsString, IsOptional, IsInt, Min, Max } from 'class-validator';

export class ExecuteQueryDto {
  @IsString()
  sparql!: string;

  @IsOptional() @IsInt() @Min(1) @Max(2000)
  limit?: number;
}

// curation.dto.ts
export class CreateCurationDto {
  @IsString() nodeUri!: string;
  @IsString() fieldName!: string;
  @IsOptional() @IsString() rawValue?: string;
  @IsOptional() @IsString() manualValue?: string;
  @IsIn(['validated', 'corrected', 'pending'])
  status!: 'validated' | 'corrected' | 'pending';
}

export class UpdateCurationDto {
  @IsOptional() @IsString() manualValue?: string;
  @IsOptional() @IsIn(['validated', 'corrected', 'pending']) status?: string;
}
```

## 6. Contrato HTTP

### Query

#### `POST /query/execute`
Request:
```json
{ "sparql": "SELECT ?x WHERE { ?x ?p ?o } LIMIT 10", "limit": 500 }
```
Response 200:
```json
{ "variables": ["x"], "bindings": [...], "nodes": [...], "edges": [...], "meta": {...} }
```
Errores: `400 INVALID_SPARQL`, `408 TIMEOUT`, `413 LIMIT_EXCEEDED`, `502 UPSTREAM_ERROR`.

#### `GET /suggestions/predicates`
Response 200:
```json
{ "predicates": ["wdt:P31", "wdt:P625", "rdfs:label", ...] }
```

### Curation

#### `GET /curation/:nodeUri`
`:nodeUri` URL-encoded. Response:
```json
{ "records": [CurationRecord], "duplicates": [DuplicateCandidate] }
```

#### `POST /curation`
Header `X-Author: user@email` requerido.
Body: `CreateCurationDto`.
Response 201: `CurationRecord`.

#### `PATCH /curation/:id`
Header `X-Author: user@email`.
Body: `UpdateCurationDto`.
Response 200: `CurationRecord`.

#### `POST /curation/duplicates/:id/decision`
Body: `{ "decision": "confirmed" | "rejected" }`.
Response 200: `DuplicateCandidate`.

### Health

#### `GET /health`
```json
{ "status": "ok", "backend": "wikidata", "dbConnected": true, "uptime": 12345 }
```

#### `GET /health/sparql`
Ejecuta `SELECT ?s WHERE { ?s ?p ?o } LIMIT 1` y reporta latencia.

## 7. Comportamiento esperado

### Validación SPARQL
```ts
import { Parser } from 'sparqljs';
const parser = new Parser();
try {
  parser.parse(dto.sparql);
} catch (e) {
  throw new BadRequestException({ error: 'INVALID_SPARQL', message: e.message });
}
```

### Aplicación de LIMIT
- Si la query no tiene `LIMIT`, el backend reescribe agregando `LIMIT 500` (o el valor del request).
- Si tiene `LIMIT` y supera 2000 → 413.
- Si tiene `LIMIT` ≤ default, se respeta.

### Schema SQLite

```sql
CREATE TABLE IF NOT EXISTS curation_records (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  node_uri TEXT NOT NULL,
  field_name TEXT NOT NULL,
  raw_value TEXT,
  script_value TEXT,
  manual_value TEXT,
  status TEXT NOT NULL CHECK(status IN ('validated','corrected','pending')),
  author TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(node_uri, field_name)
);

CREATE INDEX idx_curation_node ON curation_records(node_uri);

CREATE TABLE IF NOT EXISTS duplicate_candidates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  node_uri_a TEXT NOT NULL,
  node_uri_b TEXT NOT NULL,
  score REAL NOT NULL CHECK(score >= 0 AND score <= 1),
  decision TEXT NOT NULL DEFAULT 'pending' CHECK(decision IN ('pending','confirmed','rejected')),
  decided_by TEXT,
  decided_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(node_uri_a, node_uri_b)
);
```

Migraciones: archivo `backend/src/db/migrations.sql` ejecutado al boot del módulo.

### Errores
Filtro global `HttpExceptionFilter` que convierte excepciones a los códigos de [02-data-contracts.md §6](../02-data-contracts.md).

## 8. Ejemplos

### Request golden path
```bash
curl -X POST http://localhost:3000/query/execute \
  -H "Content-Type: application/json" \
  -d '{
    "sparql": "PREFIX wd: <http://www.wikidata.org/entity/> PREFIX wdt: <http://www.wikidata.org/prop/direct/> SELECT ?city ?coord WHERE { ?city wdt:P31 wd:Q515 ; wdt:P17 wd:Q414 ; wdt:P625 ?coord } LIMIT 20"
  }'
```

### Crear curación
```bash
curl -X POST http://localhost:3000/curation \
  -H "Content-Type: application/json" \
  -H "X-Author: martin@bago.com.ar" \
  -d '{
    "nodeUri": "http://www.wikidata.org/entity/Q1486",
    "fieldName": "population",
    "rawValue": "3075646",
    "manualValue": "3120000",
    "status": "corrected"
  }'
```

## 9. Criterios de aceptación

- [ ] Los 3 módulos NestJS implementados y registrados en `AppModule`.
- [ ] Todos los endpoints de §6 funcionan con request/response del shape correcto.
- [ ] Validación de SPARQL con `sparqljs` antes de delegar al adapter.
- [ ] Migraciones SQLite corren al boot, idempotentes.
- [ ] `HttpExceptionFilter` global mapea errores según [02 §6](../02-data-contracts.md).
- [ ] Cobertura tests ≥70% en `services/`.
- [ ] CORS configurado por env.
- [ ] Health checks responden.
- [ ] `backend/src/main.ts` configura: validation pipe global, CORS, prefijo `/api` opcional.

## 10. Prompt para AI ejecutora

```
Sos un experto en NestJS 10 + better-sqlite3 + sparqljs.

Lee primero (obligatorio):
- docs/00-architecture.md
- docs/01-tech-stack.md
- docs/02-data-contracts.md (todo)
- docs/03-setup-and-docker.md
- docs/04-conventions-and-glossary.md
- docs/modules/M08-backend-api.md (este archivo, completo)
- docs/modules/M09-sparql-adapter.md (para entender la interfaz que consumís)

Pre-requisito: M09 debe estar implementado (la interfaz SparqlEndpoint y al menos el factory).

Archivos a crear:
- backend/src/main.ts
- backend/src/app.module.ts
- backend/src/modules/query/{query.module.ts, query.controller.ts, query.service.ts, dto/execute-query.dto.ts}
- backend/src/modules/suggestions/{suggestions.module.ts, suggestions.controller.ts, suggestions.service.ts}
- backend/src/modules/curation/{curation.module.ts, curation.controller.ts, curation.service.ts, dto/}
- backend/src/modules/health/{health.module.ts, health.controller.ts}
- backend/src/db/{database.module.ts, migrations.sql, sqlite.provider.ts}
- backend/src/common/filters/http-exception.filter.ts
- backend/src/shared/dto/curation.dto.ts (clases con class-validator)
- Tests `.spec.ts` para cada servicio y controller (smoke).

Restricciones:
- NO toques backend/src/adapters/ (es de M09).
- NO modifiques 02-data-contracts.md.
- TS strict, sin any.

Definición de hecho:
- Todos los criterios de §9 verificados.
- Tests pasan (incluyendo un E2E con supertest contra un Wikidata mock).
- docker-compose up arranca el servicio y `curl /health` devuelve 200.
```
