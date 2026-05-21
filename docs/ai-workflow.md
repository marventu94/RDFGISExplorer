# AI Workflow — Cómo repartir el trabajo entre AIs

> **Audiencia:** vos (Martín) y cualquier AI que vaya a contribuir al proyecto.

Este documento define cómo se coordinan múltiples AIs trabajando en paralelo sobre `rdf_gis_explorer`. La idea: cada AI implementa **un módulo a la vez** leyendo un MD bien acotado, sin tener que comprender todo el sistema.

---

## 1. Reglas de oro

1. **Una AI = un módulo = un PR.** No se mezclan módulos en un mismo PR.
2. **Nadie modifica `docs/02-data-contracts.md`** sin acuerdo explícito. Si una AI necesita un tipo nuevo, abre issue con la propuesta antes de implementar.
3. **Cada AI lee los docs base** (`docs/00..04`) + su MD de módulo. No lee otros módulos a menos que su MD lo indique.
4. **Tests + lint + typecheck pasan antes de mergear.**
5. **Sin TODOs en código mergeado.** Si algo queda pendiente, se documenta como issue, no como comentario.
6. **Cambio breaking en un módulo:** actualizar el MD del módulo + avisar al resto.

---

## 2. Orden recomendado de implementación

### Wave 0 — Documentación (ya completada)
Los 15 archivos `docs/*.md` están escritos. No hay AI ejecutora acá: lo hizo el planner inicial.

### Wave 1 — Fundación (secuencial dentro de la wave, paralela entre items)

Estos tres módulos no tienen dependencias funcionales entre sí pero todos los demás los necesitan:

| Módulo | Quién lo hace | Output |
|---|---|---|
| **M09** SPARQL Adapter | AI-backend-1 | `backend/src/adapters/*` + tests |
| **M08** Backend API (sin endpoints de curado) | AI-backend-2 | `backend/src/modules/{query,suggestions,health}` |
| **M07** SelectionService | AI-frontend-1 | `frontend/src/app/core/services/selection.service.ts` + models |

**Importante:** M08 depende del **interface** de M09 (`SparqlEndpoint`), no de la implementación. La AI-backend-2 puede arrancar tan pronto como AI-backend-1 commitee la interfaz (no necesita esperar al adapter completo).

### Wave 2 — Vistas (paralelo completo)

Una vez Wave 1 mergeada:

| Módulo | Quién |
|---|---|
| **M01** SPARQL Input | AI-frontend-2 |
| **M02** Table View | AI-frontend-3 |
| **M03** Graph View | AI-frontend-4 |
| **M04** Map View | AI-frontend-5 |
| **M05** Timeline View | AI-frontend-6 |

Todas dependen solo de M07 (estable) y M08 (estable). Pueden ir en paralelo sin coordinarse entre sí, **salvo M03 y M04 que comparten `ENTITY_TYPE_COLORS`** — el primero que llegue lo crea en `frontend/src/app/shared/entity-colors.ts`, el segundo lo importa.

### Wave 3 — Curado

| Módulo | Quién |
|---|---|
| **M08 extras** Endpoints `/curation/*` | AI-backend-3 (puede ser la misma de Wave 1) |
| **M06** Curation Panel | AI-frontend-7 |

M06 frontend depende de los endpoints `/curation/*` listos. M08 los implementa primero, M06 después.

### Wave 4 — Integración y polish

- Smoke test E2E con Playwright (1 escenario golden path).
- `docker-compose.yml` final con healthchecks.
- README del repo actualizado.

---

## 3. Branches y PRs

### Naming
- `feat/m0X-<slug>`: implementación de un módulo. Ej: `feat/m03-graph-view`.
- `fix/<slug>`: bugfix puntual.
- `docs/<slug>`: cambios en `docs/`.
- `chore/<slug>`: tareas no funcionales (deps, CI, etc.).

### Commit messages (Conventional Commits)
```
feat(M03): focus+context on node selection

Closes GRAPH-02. Implementa el desvanecimiento del resto del grafo
al seleccionar un nodo, manteniendo vecinos directos opacos.
```

### Pull Request template

```markdown
## Módulo
M03 — Graph View

## Requerimientos cubiertos
- GRAPH-01, GRAPH-02, GRAPH-03, GRAPH-05, GRAPH-06, GRAPH-07, GRAPH-09

## Cambios principales
- ...

## Cómo probarlo
1. `docker compose up`
2. Cargar query "Presidentes argentinos"
3. ...

## Checklist
- [x] Tests pasan
- [x] Lint y typecheck limpios
- [x] No modifiqué 02-data-contracts.md ni módulos ajenos
- [x] MD del módulo actualizado si hubo desvíos
```

### Reglas para mergear

1. CI verde (lint, typecheck, tests).
2. PR abierto contra `main`.
3. Si el módulo expone algo que otras AIs van a consumir (M07, M08, M09): notificar antes de mergear.
4. Squash merge: un módulo entero como un solo commit en `main`.

