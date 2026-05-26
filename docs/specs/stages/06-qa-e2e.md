# Etapa 6 — QA, E2E Playwright y pulido final

> **Prompt para sesión nueva de IA.** Copiá y pegá este archivo completo como primer mensaje. Trabajás en el repo `/home/mventurino/Documents/TESIS/programs/rdf_gis_explorer`. La spec maestra está en `docs/specs/2026-05-unified-platform.md` (§8 Fase 6, §9 criterios globales).

## Objetivos

1. Setup Playwright y suite de tests E2E del flujo completo.
2. 5 specs E2E cubriendo: welcome, explorer flow, handoff, gis flow, end-to-end golden path.
3. Pulido de UX (loading/error/vacío), accesibilidad, performance.
4. Limpieza de `console.log` residuales.
5. Documentación: actualizar `README.md` raíz y módulos en `docs/modules/`.

## Contexto

Todas las funcionalidades implementadas (Etapas 0-5). Falta cobertura E2E del flujo completo y documentación final.

## Alcance

### Setup Playwright

```
frontend/e2e/
├── playwright.config.ts
├── fixtures/
│   ├── sample-queries.json
│   └── seed-dashboards.ts
└── tests/
    ├── 01-welcome.spec.ts
    ├── 02-rdf-explorer-flow.spec.ts
    ├── 03-handoff.spec.ts
    ├── 04-gis-dashboard-flow.spec.ts
    └── 05-end-to-end.spec.ts
```

`playwright.config.ts`:

- `baseURL`: `http://localhost:4200`.
- `webServer`: levanta backend + shell + remotes (`npm run dev`).
- Browsers: Chromium (mandatorio), Firefox/WebKit opcionales.

### Specs E2E

**01-welcome**: carga `/`, ve botones y recientes. Estado vacío correcto.

**02-rdf-explorer-flow**: navega a `/explorer`, construye query, guarda workspace, vuelve a `/`, abre desde card, estado restaurado.

**03-handoff**: en `/explorer` con query, click "Explorar en GIS", verifica `/gis` con query precargada y resultados.

**04-gis-dashboard-flow**: en `/gis`, ejecuta query, layout 3 vistas, filtro de tabla, guarda. Recarga, abre desde `/`, todo restaurado.

**05-end-to-end** (golden path): welcome vacío → explorer → guardar → handoff → guardar gis → volver a welcome → 2 cards → abrir gis desde card → estado completo restaurado.

### Pulido

- Estados loading/error/vacío en WelcomePage y modales.
- ARIA labels en botones principales y cards.
- Tab navigation funcional.
- Lazy-load de remotes confirmado en Network tab.
- Sin `console.log` en producción.
- Página/sección de settings mínima (`autoRunHandoff`, base URL backend).

### Documentación

Actualizar:

- `README.md` raíz: descripción plataforma unificada, `npm run dev`, flujo principal, estructura.
- `docs/00-architecture.md`: diagrama shell + remotes.
- `docs/modules/M00-app-shell.md`: redefinir como AppShell MF.
- **Nuevo** `docs/modules/M11-dashboards-persistence.md`.
- **Nuevo** `docs/modules/M12-app-shell-mf.md`.
- `docs/modules/M09-sparql-adapter.md`: sección `RdfBackendAdapter` cliente.

## Métricas

- Todos los E2E pasan.
- Cobertura unit global ≥80%.
- Lighthouse WelcomePage: Performance ≥80, Accessibility ≥90.

## Criterios de aceptación

Recorrer §9 de la spec maestra:

- [ ] `/` muestra recientes y CTAs a ambas apps.
- [ ] Explorer: construir, guardar, ver en card, reabrir.
- [ ] Handoff: query precargada y ejecutada en GIS.
- [ ] GIS: layout, filtros, guardar.
- [ ] Recargar y abrir: estado idéntico.
- [ ] `rdf_explorer` usa backend Nest (verificable por Network).
- [ ] 5 specs Playwright pasan.
- [ ] Docs actualizadas.

## Commit final (obligatorio)

```
test(e2e): suite Playwright + pulido UX + documentacion final

- 5 specs E2E cubriendo welcome, explorer, handoff, gis y golden path
- Loading/error/empty states pulidos en welcome y modales
- ARIA labels + tab navigation + lazy-load verificado
- Settings minima (autoRunHandoff, backend URL)
- README raiz y docs/modules actualizados (M00, M09, M11, M12)
- Sin console.log residuales

Refs: docs/specs/stages/06-qa-e2e.md
```

Con este commit la plataforma unificada queda lista para demo.
