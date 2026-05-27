# M00 — App Shell (Module Federation Host)

## Responsabilidad

El App Shell es la aplicación Angular host que orquesta la plataforma unificada. No contiene la lógica de negocio de ninguna de las dos herramientas; su trabajo es:

1. Servir la **WelcomePage** (`/`).
2. Cargar **rdf_explorer** y **rdf_gis_explorer** como remotes vía Module Federation.
3. Proveer servicios compartidos de plataforma: `QueryHandoffService` y `DashboardStoreService`.
4. Redirigir `/dashboards/:id` al remote correspondiente según `kind`.

## Tecnología

- Angular 21 standalone
- `@angular-architects/native-federation` (host)
- `es-module-shims` para cargar los remotes en runtime

## Estructura

```
frontend/app_shell/src/app/
  app.ts                  # Root component (top-bar + router-outlet)
  app.routes.ts           # Rutas: /, /settings, /explorer, /gis, /dashboards/:id
  app.config.ts           # Provide router + HTTP client
  core/
    dashboard-api.client.ts
    dashboard-store.service.ts
    dashboard-redirect.guard.ts
    query-handoff.service.ts
    handoff-settings.ts
    snackbar.service.ts
  pages/
    welcome/
      welcome.component.ts
      dashboard-card.component.ts
    settings/
      settings.component.ts
  shell/
    top-bar.component.ts
```

## Rutas

| Ruta | Destino | Notas |
|------|---------|-------|
| `/` | `WelcomePageComponent` | Lista de recientes + CTAs |
| `/settings` | `SettingsPageComponent` | `autoRunHandoff`, backend URL |
| `/explorer` | Remote `rdf_explorer` | Lazy-load vía `loadRemoteModule` |
| `/gis` | Remote `rdf_gis_explorer` | Lazy-load vía `loadRemoteModule` |
| `/dashboards/:id` | `dashboardRedirectGuard` | Lee dashboard y redirige a `/explorer` o `/gis` |
| `**` | `/` | Fallback |

## Module Federation

El shell declara los remotes en `public/federation.manifest.json`:

```json
{
  "rdf_explorer": "http://localhost:4201/remoteEntry.json",
  "rdf_gis_explorer": "http://localhost:4202/remoteEntry.json"
}
```

La carga es lazy: los bundles de los remotes solo se descargan cuando el usuario navega a `/explorer` o `/gis`.

## Servicios del shell

### QueryHandoffService

- **Publica** desde `rdf_explorer`: guarda en `sessionStorage` con key `platform.handoff.pending`.
- **Consume** desde `rdf_gis_explorer`: lee de `sessionStorage` y lo borra.
- Usa `CustomEvent` y evento `storage` para sincronizar entre tabs.
- TTL de 5 minutos; payload expirado se descarta.

### DashboardStoreService

- Cachea la lista de tableros recientes (`shareReplay(1)`).
- Expone `recent$`, `delete()`, `rename()`, `duplicate()`.
- Emite refresh automático tras mutaciones.

## A11y y UX

- WelcomePage tiene ARIA labels en CTAs, filtros (`aria-pressed`), cards (`role="listitem"`, `tabindex="0"`).
- Tab navigation funcional en cards y filtros.
- Estados loading y empty visibles.
