# M11 — Dashboards Persistence

## Responsabilidad

Persistencia de tableros (workspaces de Explorer y dashboards de GIS) en el backend NestJS + SQLite. El backend trata el payload como JSON opaco; cada frontend conoce la forma de su propio estado.

## Backend

### Esquema SQLite

```sql
CREATE TABLE IF NOT EXISTS dashboards (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('gis','explorer')),
  name TEXT NOT NULL,
  payload TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_dashboards_updated ON dashboards(updated_at DESC);
```

### Endpoints

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/api/dashboards` | Todos los dashboards ordenados por `updatedAt` desc |
| GET | `/api/dashboards/recent?limit=10` | Subset para WelcomePage |
| GET | `/api/dashboards/:id` | Dashboard por ID |
| POST | `/api/dashboards` | Crear (body: `{ kind, name, payload }`) |
| PUT | `/api/dashboards/:id` | Actualizar nombre y/o payload |
| DELETE | `/api/dashboards/:id` | Eliminar (204) |

### Implementación

- `DashboardsController` — REST estándar.
- `DashboardsService` — acceso a SQLite vía `better-sqlite3`.
- `DASHBOARDS_DB` token de inyección para la conexión a DB separada de la de curado.

## Frontend — Explorer

### WorkspacePersistenceService

- Mantiene `panels` (signal) y `activePanelId`.
- `saveWorkspace(name, overwriteId?)` → serializa grafo + settings → API.
- `loadWorkspace(id)` → deserializa payload → restaura paneles y settings.
- Se integra con `MainComponent` que escucha `?workspaceId=` en los query params.

### Payload Explorer

```ts
interface ExplorerWorkspacePayload {
  panels: Array<{
    id: string;
    name: string;
    graph: ExplorerSerializedGraph;
    generatedQuery: string;
    variables: string[];
  }>;
  activePanelId: string;
  settings: {
    endpointType: 'virtuoso' | 'fuseki' | 'generic';
    backendMode: 'app-backend' | 'direct';
    limit: number;
  };
}
```

## Frontend — GIS

### DashboardPersistenceService

- `serialize()` → extrae estado de `DashboardLayoutService`, `SelectionService`, `SparqlQueryStateService`, `DashboardViewStateService`.
- `deserialize(payload)` → reconstruye layout, filtros, selección; ejecuta query automáticamente vía `ApiService`.
- `save(name, mode)` → crea o sobrescribe en API.
- `load(id)` → obtiene dashboard y llama a `deserialize()`.

### Payload GIS

```ts
interface GisDashboardPayload {
  query: string;
  backend: 'wikidata' | 'millenniumdb';
  layout: {
    slotsCount: 1 | 2 | 3 | 4;
    slots: Array<{ id: string; view: 'map' | 'timeline' | 'graph' | 'table' }>;
  };
  filters: {
    table?: { quickFilter?: string; pageSize?: number };
    timeline?: { rangeStart?: string; rangeEnd?: string };
    map?: { center: [number, number]; zoom: number; activeLayers?: string[] };
    graph?: { layout: string };
  };
  selection?: { selectedIds: string[]; pinnedId?: string };
}
```

## Criterios de aceptación

- Crear, leer, actualizar y eliminar dashboards vía API.
- `recent` devuelve los últimos N ordenados por `updatedAt`.
- Round-trip: serialize → API → deserialize produce estado funcionalmente idéntico.
- Los payloads de ambas apps coexisten en la misma tabla sin conflicto.
