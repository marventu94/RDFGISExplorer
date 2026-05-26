# Etapa 4 — WelcomePage + tableros recientes

> **Prompt para sesión nueva de IA.** Copiá y pegá este archivo completo como primer mensaje. Trabajás en el repo `/home/mventurino/Documents/TESIS/programs/rdf_gis_explorer`. La spec maestra está en `docs/specs/2026-05-unified-platform.md` (§2.1, §6, §7.4, §8 Fase 4).

## Objetivos

1. Implementar la **WelcomePage** real en `frontend/app_shell/` (Etapa 0 dejó el scaffold).
2. Mostrar dos botones grandes (RDF Explorer / RDF GIS Explorer) + lista de tableros recientes mixtos.
3. `DashboardResolver` para abrir tableros desde `/dashboards/:id` y redirigir al remote correcto.
4. `DashboardStoreService` que cachea `/api/dashboards/recent` y emite cambios.
5. Acciones por card: abrir, renombrar, duplicar, eliminar.
6. Top bar global con breadcrumb.

## Contexto

- `frontend/app_shell/` ya existe (Etapa 0) cargando ambos remotes en `/explorer` y `/gis` con scaffolding mínimo.
- Backend `/api/dashboards` y `/api/dashboards/recent` disponibles (Etapa 1).
- `rdf_gis_explorer` hidrata desde `?dashboardId=` (Etapa 3a).
- `rdf_explorer` hidrata desde `?workspaceId=` (Etapa 3b).

## Alcance

### Rutas del shell

```
/                  → WelcomePage
/explorer/**       → remote rdf_explorer
/gis/**            → remote rdf_gis_explorer
/dashboards/:id    → DashboardResolver (redirige)
```

### `DashboardResolver`

1. `GET /api/dashboards/:id`.
2. Si `kind === 'gis'` → redirige a `/gis?dashboardId=:id`.
3. Si `kind === 'explorer'` → redirige a `/explorer?workspaceId=:id`.
4. Si 404 → redirige a `/` con snackbar de error.

### `DashboardStoreService`

```ts
@Injectable({ providedIn: 'root' })
class DashboardStoreService {
  recent$: Observable<Dashboard[]>;
  refresh(): void;
  delete(id: string): Observable<void>;
  rename(id: string, name: string): Observable<Dashboard>;
}
```

Cachea `/api/dashboards/recent` y refresca al volver al shell.

### WelcomePage

Layout:

```
┌───────────────────────────────────────────────────┐
│  RDF Platform                          [settings]  │
├───────────────────────────────────────────────────┤
│   ┌─────────────────────┐  ┌─────────────────────┐│
│   │ Construir query     │  │ Explorar en GIS     ││
│   │ (RDF Explorer)      │  │ (RDF GIS Explorer)  ││
│   └─────────────────────┘  └─────────────────────┘│
│                                                    │
│   Recientes          [Todos|GIS|Explorer]          │
│   ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐             │
│   │ card │ │ card │ │ card │ │ card │             │
│   └──────┘ └──────┘ └──────┘ └──────┘             │
└───────────────────────────────────────────────────┘
```

Card:

- Nombre (renombrable).
- Chip `GIS` o `Explorer` con color distinto.
- Fecha relativa (`updatedAt`).
- Click → navega a `/dashboards/:id`.
- Menú `…`: Renombrar, Duplicar, Eliminar (con confirmación).

Estado vacío: ilustración + CTA "Empezá construyendo una query".

### Top bar

- Logo + nombre app.
- Breadcrumb: `Inicio > GIS > <nombre>`.
- Botón "Volver al inicio".

### Archivos a crear/tocar

- `frontend/app_shell/src/app/pages/welcome/welcome.component.{ts,html,scss}`
- `frontend/app_shell/src/app/pages/welcome/dashboard-card.component.{ts,html,scss}`
- `frontend/app_shell/src/app/core/dashboard-store.service.ts`
- `frontend/app_shell/src/app/core/dashboard-api.client.ts`
- `frontend/app_shell/src/app/core/dashboard.resolver.ts`
- `frontend/app_shell/src/app/app.routes.ts`
- `frontend/app_shell/src/app/shell/top-bar.component.{ts,html,scss}`

## Consideración: librería compartida

Si el cliente HTTP de dashboards se repite en shell + ambas apps, evaluar extraer `frontend/shared/` como lib Angular. Decisión: si toma <2h, hacerlo; si no, duplicar.

## Tests

- Unit del resolver con mock HTTP.
- Unit del `DashboardStoreService`.
- Component test de WelcomePage (vacío, lista con items, filtro, acciones).

## Out of scope

- Handoff (Etapa 5).

## Criterios de aceptación

- [ ] `/` muestra WelcomePage con dos botones y lista de recientes.
- [ ] Click en card `gis` abre `/gis` con dashboard hidratado.
- [ ] Click en card `explorer` abre `/explorer` con workspace hidratado.
- [ ] Filtro Todos/GIS/Explorer funciona.
- [ ] Renombrar/eliminar persisten y refrescan la lista.
- [ ] Tests pasan.

## Commit final (obligatorio)

```
feat(shell): WelcomePage con tableros recientes y resolver de dashboards

- WelcomePage con CTAs a Explorer/GIS y lista de recientes filtrable
- DashboardCard con renombrar/duplicar/eliminar
- DashboardResolver para /dashboards/:id (redirige al remote)
- DashboardStoreService cachea /recent
- Top bar global con breadcrumb

Refs: docs/specs/stages/04-app-shell.md
```

Detenete después del commit.
