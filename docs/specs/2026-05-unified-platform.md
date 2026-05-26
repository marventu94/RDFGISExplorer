# Spec: Plataforma unificada RDF Explorer + RDF GIS Explorer

**Estado:** Draft v1
**Fecha:** 2026-05-26
**Autor:** Martin Venturino (con asistencia de Claude)
**Tipo:** Especificación funcional + arquitectura para prototipo
**Audiencia:** desarrollador(es) que implementarán las fases con apoyo de IA

---

## 1. Contexto y motivación

Hoy existen dos aplicaciones Angular independientes bajo `frontend/`:

- **`rdf_explorer`**: editor visual/intuitivo de queries SPARQL (CodeMirror + Cytoscape para diseño visual de grafos de consulta).
- **`rdf_gis_explorer`**: dashboard de exploración de resultados con vistas GIS (Leaflet), timeline (vis-timeline), grafo (Cytoscape), tabla (ag-grid) y panel de curación.

Ambas comparten Angular 21, backend NestJS (`backend/`) y conceptualmente son **dos fases del mismo flujo de trabajo**: (1) construir la query, (2) explorar/curar los resultados.

**Objetivo:** unificarlas en una plataforma única ("AppShell") que permita:

1. Una **pantalla de bienvenida** con tableros recientes guardados y acceso a cada app.
2. **Integrar `rdf_explorer` al backend Nest** vía un adapter (manteniendo la abstracción para soportar otras bases en el futuro).
3. **Migrar la query** generada en `rdf_explorer` hacia `rdf_gis_explorer` mediante un botón "Explorar en GIS".
4. **Guardar tableros** de ambas apps (paneles de `rdf_explorer` y dashboards completos de `rdf_gis_explorer`).

**No-objetivos del prototipo:**

- Multiusuario / autenticación (single-user). Estructura preparada pero sin login.
- Compartir tableros entre usuarios.
- Versionado/historial profundo de tableros.

---

## 2. Decisiones arquitectónicas

| Decisión | Elección | Razón |
|----------|----------|-------|
| Integración de apps | **Micro-frontends con Webpack Module Federation** | Permite mantener ambos repos/builds independientes y un AppShell liviano que orqueste. Encaja con el deseo de evolución por separado. |
| Stack del shell | Angular 21 + `@angular-architects/module-federation` (Native Federation) | Misma versión que ambas apps; soporte oficial Angular. |
| Persistencia | **Backend NestJS + DB (single-user)** | Reaprovecha backend existente. Sin auth: todos los tableros pertenecen al usuario implícito. |
| DB | SQLite (vía TypeORM o Prisma) en `backend/data/` | Sin infra extra; ya existe `backend/data/`. Suficiente para prototipo. |
| Transferencia de query entre apps | **Estado compartido vía servicio del shell + query param de fallback** | Servicio Angular en el shell expuesto a ambos remotes; URL como fallback para deep-linking y recarga. |
| Adapter rdf_explorer | Mover el actual `EndpointAdapter` (sólo genera triples de full-text) y promoverlo a una **interfaz cliente más amplia** que delegue ejecución al backend. | El adapter actual sólo abstrae sintaxis de full-text. La ejecución de la query la hace hoy el frontend (`request.service.ts`); hay que redirigirla al backend, donde ya existe `SparqlEndpoint` adapter. |

### 2.1 Diagrama de capas (alto nivel)

```
┌──────────────────────────────────────────────────────┐
│  AppShell (host, puerto 4200)                         │
│  ├─ /          → WelcomePage (tableros recientes)     │
│  ├─ /explorer  → remote: rdf_explorer                 │
│  ├─ /gis       → remote: rdf_gis_explorer             │
│  └─ Servicios shell: DashboardStoreService, QueryHandoffService │
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
        │  /api/sparql  /api/dashboards│
        │  /api/queries (rdf_explorer) │
        │  SparqlEndpoint adapter      │
        └──────────────────────────────┘
                       │
                ┌──────┴──────┐
                ▼             ▼
            Wikidata     MillenniumDB
              SPARQL       SPARQL
```

---

## 3. Modelo de dominio

### 3.1 Entidades persistidas

```ts
// Tablero genérico: tipo discriminado por app de origen
type Dashboard =
  | GisDashboard
  | ExplorerWorkspace;

interface DashboardBase {
  id: string;            // uuid
  name: string;
  createdAt: string;     // ISO
  updatedAt: string;
  kind: 'gis' | 'explorer';
}

interface GisDashboard extends DashboardBase {
  kind: 'gis';
  payload: {
    query: string;                       // SPARQL
    backend: 'wikidata' | 'millenniumdb';
    layout: DashboardLayoutSnapshot;     // 1/2/3/4 vistas + qué vista en cada slot
    filters: FilterStateSnapshot;        // filtros aplicados (tabla, timeline, mapa)
    selection?: SelectionSnapshot;       // selección activa cross-vista
  };
}

interface ExplorerWorkspace extends DashboardBase {
  kind: 'explorer';
  payload: {
    panels: ExplorerPanelSnapshot[];     // grafos/queries abiertos en pestañas
    activePanelId: string;
    settings: ExplorerSettingsSnapshot;  // endpoint, limit, etc.
  };
}
```

