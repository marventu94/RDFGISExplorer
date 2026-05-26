# Etapas de implementación — Plataforma unificada

Cada archivo de esta carpeta es **un prompt completo listo para copiar y pegar** en una sesión nueva de IA. Cada uno incluye objetivos, contexto, alcance, criterios de aceptación y termina con un **commit obligatorio**.

**Spec maestra de referencia:** [`../2026-05-unified-platform.md`](../2026-05-unified-platform.md)

## Orden de ejecución

| # | Archivo | Funcionalidad | Depende de |
|---|---------|---------------|------------|
| 0 | [`00-preparacion.md`](./00-preparacion.md) | Setup Module Federation + scaffold AppShell | — |
| 1 | [`01-backend-persistencia.md`](./01-backend-persistencia.md) | API `/api/dashboards` + SQLite | 0 |
| 2 | [`02-adapter-rdf-explorer.md`](./02-adapter-rdf-explorer.md) | `RdfBackendAdapter` consumiendo backend | — (paralelizable con 1) |
| 3a | [`03a-persistencia-gis.md`](./03a-persistencia-gis.md) | Guardar/cargar tableros GIS | 1 |
| 3b | [`03b-persistencia-explorer.md`](./03b-persistencia-explorer.md) | Guardar/cargar workspaces Explorer | 1, 2 |
| 4 | [`04-app-shell.md`](./04-app-shell.md) | WelcomePage + tableros recientes | 1, 3a, 3b |
| 5 | [`05-handoff-query.md`](./05-handoff-query.md) | Botón "Explorar en GIS" + handoff | 4 |
| 6 | [`06-qa-e2e.md`](./06-qa-e2e.md) | E2E Playwright + pulido + docs | 5 |

## Cómo usar

1. Abrí una sesión nueva con la IA (Claude / Cursor / etc).
2. Copiá el contenido **completo** del archivo de la etapa que toca.
3. Pegalo como primer mensaje.
4. La IA tiene todo lo necesario: objetivos, contexto, alcance, criterios y el commit final.

Cada etapa cierra con un commit. Si todo va bien, al terminar las 7 etapas hay 7+ commits en `main` (o feature branches según preferencia).
