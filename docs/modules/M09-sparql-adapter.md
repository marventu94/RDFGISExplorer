# M09 — SPARQL Adapter

## Responsabilidad

Abstraer la ejecución de queries SPARQL y el acceso a metadatos (predicados, búsqueda) para que tanto el backend como el frontend puedan operar contra diferentes endpoints RDF (Wikidata, MillenniumDB, genérico) sin cambiar código de negocio.

## Backend — SparqlEndpoint

### Interfaz

```ts
interface SparqlEndpoint {
  executeQuery(sparql: string, limit?: number): Promise<QueryResult>;
  getPredicates(): Promise<string[]>;
}
```

### Implementaciones

- `WikidataAdapter` — HTTP a `query.wikidata.org/sparql`.
- `MillenniumDbAdapter` — stub para fase futura.
- `SparqlEndpointFactory` — resuelve la implementación según configuración o header.

### QueryResult normalizado

```ts
interface QueryResult {
  variables: string[];
  bindings: Record<string, BindingValue>[];
  nodes: NormalizedNode[];
  edges: NormalizedEdge[];
  meta: {
    durationMs: number;
    truncated: boolean;
    limitApplied: number;
    backend: string;
  };
}
```

## Frontend — RdfBackendAdapter (cliente)

### Motivación

`rdf_explorer` hacía fetch directo al endpoint SPARQL público. Con la plataforma unificada, delega la ejecución al backend NestJS para:
- Reutilizar la misma lógica de adaptación.
- Habilitar caching, rate-limiting o fallback en el backend.
- Simplificar CORS y manejo de errores.

### Interfaz

```ts
export interface RdfBackendAdapter {
  readonly id: string;
  textSearchTriple(label: string, keyword: string, limit: number): string;
  executeQuery(query: string, opts?: { signal?: AbortSignal }): Promise<QueryResult>;
  getPredicates(): Promise<string[]>;
}
```

### Implementaciones

- **`GisBackendAdapter`** (default): delega al backend local (`/api/query/execute`, `/api/sparql/predicates`).
- **`LegacyDirectAdapter`** (opcional, flag `backendMode: 'direct'`): mantiene la llamada directa original para regresión.

### Factory

```ts
export function createRdfBackendAdapter(
  settings: AppSettings,
  http: HttpClient,
): RdfBackendAdapter {
  if (settings.backendMode === 'direct' || settings.endpoint.url.includes('wikidata')) {
    return new LegacyDirectAdapter(settings);
  }
  return new GisBackendAdapter(http);
}
```

### Uso en rdf_explorer

- `RequestService.execQuery()` ahora usa `createRdfBackendAdapter()` en lugar de fetch directo.
- `SettingsService` tiene `backendMode: 'app-backend' | 'direct'` (default: `'app-backend'`).

## Criterios de aceptación

- Ejecutar una query desde `rdf_explorer` con `backendMode: 'app-backend'` produce una llamada a `POST /api/query/execute` (verificable en Network tab).
- El backend responde con el mismo `QueryResult` que consume `rdf_gis_explorer`.
- Cambiar a `backendMode: 'direct'` restaura el comportamiento legacy sin errores.
- `getPredicates()` funciona con ambos adapters.
