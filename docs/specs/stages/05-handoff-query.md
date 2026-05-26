# Etapa 5 — Handoff de query Explorer → GIS

> **Prompt para sesión nueva de IA.** Copiá y pegá este archivo completo como primer mensaje. Trabajás en el repo `/home/mventurino/Documents/TESIS/programs/rdf_gis_explorer`. La spec maestra está en `docs/specs/2026-05-unified-platform.md` (§6.3, §8 Fase 5).

## Objetivos

1. Crear `QueryHandoffService` en el shell, compartido como singleton entre remotes.
2. Mirror en `sessionStorage` para sobrevivir recarga/navegación, con TTL 5 min.
3. Botón "Explorar en GIS" en `rdf_explorer` que publica la query y navega.
4. Consumo en `rdf_gis_explorer` al detectar `?handoff=1`.
5. Setting `autoRunHandoff` (default `true`).

## Contexto

- AppShell con MF funcional (Etapas 0, 4).
- `rdf_gis_explorer` tiene `SparqlInputComponent` con métodos para setear y ejecutar query.
- `rdf_explorer` tiene query generada en `query.service.ts`.

## Alcance

### `QueryHandoffService`

```ts
@Injectable({ providedIn: 'root' })
export class QueryHandoffService {
  publish(payload: HandoffPayload): void;
  consume(): HandoffPayload | null;  // lee y limpia
  peek(): HandoffPayload | null;
}

interface HandoffPayload {
  query: string;
  backend: 'wikidata' | 'millenniumdb';
  source: { workspaceId?: string; panelId?: string };
  publishedAt: string;
}
```

Implementación:

- Estado en memoria (signal o `BehaviorSubject`).
- Mirror en `sessionStorage` con key `platform.handoff.pending`.
- TTL 5 min (descartar si `Date.now() - publishedAt > 5min`).

Compartido entre remotes: marcar `singleton: true` en federation config del shell.

**Plan B** si singleton falla: `CustomEvent` en `window` + `sessionStorage` como único canal.

### Botón en `rdf_explorer`

- En toolbar principal, visible cuando hay query no vacía y sintácticamente válida.
- Click:
  1. `queryHandoff.publish({ query, backend, source })`.
  2. Navegar (router del shell) a `/gis?handoff=1`.

### Consumo en `rdf_gis_explorer`

En `DashboardComponent.ngOnInit`:

```ts
if (route.snapshot.queryParams['handoff'] === '1') {
  const payload = queryHandoff.consume();
  if (payload) {
    sparqlInput.setQuery(payload.query);
    sparqlInput.setBackend(payload.backend);
    if (settings.autoRunHandoff) sparqlInput.execute();
  } else {
    snackBar.open('No se encontró la query a importar');
  }
}
```

### Setting `autoRunHandoff`

Persistir en localStorage o en settings del shell. Default `true`.

### Archivos a crear/tocar

- `frontend/app_shell/src/app/core/query-handoff.service.{ts,spec.ts}`
- `frontend/app_shell/federation.config.js` (marcar service como singleton compartido)
- `frontend/rdf_explorer/src/app/tool*/` (botón)
- `frontend/rdf_explorer/src/app/pages/main/main.component.ts`
- `frontend/rdf_gis_explorer/src/app/features/dashboard/dashboard.component.ts`
- `frontend/rdf_gis_explorer/src/app/features/sparql-input/sparql-input.component.ts` (métodos públicos `setQuery`, `setBackend`, `execute`)

## Tests

- Unit del service: publish/consume/peek, TTL, mirror en sessionStorage.
- Caso `/gis?handoff=1` sin handoff previo: mensaje sin crash.

## Out of scope

- E2E completo (Etapa 6).

## Criterios de aceptación

- [ ] Construir query en `/explorer`, click "Explorar en GIS" → `/gis` se abre con query cargada y ejecutada.
- [ ] Con `autoRunHandoff: false`, la query aparece pero no se ejecuta.
- [ ] Recargar `/gis?handoff=1` tras consumir: muestra mensaje, no crashea.
- [ ] Handoff >5 min: descartado, mensaje al usuario.
- [ ] Botón deshabilitado con query inválida o vacía.

## Commit final (obligatorio)

```
feat(shell): handoff de query Explorer → GIS

- QueryHandoffService singleton compartido entre remotes
- Mirror en sessionStorage con TTL 5min
- Boton "Explorar en GIS" en rdf_explorer
- Consumo automatico en rdf_gis_explorer via ?handoff=1
- Setting autoRunHandoff (default true)

Refs: docs/specs/stages/05-handoff-query.md
```

Detenete después del commit.