Las formas de `DashboardLayoutSnapshot`, `FilterStateSnapshot`, `SelectionSnapshot`, `ExplorerPanelSnapshot` se derivarán de los servicios actuales (`DashboardLayoutService`, `SelectionService`, etc.) en la fase de implementación. El backend los almacena como JSON opaco; sólo valida `kind`, `name`, `payload` no vacío.

### 3.2 Esquema DB (SQLite)

```sql
CREATE TABLE dashboards (
  id           TEXT PRIMARY KEY,
  kind         TEXT NOT NULL CHECK (kind IN ('gis','explorer')),
  name         TEXT NOT NULL,
  payload      TEXT NOT NULL,         -- JSON
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL
);
CREATE INDEX idx_dashboards_updated ON dashboards(updated_at DESC);
```

---

## 4. Contratos de API (backend NestJS)

### 4.1 Nuevos endpoints

| Método | Ruta | Cuerpo | Respuesta |
|--------|------|--------|-----------|
| `GET`  | `/api/dashboards` | — | `Dashboard[]` ordenados por `updatedAt` desc |
| `GET`  | `/api/dashboards/recent?limit=10` | — | `Dashboard[]` (subset para Welcome) |
| `GET`  | `/api/dashboards/:id` | — | `Dashboard` |
| `POST` | `/api/dashboards` | `{ kind, name, payload }` | `Dashboard` creado |
| `PUT`  | `/api/dashboards/:id` | `{ name?, payload? }` | `Dashboard` actualizado |
| `DELETE` | `/api/dashboards/:id` | — | `204` |

Todas usan el envelope ya convenido en `docs/02-data-contracts.md` (o el patrón existente `ApiResponse<T>` si aplica).

### 4.2 Endpoints existentes a reutilizar desde `rdf_explorer`

`rdf_explorer` hoy hace fetch directo al endpoint SPARQL público (`request.service.ts`). Debe migrar a:

| Método | Ruta | Notas |
|--------|------|-------|
| `POST` | `/api/sparql/execute` | Ya consumido por `rdf_gis_explorer`. Recibe `{ query, backend?, limit?, timeoutMs? }` y devuelve `QueryResult`. |
| `GET`  | `/api/sparql/predicates?backend=...` | Para autocompletado y sugerencias en `rdf_explorer`. |
| `GET`  | `/api/suggestions/...` | Reutilizar módulo de sugerencias existente cuando aplique. |

---

## 5. Adapter de `rdf_explorer`

### 5.1 Estado actual

`frontend/rdf_explorer/src/app/core/endpoint-adapter.ts` define `EndpointAdapter` con un único método `textSearchTriple(label, keyword, limit)` y tres implementaciones (`Virtuoso`, `Fuseki`, `Generic`). La **ejecución** de queries vive en `request.service.ts`, separada del adapter.

### 5.2 Nueva interfaz cliente

Promovemos el adapter a una interfaz que abstrae **toda la interacción con el almacén RDF**, no sólo la sintaxis:

```ts
// frontend/rdf_explorer/src/app/core/endpoint-adapter.ts
export interface RdfBackendAdapter {
  readonly id: string;                  // 'gis-backend' | 'wikidata-direct' | ...
  textSearchTriple(label: string, keyword: string, limit: number): string;
  executeQuery(query: string, opts: ExecuteOpts): Promise<QueryResult>;
  getPredicates(): Promise<string[]>;
}
```

Implementaciones iniciales:

- **`GisBackendAdapter`** (default): delega ejecución y metadatos al backend NestJS local (`/api/sparql/*`). El backend resuelve qué `SparqlEndpoint` físico usar (Wikidata, MillenniumDB) según config.
- **`LegacyDirectAdapter`** (opcional, sólo para regresión): mantiene la llamada directa que existe hoy. Útil para validar paridad. Eliminable post-migración.

### 5.3 Selección de adapter

`SettingsService` (existente) ya tiene `EndpointType`. Se agrega un campo `backendMode: 'app-backend' | 'direct'` y el factory devuelve la implementación correspondiente. Default: `app-backend`.

---

## 6. AppShell y navegación

### 6.1 Rutas del shell

```
/                  → WelcomePage
/explorer/**       → rdf_explorer (lazy remote)
/gis/**            → rdf_gis_explorer (lazy remote)
/dashboards/:id    → resolver: lee dashboard y redirige a /explorer o /gis con estado precargado
```