---

## 4. Handoff entre AIs

Cuando una AI termina su módulo y otra va a depender de él:

1. La AI saliente:
   - Asegura que el PR está mergeado en `main`.
   - Si hubo desvíos respecto al MD original, actualiza el MD del módulo.
   - Si el módulo expone APIs/interfaces nuevas, asegura que están documentadas en `02-data-contracts.md` (si son cross-cutting) o en el MD del módulo (si son internas).
2. La AI entrante:
   - Hace `git pull origin main`.
   - Lee el MD de su módulo + los MDs de módulos que va a consumir (no más).
   - Inicia branch `feat/m0X-<slug>`.

---

## 5. Resolución de conflictos

### Si dos AIs tocan el mismo archivo (no debería pasar, pero...)

- Si es un archivo compartido (ej: `shared/entity-colors.ts`): el segundo PR resuelve el conflicto manualmente o merge merge.
- Si es un archivo de otra feature: **error**. Cada AI solo toca archivos de su feature. Reportar y rollback.

### Si una AI propone cambiar un contrato de datos

1. Abrir issue: "Propuesta: agregar campo `X` a `NormalizedNode`".
2. Justificar y proponer impacto en otros módulos.
3. Esperar aprobación (Martín o reviewer).
4. PR aparte que modifica solo `02-data-contracts.md` y los dos archivos espejo (`frontend/src/app/shared/models/` y `backend/src/shared/dto/`).
5. Una vez mergeado, los módulos consumidores pueden actualizarse.

---

## 6. Prompt template para cada AI ejecutora

Cada MD de módulo (`docs/modules/M0X-*.md`) tiene una sección §10 con un prompt listo para pasar a la AI. Estructura:

```
Sos un experto en <stack>.

Lee primero (obligatorio): <lista>

Pre-requisitos: <módulos ya implementados>

Archivos a crear: <paths exactos>

Restricciones: <no modificar X, no tocar Y>

Definición de hecho: <criterios verificables>
```

**Cuando le pasés el prompt a una AI:**
1. Asegurate de que la AI tiene acceso al repo (clonado).
2. Pasale el contenido del MD del módulo + los MDs base (`00..04`).
3. Especificale qué módulos pre-requisito ya están en `main`.
4. Aclarale: "implementá solo lo que está en este MD, no te adelantes".

---

## 7. Estado del proyecto (actualizar a mano)

| Wave | Módulo | Estado | Branch / PR | AI |
|---|---|---|---|---|
| W0 | Documentación | ✅ | (en `main`) | planner |
| W1 | M09 SPARQL Adapter | ⏳ | — | — |
| W1 | M08 Backend (core) | ⏳ | — | — |
| W1 | M07 SelectionService | ⏳ | — | — |
| W2 | M01 SPARQL Input | ⏳ | — | — |
| W2 | M02 Table | ⏳ | — | — |
| W2 | M03 Graph | ⏳ | — | — |
| W2 | M04 Map | ⏳ | — | — |
| W2 | M05 Timeline | ⏳ | — | — |
| W3 | M08 Curation endpoints | ⏳ | — | — |
| W3 | M06 Curation Panel | ⏳ | — | — |
| W4 | E2E + polish | ⏳ | — | — |

> Convención: `⏳` pendiente, `🟡` en progreso, `✅` mergeado, `🟥` bloqueado.

---

## 8. Comunicación con el humano (Martín)

Cuando una AI ejecutora termina:
- Resumen en 3-5 líneas: qué hizo, qué tests pasan, cómo demostrarlo.
- Link al PR.
- Próximo módulo sugerido (según las waves).

Cuando una AI ejecutora se atasca:
- **NO improvisar** soluciones que toquen otros módulos.
- Reportar exactamente el problema, qué se intentó, qué información falta.
- Si el problema es por un contrato de datos: seguir §5.

---

## 9. Fase 2: migrar a MillenniumDB

Cuando el OVS esté listo en MillenniumDB:

1. Una AI implementa `MillenniumDBAdapter` (reemplaza el stub `NotImplementedError` de M09).
2. Cambia `.env`: `SPARQL_BACKEND=millenniumdb` + `SPARQL_ENDPOINT_URL=...`.
3. Si el dialecto de MillenniumDB difiere de Wikidata en algo (prefijos, sintaxis), se documenta en el MD de M09.
4. Las queries predefinidas (M01) se adaptan o se mantiene una segunda biblioteca específica del OVS.
5. La codificación visual (`ENTITY_TYPE_COLORS`) se amplía con los tipos del OVS (Inmueble, Barrio, Inmobiliaria, etc.).

**Importante:** ningún cambio toca las vistas (M02-M05) ni el SelectionService (M07) ni los endpoints (M08). Esa es la garantía del patrón Adapter.
