# Etapa 2 — Adapter de `rdf_explorer` al backend Nest

> **Prompt para sesión nueva de IA.** Copiá y pegá este archivo completo como primer mensaje. Trabajás en el repo `/home/mventurino/Documents/TESIS/programs/rdf_gis_explorer`. La spec maestra está en `docs/specs/2026-05-unified-platform.md` (§5, §7.3, §8 Fase 2).

## Objetivos

1. Promover `EndpointAdapter` (en `rdf_explorer`) a una interfaz `RdfBackendAdapter` que abstrae **toda** la interacción con el almacén RDF.
2. Implementar `GisBackendAdapter` que delega a `/api/sparql/execute` y `/api/sparql/predicates` del backend Nest.
3. Mantener `LegacyDirectAdapter` detrás de un flag (`backendMode`) para rollback / paridad.
4. Migrar consumidores (`query.service.ts`) para usar el adapter en lugar de `request.service.ts` directo.
5. Tests unit + paridad ≥80%.

## Contexto

- `rdf_explorer` hoy ejecuta queries directamente al endpoint público (Wikidata) desde `request.service.ts`.
- `EndpointAdapter` actual en `frontend/rdf_explorer/src/app/core/endpoint-adapter.ts` sólo abstrae sintaxis de full-text (`textSearchTriple`).
- El backend Nest ya tiene `SparqlEndpoint` adapter (`backend/src/adapters/sparql-endpoint.interface.ts`) e impls Wikidata/MillenniumDB consumidos por `/api/sparql/execute`.
- `rdf_gis_explorer` ya consume `/api/sparql/execute` — usar como referencia.

## Alcance

### Nueva interfaz

```ts
// frontend/rdf_explorer/src/app/core/endpoint-adapter.ts
export interface RdfBackendAdapter {
  readonly id: string;
  textSearchTriple(label: string, keyword: string, limit: number): string;
  executeQuery(query: string, opts: ExecuteOpts): Promise<QueryResult>;
  getPredicates(): Promise<string[]>;
}

export interface ExecuteOpts {
  backend?: 'wikidata' | 'millenniumdb';
  limit?: number;
  timeoutMs?: number;
  signal?: AbortSignal;
}
```

`QueryResult` debe matchear el shape de `backend/src/shared/dto/query-result.dto.ts`.

### Implementaciones

- **`GisBackendAdapter`** (default): HTTP a `/api/sparql/execute` y `/api/sparql/predicates`. Hereda `textSearchTriple` del `Generic` actual.
- **`LegacyDirectAdapter`**: wrapper sobre `request.service.ts` actual, para regresión.

### Selección

`SettingsService` (existente) agrega:

```ts
interface AppSettings {
  // ...
  backendMode: 'app-backend' | 'direct';   // default 'app-backend'
}
```

Factory:

```ts
export function createRdfBackendAdapter(
  settings: AppSettings,
  http: HttpClient,
): RdfBackendAdapter {
  if (settings.backendMode === 'direct') return new LegacyDirectAdapter(...);
  return new GisBackendAdapter(http, /* baseUrl */);
}
```

### Archivos a tocar

- `frontend/rdf_explorer/src/app/core/endpoint-adapter.ts`
- `frontend/rdf_explorer/src/app/core/endpoint-adapter.spec.ts`
- `frontend/rdf_explorer/src/app/core/query.service.ts`
- `frontend/rdf_explorer/src/app/core/settings.service.ts`
- `frontend/rdf_explorer/src/app/core/settings.types.ts`
- `frontend/rdf_explorer/src/app/core/request.service.ts`
- `frontend/rdf_explorer/proxy.conf.json` (proxy a `:3000`)

## Tests

- Unit del `GisBackendAdapter` con `HttpClientTestingModule`.
- **Paridad**: fixture de 3-5 queries SPARQL ejecutadas con legacy y nuevo adapter; deep-equal del shape de respuesta.
- Cobertura ≥80%.

## Out of scope

- Persistencia (Etapa 3b).
- UI nueva.

## Criterios de aceptación

- [ ] Con `backendMode: 'app-backend'`, `rdf_explorer` standalone (:4201) ejecuta queries y los logs del backend muestran las llamadas.
- [ ] Network tab muestra requests sólo a `localhost:3000`, no a `query.wikidata.org`.
- [ ] Cambiar a `backendMode: 'direct'` restaura comportamiento legacy.
- [ ] Autocompletado de predicados sigue funcionando.
- [ ] Tests de paridad pasan.
- [ ] Cobertura ≥80% en el adapter.

## Commit final (obligatorio)

```
feat(rdf_explorer): migra a RdfBackendAdapter consumiendo backend Nest

- Promueve EndpointAdapter a interfaz cliente completa
- Agrega GisBackendAdapter (default) y LegacyDirectAdapter (rollback)
- Setting backendMode para alternar
- query.service y request.service consumen el nuevo adapter
- Tests unit + paridad, cobertura ≥80%

Refs: docs/specs/stages/02-adapter-rdf-explorer.md
```

Detenete después del commit.
