# M12 — App Shell MF

## Responsabilidad

Documentación del App Shell como host de Module Federation: cómo se cargan los remotes, cómo se comunican, y cómo se estructura la navegación.

## Native Federation vs Webpack MF

Usamos `@angular-architects/native-federation` porque:
- No requiere eject de webpack ni custom builders.
- Soporta ESM nativo + `es-module-shims`.
- Compatible con Angular CLI estándar.

## Configuración host (shell)

`federation.config.js`:
- `name: 'app_shell'`
- `shared: shareAll(...)` para deps comunes (Angular, RxJS, etc.)
- No declara `remotes` aquí; usa `federation.manifest.json` en runtime.

`public/federation.manifest.json`:
```json
{
  "rdf_explorer": "http://localhost:4201/remoteEntry.json",
  "rdf_gis_explorer": "http://localhost:4202/remoteEntry.json"
}
```

## Carga de remotes en rutas

```ts
{
  path: 'explorer',
  loadComponent: () =>
    loadRemoteModule('rdf_explorer', './Component').then((m) => m.AppComponent),
}
```

La carga es lazy: el browser descarga `remoteEntry.json`, resuelve los chunks, y bootstrapa el componente standalone como si fuera local.

## Comunicación entre shell y remotes

### Problema

Los servicios Angular del shell **no se pueden compartir** fácilmente con los remotes porque no hay un paquete npm compartido entre los tres builds.

### Solución: Plan B (sessionStorage + CustomEvent)

- `QueryHandoffService` en shell, explorer y GIS comparten la **misma implementación** copiada en cada proyecto (no es DRY, pero es práctico para el prototipo).
- Usan `sessionStorage` como fuente de verdad y `CustomEvent` para notificar cambios dentro de la misma pestaña.
- Esto permite que explorer publique y GIS consuma sin depender del shell en runtime.

### Evolución futura

Para producción, se recomienda:
- Extraer `QueryHandoffService` y `DashboardApiClient` a un paquete npm compartido (`@rdf-platform/shared`).
- Publicarlo en un registry privado o usar `npm workspaces` / Nx.

## WelcomePage

- Fuente única de verdad para la lista de tableros recientes.
- Filtros: Todos | GIS | Explorer.
- Cards clickeables con menú contextual (renombrar, duplicar, eliminar).
- Estado vacío con CTA a `/explorer`.

## SettingsPage

- `/settings`
- Toggle `autoRunHandoff` (localStorage).
- Input `backendUrl` (localStorage), usado por los API clients de los remotes si deciden leerlo.

## Criterios de aceptación

- Navegar a `/explorer` carga el remote sin errores de consola.
- Navegar a `/gis` carga el remote sin errores de consola.
- Recargar `/explorer` o `/gis` directamente funciona (deep linking).
- Network tab muestra carga diferida de los chunks de los remotes (no en el bundle inicial del shell).
