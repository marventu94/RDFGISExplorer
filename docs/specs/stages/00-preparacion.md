# Etapa 0 — Setup Module Federation + scaffold AppShell

> **Prompt para sesión nueva de IA.** Copiá y pegá este archivo completo como primer mensaje. Trabajás en el repo `/home/mventurino/Documents/TESIS/programs/rdf_gis_explorer`. La spec maestra está en `docs/specs/2026-05-unified-platform.md` (§2, §8 Fase 0).

## Objetivos

1. Alinear versiones Angular en ambas apps (`rdf_explorer`, `rdf_gis_explorer`) si no lo están.
2. Configurar **Module Federation** con `@angular-architects/native-federation` en ambas apps como **remotes**.
3. Crear el proyecto nuevo `frontend/app_shell/` como **host**.
4. Levantar el spike: el shell carga ambos remotes en `/explorer` y `/gis`.
5. Dejar `npm run dev` raíz que levante backend + shell + ambos remotes.

## Contexto

- Repo monorepo: `backend/` (NestJS) + `frontend/rdf_explorer/` (Angular 21) + `frontend/rdf_gis_explorer/` (Angular 21).
- Ambos frontends ya son Angular 21.2.x.
- Backend NestJS corre en `:3000` (no tocar en esta etapa).

## Alcance

### Puertos a usar

| App | Puerto |
|-----|--------|
| `app_shell` (host) | 4200 |
| `rdf_explorer` (remote) | 4201 |
| `rdf_gis_explorer` (remote) | 4202 |
| `backend` | 3000 |

### Archivos a crear/tocar

- `frontend/rdf_explorer/federation.config.js`
- `frontend/rdf_explorer/src/main.ts` (bootstrap native federation)
- `frontend/rdf_explorer/angular.json` (configuración serve/build con MF)
- `frontend/rdf_gis_explorer/federation.config.js`
- `frontend/rdf_gis_explorer/src/main.ts`
- `frontend/rdf_gis_explorer/angular.json`
- `frontend/app_shell/` (proyecto nuevo completo: `ng new app_shell --routing --style=scss --standalone`)
- `frontend/app_shell/federation.manifest.json`
- `frontend/app_shell/src/app/app.routes.ts` (rutas a `/explorer` y `/gis` lazy via MF)
- `package.json` raíz: script `dev` con `concurrently` o `npm-run-all`.

### Plan B

Si Native Federation da problemas con Angular 21: usar `@nx/angular` con MF integrado, documentar la decisión en commit.

## Out of scope

- WelcomePage real (es Etapa 4).
- Persistencia, adapters, handoff.
- Lógica de negocio.

## Criterios de aceptación

- [ ] `npm run dev` desde la raíz levanta los 4 servicios.
- [ ] `http://localhost:4200/explorer` muestra `rdf_explorer` cargado vía MF.
- [ ] `http://localhost:4200/gis` muestra `rdf_gis_explorer` cargado vía MF.
- [ ] Cada remote sigue funcionando standalone (`:4201` y `:4202`).
- [ ] `ng build` funciona en cada app.
- [ ] `README.md` raíz actualizado con instrucciones de dev.

## Commit final (obligatorio)

Cuando termines y pasen todos los criterios de aceptación, hacé un único commit con este mensaje:

```
chore(shell): setup module federation + scaffold app_shell host

- Configura rdf_explorer y rdf_gis_explorer como remotes (native federation)
- Crea frontend/app_shell como host en :4200
- Agrega script dev raiz que levanta backend + shell + remotes
- Actualiza README con instrucciones de desarrollo

Refs: docs/specs/stages/00-preparacion.md
```

No avances a otras etapas. Detenete después del commit.