### 6.2 WelcomePage

Contenido mínimo:

- Título + dos botones grandes: "Construir query (RDF Explorer)" → `/explorer`, "Explorar en GIS" → `/gis` (abre vacío).
- Sección "Recientes" con cards de los últimos N tableros (mix de ambos tipos). Cada card muestra: nombre, kind (chip "GIS" / "Explorer"), fecha relativa, miniatura/preview si está disponible, acciones (abrir, renombrar, eliminar).
- Filtro/toggle: "Todos | GIS | Explorer".
- Estado vacío con CTA.

Datos: `GET /api/dashboards/recent`.

### 6.3 Handoff de query (Explorer → GIS)

Servicio en el shell:

```ts
@Injectable({ providedIn: 'root' })
export class QueryHandoffService {
  private pending: HandoffPayload | null = null;
  publish(p: HandoffPayload): void;       // llamado desde rdf_explorer
  consume(): HandoffPayload | null;       // llamado desde rdf_gis_explorer al inicializar
}

interface HandoffPayload {
  query: string;
  backend: 'wikidata' | 'millenniumdb';
  source: { workspaceId?: string; panelId?: string };
}
```

Flujo:

1. En `rdf_explorer`, botón "Explorar en GIS" llama `queryHandoff.publish({ query, backend })` y navega a `/gis?handoff=1`.
2. `rdf_gis_explorer` al detectar `?handoff=1` consume del servicio. Como fallback (recarga, link directo), la query se serializa también en `sessionStorage` con key `gis.handoff.pending`.
3. `rdf_gis_explorer` precarga `SparqlInputComponent` con la query y ejecuta automáticamente si el usuario lo confirma (o auto-run según preferencia).

### 6.4 Apertura desde "Recientes"

`/dashboards/:id` resuelve el dashboard:

- `kind: 'gis'` → redirige a `/gis?dashboardId=:id`; `rdf_gis_explorer` hidrata `DashboardLayoutService`, `SelectionService`, filtros y `SparqlInputComponent`.
- `kind: 'explorer'` → redirige a `/explorer?workspaceId=:id`; `rdf_explorer` hidrata sus paneles y settings.

---

## 7. Cambios por aplicación

### 7.1 Backend (`backend/`)

- Nuevo módulo `modules/dashboards/` con `controller`, `service`, `entity`, `dto`.
- DB: agregar TypeORM (o Prisma) con SQLite en `backend/data/dashboards.sqlite`.
- Reusar módulo `sparql` existente (sin cambios estructurales).
- Tests unitarios del service y e2e del controller (siguiendo patrón actual de `query.controller.spec.ts`).

### 7.2 `rdf_gis_explorer`

- Exponer como **remote** vía Module Federation (`webpack.config.js` o `federation.config.json`).
- Nuevo servicio `DashboardPersistenceService` que serializa/deserializa el snapshot (query + layout + filtros + selección) y habla con `/api/dashboards`.
- Botón "Guardar tablero" en navbar; modal con nombre + sobreescribir vs duplicar.
- Hidratación desde `?dashboardId=` y desde `QueryHandoffService`.

### 7.3 `rdf_explorer`

- Exponer como remote.
- Sustituir `request.service.ts` por uso del nuevo `RdfBackendAdapter.executeQuery`.
- Nuevo servicio `ExplorerPersistenceService` para guardar/cargar workspace (paneles, query activa, settings).
- Botón "Guardar workspace" y "Explorar en GIS" en barra de herramientas principal.
- Adapter factory actualizado (sección 5).

### 7.4 Nuevo paquete `frontend/app_shell/`

- Proyecto Angular 21 mínimo: WelcomePage, router con remotes, servicios `QueryHandoffService` y `DashboardStoreService` (este último cachea `recent` y emite eventos).
- Configuración Module Federation con dos remotes.
- Layout/chrome común opcional (top bar con logo + breadcrumb). Mantener simple en fase 1.

---

## 8. Plan de implementación (fases)

Orden definido por dependencias técnicas. Cada fase es **mergeable y demoable** por sí sola.

### Fase 0 — Preparación (0.5 día)

- Confirmar versiones Angular alineadas (ambas en 21.2 ✓).
- Agregar `@angular-architects/native-federation` a ambos frontends.
- Crear `docs/specs/` (este doc) y M11 (ver §11).

### Fase 1 — Backend de persistencia (1-2 días)

Independiente del shell.

- Módulo `dashboards` en Nest con CRUD + endpoint `/recent`.
- SQLite + migración inicial.
- Tests unitarios y e2e.
- Salida demoable: `curl POST/GET /api/dashboards` funciona.

### Fase 2 — Adapter de `rdf_explorer` al backend (1-2 días)

