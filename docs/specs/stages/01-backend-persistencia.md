# Etapa 1 — Backend de persistencia de tableros

> **Prompt para sesión nueva de IA.** Copiá y pegá este archivo completo como primer mensaje. Trabajás en el repo `/home/mventurino/Documents/TESIS/programs/rdf_gis_explorer`. La spec maestra está en `docs/specs/2026-05-unified-platform.md` (§3, §4, §7.1, §8 Fase 1).

## Objetivos

1. Crear módulo NestJS `dashboards` con CRUD completo.
2. Persistir en SQLite local (`backend/data/dashboards.sqlite`).
3. Soportar dos tipos discriminados: `gis` y `explorer`.
4. Endpoint dedicado `/recent` para WelcomePage.
5. Tests unitarios + e2e con cobertura ≥80%.

## Contexto

- Backend NestJS en `backend/`. Patrones existentes en `backend/src/modules/query/` y `backend/src/modules/sparql/`.
- Envelope `ApiResponse<T>` ya convenido — leer `docs/02-data-contracts.md` antes de inventar.
- Validaciones con `class-validator` (ya usado, ver `backend/src/modules/query/dto/`).
- Single-user (sin auth).

## Modelo

```ts
interface Dashboard {
  id: string;            // uuid v4
  kind: 'gis' | 'explorer';
  name: string;          // 1..200 chars
  payload: object;       // JSON opaco, no vacío
  createdAt: string;     // ISO
  updatedAt: string;
}
```

### Esquema DB

```sql
CREATE TABLE dashboards (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('gis','explorer')),
  name TEXT NOT NULL,
  payload TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX idx_dashboards_updated ON dashboards(updated_at DESC);
```

## Alcance

### Endpoints

| Método | Ruta | Body | Response |
|--------|------|------|----------|
| `GET` | `/api/dashboards` | — | `Dashboard[]` (`updatedAt` desc) |
| `GET` | `/api/dashboards/recent?limit=10` | — | `Dashboard[]` |
| `GET` | `/api/dashboards/:id` | — | `Dashboard` o 404 |
| `POST` | `/api/dashboards` | `{ kind, name, payload }` | `Dashboard` 201 |
| `PUT` | `/api/dashboards/:id` | `{ name?, payload? }` | `Dashboard` 200 |
| `DELETE` | `/api/dashboards/:id` | — | 204 |

### Decisión de ORM

Revisar `backend/package.json` primero. Si ya hay TypeORM o Prisma instalado, usar ese. Si no, **Prisma** (mejor DX para migraciones).

### Archivos a crear

```
backend/src/modules/dashboards/
├── dto/
│   ├── create-dashboard.dto.ts
│   ├── update-dashboard.dto.ts
│   └── dashboard.dto.ts
├── dashboards.entity.ts (o schema Prisma)
├── dashboards.controller.ts
├── dashboards.controller.spec.ts
├── dashboards.service.ts
├── dashboards.service.spec.ts
└── dashboards.module.ts
```

Más: migración inicial, registro en `app.module.ts`, config DB en `backend/src/db/`.

### Validaciones

- `kind` ∈ {`gis`, `explorer`}.
- `name`: trim, longitud 1..200.
- `payload`: objeto no vacío, ≤1 MB serializado.
- `limit` en `/recent`: 1..50, default 10.

## Out of scope

- Consumo desde frontend (Etapas 3a/3b/4).
- Auth.

## Criterios de aceptación

- [ ] `curl -X POST http://localhost:3000/api/dashboards -d '{"kind":"gis","name":"test","payload":{"q":"SELECT *"}}' -H 'Content-Type: application/json'` retorna 201.
- [ ] `GET /api/dashboards/recent?limit=5` retorna ordenado.
- [ ] `PUT` actualiza `updatedAt`.
- [ ] `DELETE` retorna 204 y el siguiente `GET` da 404.
- [ ] Validaciones rechazan `kind` inválido, `name` vacío, `payload` no objeto.
- [ ] Tests pasan con cobertura ≥80% del módulo.

## Commit final (obligatorio)

```
feat(backend): agrega modulo dashboards con persistencia SQLite

- CRUD completo en /api/dashboards (gis | explorer)
- Endpoint /recent para WelcomePage
- Validaciones de kind, name, payload con class-validator
- Tests unit del service + e2e del controller, cobertura ≥80%

Refs: docs/specs/stages/01-backend-persistencia.md
```

Detenete después del commit.
