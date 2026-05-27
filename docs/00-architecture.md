# Arquitectura de la plataforma RDF GIS Explorer

## Visión global

La plataforma unifica dos aplicaciones Angular independientes bajo un **AppShell** que actúa como host de Module Federation. El flujo de trabajo del usuario es:

1. Construir una query SPARQL visualmente en **RDF Explorer**.
2. Hacer *handoff* de la query a **RDF GIS Explorer** para explorar resultados.
3. Guardar tableros de cualquiera de las dos apps y reabrirlos desde la **WelcomePage**.

## Diagrama de capas

```
┌──────────────────────────────────────────────────────┐
│  AppShell (host, puerto 4200)                         │
│  ├─ /          → WelcomePage (tableros recientes)     │
│  ├─ /settings  → SettingsPage (autoRun, backend URL)  │
│  ├─ /explorer  → remote: rdf_explorer                 │
│  ├─ /gis       → remote: rdf_gis_explorer             │
│  └─ Servicios shell: DashboardStoreService,            │
│                      QueryHandoffService               │
└──────────────────────────────────────────────────────┘
           ▲                          ▲
           │ Module Federation        │
           │                          │
┌─────────────────────┐   ┌──────────────────────────┐
│ rdf_explorer (4201) │   │ rdf_gis_explorer (4202)  │
│ remoteEntry.json    │   │ remoteEntry.json         │
└─────────────────────┘   └──────────────────────────┘
           │                          │
           └────────────┬─────────────┘
                        ▼
         ┌──────────────────────────────┐
         │ Backend NestJS (3000)        │
         │  /api/dashboards (CRUD)      │
         │  /api/query/execute          │
         │  SparqlEndpoint adapter      │
         └──────────────────────────────┘
                        │
                 ┌──────┴──────┐
                 ▼             ▼
             Wikidata     MillenniumDB
               SPARQL       SPARQL
```

## Patrones clave

### Module Federation (Native Federation)

- El shell carga los remotes vía `@angular-architects/native-federation`.
- Los remotes se exponen como `Component` standalone.
- El shell no conoce el código fuente de los remotes; solo sus `remoteEntry.json`.

### Comunicación shell ↔ remotes

- **QueryHandoffService** usa `sessionStorage` + `CustomEvent` para pasar la query del explorer al GIS sin compartir dependencias npm.
- **DashboardStoreService** centraliza la lista de tableros recientes (consume `/api/dashboards/recent`).

### Persistencia

- El backend almacena dashboards como JSON opaco en SQLite.
- Cada app conoce su propio formato de payload; el backend solo valida `kind`, `name` y que `payload` no esté vacío.
- Redirección desde `/dashboards/:id` hacia `/explorer?workspaceId=xxx` o `/gis?dashboardId=xxx` según `kind`.

### Adapter SPARQL

- El backend encapsula la lógica de endpoints (Wikidata, MillenniumDB) detrás de `SparqlEndpointFactory`.
- `rdf_explorer` puede usar `RdfBackendAdapter` (cliente) para delegar ejecución al backend en lugar de llamar directamente al endpoint SPARQL público.

## Flujo de datos

1. **Guardar workspace (explorer):**
   `ExplorerPersistenceService` → serializa paneles + grafo → `POST /api/dashboards` → SQLite.

2. **Abrir desde Welcome:**
   `WelcomePage` → `GET /api/dashboards/recent` → cards → click → `/dashboards/:id` → `dashboardRedirectGuard` → `/explorer?workspaceId=xxx` → `ExplorerPersistenceService.load()` → restaura grafo.

3. **Handoff explorer → GIS:**
   `MainComponent.handoffToGis()` → `QueryHandoffService.publish()` → `sessionStorage.setItem()` + `CustomEvent` → navega a `/gis?handoff=1` → `DashboardComponent.ngAfterViewInit()` → consume payload → precarga `SparqlInputComponent`.

4. **Guardar dashboard (GIS):**
   `DashboardPersistenceService.serialize()` → query + layout + filtros + selección → `POST /api/dashboards` → SQLite.

5. **Abrir dashboard (GIS):**
   `/gis?dashboardId=xxx` → `App.ngOnInit()` → `DashboardPersistenceService.load()` → `deserialize()` → ejecuta query + restaura layout/filtros/selección.
