# Etapa 3b — Persistencia de workspaces en `rdf_explorer`

> **Prompt para sesión nueva de IA.** Copiá y pegá este archivo completo como primer mensaje. Trabajás en el repo `/home/mventurino/Documents/TESIS/programs/rdf_gis_explorer`. La spec maestra está en `docs/specs/2026-05-unified-platform.md` (§3, §6.4, §7.3, §8 Fase 3).

## Objetivos

1. Serializar el estado completo del workspace de `rdf_explorer` (paneles + grafo Cytoscape + settings).
2. Crear `WorkspacePersistenceService` + cliente API.
3. Si no existe ya, introducir noción mínima de "paneles" (pestañas) en `rdf_explorer`.
4. Botón "Guardar workspace" con modal (nombre + sobreescribir/copia).
5. Hidratar desde `?workspaceId=:id`.
6. Tests round-trip + cobertura ≥80%.

## Contexto

Estructura actual en `frontend/rdf_explorer/src/app/`:

- `pages/main/` — página principal.
- `graph/` — grafo visual Cytoscape para construir query.
- `tool*/` — toolbar y herramientas.
- `core/query.service.ts` — query generada.
- `core/settings.service.ts` — endpoint, backendMode (Etapa 2), limit.

Backend con `/api/dashboards` ya disponible (Etapa 1). Adapter al backend ya configurado (Etapa 2).

## Modelo

```ts
interface ExplorerWorkspacePayload {
  panels: ExplorerPanelSnapshot[];
  activePanelId: string;
  settings: {
    endpointType: 'virtuoso' | 'fuseki' | 'generic';
    backendMode: 'app-backend' | 'direct';
    limit: number;
  };
}

interface ExplorerPanelSnapshot {
  id: string;
  name: string;
  graph: SerializedGraph;
  generatedQuery: string;
  variables?: string[];
}

interface SerializedGraph {
  nodes: Array<{ id: string; type: string; data: Record<string, unknown> }>;
  edges: Array<{ id: string; source: string; target: string; data: Record<string, unknown> }>;
}
```

Tipos `Readonly`, serialización **pura**.

## Alcance

### Paneles (si no existen)

Si la app actual no tiene multi-panel: implementar mínimo una pestaña + botón "+" para crear panel nuevo + tabs para conmutar. Mantener simple.

### Cliente HTTP

```ts
class WorkspaceApiClient {
  list(): Observable<Dashboard[]>;       // filtra kind=explorer
  get(id: string): Observable<Dashboard>;
  create(input: { kind: 'explorer'; name: string; payload: ExplorerWorkspacePayload }): Observable<Dashboard>;
  update(id: string, input: Partial<{ name: string; payload: ExplorerWorkspacePayload }>): Observable<Dashboard>;
  delete(id: string): Observable<void>;
}
```

### UI

- Botón "Guardar workspace" en toolbar principal.
- Modal `SaveWorkspaceDialogComponent` (nombre + sobreescribir/copia).
- Snackbar feedback.

### Hidratación

`?workspaceId=:id` → cargar workspace, reconstruir paneles, restaurar grafo Cytoscape, settings, panel activo.

### Archivos a crear/tocar

- `frontend/rdf_explorer/src/app/core/workspace-persistence.service.{ts,spec.ts}`
- `frontend/rdf_explorer/src/app/core/workspace-api.client.ts`
- `frontend/rdf_explorer/src/app/shell/save-workspace-dialog.component.{ts,html,scss}`
- `frontend/rdf_explorer/src/app/pages/main/main.component.ts`
- `frontend/rdf_explorer/src/app/graph/` (helpers de serialización del grafo Cytoscape)
- `frontend/rdf_explorer/proxy.conf.json`

## Tests

- Round-trip con grafo Cytoscape de ≥10 nodos y ≥10 aristas.
- Mock API client.
- Al hidratar, la query generada coincide con la guardada.
- Cobertura ≥80%.

## Out of scope

- WelcomePage (Etapa 4).
- Handoff (Etapa 5).

## Criterios de aceptación

- [ ] Construir query visual, guardar como "consulta-X".
- [ ] Recargar `/explorer?workspaceId=<id>` → grafo y query restaurados.
- [ ] Crear segundo panel, guardar → ambos paneles persisten.
- [ ] Sobreescribir / guardar copia funcionan.
- [ ] Tests round-trip pasan; cobertura ≥80%.

## Commit final (obligatorio)

```
feat(rdf_explorer): persiste workspaces (paneles + grafo + settings)

- WorkspacePersistenceService con serializacion pura del workspace
- WorkspaceApiClient contra /api/dashboards (kind=explorer)
- Paneles con tabs (multi-panel)
- Modal "Guardar workspace" con sobreescribir/copia
- Hidratacion via ?workspaceId
- Tests round-trip de grafo Cytoscape, cobertura ≥80%

Refs: docs/specs/stages/03b-persistencia-explorer.md
```

Detenete después del commit.