- Definir `RdfBackendAdapter` (interfaz nueva).
- Implementar `GisBackendAdapter` apuntando a `/api/sparql/execute` y `/api/sparql/predicates`.
- Sustituir consumidores en `query.service.ts`, `request.service.ts`.
- Mantener `LegacyDirectAdapter` detrás de un flag para regresión.
- Tests unitarios del adapter; tests de paridad entre legacy y nuevo con queries fixture.

### Fase 3 — Persistencia en ambas apps (1-2 días)

- `DashboardPersistenceService` en `rdf_gis_explorer` con serialización completa.
- `ExplorerPersistenceService` en `rdf_explorer`.
- Botones "Guardar" en ambas con modal mínimo.
- Hidratación desde `?dashboardId=` / `?workspaceId=`.
- Tests unitarios de (de)serialización.

### Fase 4 — AppShell + WelcomePage (1-2 días)

- Nuevo proyecto Angular `frontend/app_shell` con Native Federation.
- Configurar ambos frontends como remotes.
- WelcomePage con `recent`, botones a cada app, abrir desde card.
- Resolver `/dashboards/:id`.

### Fase 5 — Handoff Explorer → GIS (0.5-1 día)

- `QueryHandoffService` en shell.
- Botón "Explorar en GIS" en `rdf_explorer`.
- Consumo y auto-precarga en `rdf_gis_explorer`.
- Fallback `sessionStorage`.

### Fase 6 — Pulido y QA (1 día)

- E2E Playwright cubriendo el flujo: construir query → guardar workspace → handoff a GIS → guardar dashboard → abrir desde welcome.
- Revisión de UX en WelcomePage.
- Documentación de usuario en `README.md` raíz.

**Estimación total prototipo:** 6-10 días-persona.

---

## 9. Criterios de aceptación

Un usuario puede, sin tocar otra interfaz:

1. Abrir la app en `/`, ver tableros recientes y entrar a cada herramienta.
2. En `rdf_explorer`, construir una query, **guardarla** con nombre, y verla aparecer en "Recientes".
3. Apretar "Explorar en GIS": `rdf_gis_explorer` se abre con esa query precargada y ejecutada.
4. Configurar layout (1-4 vistas), aplicar filtros, **guardar el tablero**.
5. Recargar la página y abrir el tablero desde "Recientes" → estado restaurado idéntico (query, layout, filtros, selección).
6. `rdf_explorer` ejecuta queries contra el backend Nest (verificable por logs/Network); el adapter está conectado vía `GisBackendAdapter`.

---

## 10. Riesgos y mitigaciones

| Riesgo | Mitigación |
|--------|------------|
| Module Federation con Angular 21 + Native Federation puede tener bordes ásperos. | Spike de 0.5 día en Fase 0 con un "hello world" antes de comprometer Fase 4. Plan B: route-level lazy modules dentro de un monorepo Nx si MF da problemas. |
| Snapshot de filtros/selección en `rdf_gis_explorer` puede divergir si los servicios mutan. | Definir interfaces `Readonly` y serialización pura. Tests round-trip (serialize→deserialize→deep-equal). |
| Adapter de `rdf_explorer` cambia el comportamiento (latencia, formato de respuesta). | Tests de paridad con queries fixture comparando legacy vs nuevo. Flag `backendMode` para rollback rápido. |
| Querys grandes en URL fallan por longitud. | El handoff usa `QueryHandoffService` (memoria) + `sessionStorage`, no query string. Sólo el `dashboardId` viaja por URL. |
| SQLite single-file no escala a multiusuario. | Aceptado para prototipo; reemplazar por Postgres documentado como deuda futura. |

---

## 11. Documentación derivada a crear/actualizar

Tras implementación, actualizar `docs/`:

- `00-architecture.md`: sumar diagrama de §2.1.
- `modules/M00-app-shell.md`: redefinir como AppShell con MF.
- **Nuevo** `modules/M11-dashboards-persistence.md`: backend + servicios de persistencia.
- **Nuevo** `modules/M12-app-shell-mf.md`: WelcomePage, QueryHandoffService.
- `M09-sparql-adapter.md`: agregar sección sobre `RdfBackendAdapter` (cliente).

---

## 12. Preguntas abiertas (a confirmar antes de Fase 1)

1. ¿SQLite con TypeORM o con Prisma? (Prisma da migrations más limpias; TypeORM ya puede estar instalado — confirmar `package.json` del backend.)
2. ¿El "guardar workspace" de `rdf_explorer` incluye todos los paneles abiertos o solo el activo? (Spec asume todos.)
3. ¿La WelcomePage es la ruta inicial siempre o sólo cuando no hay query/dashboard activo? (Spec asume siempre `/`.)
4. ¿Auto-ejecutar la query al hacer handoff o requerir confirmación del usuario? (Spec asume confirmación opcional vía setting; default auto-run.)
