# Etapa 3a — Persistencia de tableros en `rdf_gis_explorer`

> **Prompt para sesión nueva de IA.** Copiá y pegá este archivo completo como primer mensaje. Trabajás en el repo `/home/mventurino/Documents/TESIS/programs/rdf_gis_explorer`. La spec maestra está en `docs/specs/2026-05-unified-platform.md` (§3, §6.4, §7.2, §8 Fase 3).

## Objetivos

1. Serializar el estado completo del dashboard GIS (query + layout + filtros + selección).
2. Crear `DashboardPersistenceService` + `DashboardApiClient`.
3. Agregar botón "Guardar tablero" con modal (nombre + sobreescribir/copia).
4. Hidratar desde `?dashboardId=:id` reconstruyendo el estado.
5. Tests round-trip + cobertura ≥80%.

## Contexto

Servicios actuales relevantes en `frontend/rdf_gis_explorer/src/app/`:

- `core/services/dashboard-layout.service.ts` — cantidad de vistas y qué vista en cada slot.
- `core/services/selection.service.ts` — selección cross-vista.
- `features/sparql-input/` — query actual.
- Cada feature (`map-view`, `timeline-view`, `graph-view`, `table-view`) tiene estado interno (filtros, viewport, etc).

Backend con `/api/dashboards` ya disponible (Etapa 1).

## Modelo

```ts
interface GisDashboardPayload {
  query: string;
  backend: 'wikidata' | 'millenniumdb';
  layout: {
    slotsCount: 1 | 2 | 3 | 4;
    slots: Array<{ id: string; view: 'map'|'timeline'|'graph'|'table' }>;
  };
  filters: {
    table?: TableFilterState;
    timeline?: { rangeStart?: string; rangeEnd?: string };
    map?: { center: [number, number]; zoom: number; activeLayers?: string[] };
    graph?: { layout: string };
  };
  selection?: { selectedIds: string[]; pinnedId?: string };
}
```

Las shapes exactas se derivan leyendo los servicios actuales. Tipos `Readonly`, serialización **pura**.

## Alcance

### Cliente HTTP

```ts
class DashboardApiClient {
  list(): Observable<Dashboard[]>;
  get(id: string): Observable<Dashboard>;
  create(input: { kind: 'gis'; name: string; payload: GisDashboardPayload }): Observable<Dashboard>;
  update(id: string, input: Partial<{ name: string; payload: GisDashboardPayload }>): Observable<Dashboard>;
  delete(id: string): Observable<void>;
}
```

### UI

- Botón "Guardar tablero" en navbar.
- Modal `SaveDashboardDialogComponent`:
  - Input nombre (si es nuevo).
  - Si hay dashboard cargado: "Sobreescribir" / "Guardar como copia".
- Snackbar de feedback.

### Hidratación

`?dashboardId=:id` →

1. `GET /api/dashboards/:id`.
2. Hidratar en orden: query → ejecutar → layout → filtros → selección.
3. Loader durante hidratación.
4. Si falla: snackbar + navegar a `/gis` vacío.

### Archivos a crear/tocar

- `frontend/rdf_gis_explorer/src/app/core/services/dashboard-persistence.service.{ts,spec.ts}`
- `frontend/rdf_gis_explorer/src/app/core/services/dashboard-api.client.ts`
- `frontend/rdf_gis_explorer/src/app/features/dashboard/save-dashboard-dialog.component.{ts,html,scss}`
- `frontend/rdf_gis_explorer/src/app/features/dashboard/dashboard.component.ts`

## Tests

- Round-trip `serialize → deserialize → deep-equal` con estado completo.
- Mock API client para flow guardar/cargar.
- Manejo de errores HTTP.

## Out of scope

- Persistencia del Explorer (Etapa 3b).
- WelcomePage (Etapa 4).

## Criterios de aceptación

- [ ] Ejecutar query, configurar 3 vistas, aplicar filtros, seleccionar, guardar "demo".
- [ ] Recargar y abrir `/gis?dashboardId=<id>` → estado restaurado idéntico.
- [ ] "Sobreescribir" actualiza el mismo registro (`updatedAt` cambia).
- [ ] "Guardar como copia" crea uno nuevo.
- [ ] Tests round-trip pasan; cobertura ≥80%.

## Commit final (obligatorio)

```
feat(gis): persiste tableros GIS (query + layout + filtros + seleccion)

- DashboardPersistenceService con serializacion pura del estado
- DashboardApiClient contra /api/dashboards
- Modal "Guardar tablero" con sobreescribir/copia
- Hidratacion via ?dashboardId
- Tests round-trip, cobertura ≥80%

Refs: docs/specs/stages/03a-persistencia-gis.md
```

Detenete después del commit.
