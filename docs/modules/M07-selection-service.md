# M07 — SelectionService (Linking & Brushing)

## 1. Contexto

Singleton Angular que mantiene el estado compartido entre las 4 vistas coordinadas. Cuando una vista emite una selección o filtro, este servicio lo propaga a las demás. Es la pieza central que hace funcionar el linking & brushing y debe garantizar **latencia <200ms** end-to-end.

## 2. Alcance

**SÍ implementa:**
- Tres `BehaviorSubject` para `selectedNode$`, `activeFilters$`, `queryResult$`.
- API mutadora: `select()`, `clearSelection()`, `addFilter()`, `removeFilter()`, `setQueryResult()`.
- Prevención de loops: cuando una vista emite una selección con `source: 'X'`, no debe re-disparar un evento que llegue de vuelta a la vista X (handled via `source` flag).
- Aplicación de filtros a `queryResult` para que las vistas reciban un subset filtrado vía un observable derivado `filteredQueryResult$`.

**NO implementa:**
- Lógica de cada vista (eso es M02-M05).
- Persistencia de selección entre recargas (out of scope).

## 3. Requerimientos funcionales

| ID | Prioridad | Descripción | Criterio de aceptación |
|---|---|---|---|
| SEL-01 | Alta | Tres BehaviorSubject expuestos como Observables | Tests verifican que el valor inicial es null/[]/null |
| SEL-02 | Alta | `select(node, source)` actualiza `selectedNode$` | Suscriptores reciben el nuevo nodo |
| SEL-03 | Alta | `addFilter(filter)` agrega al array activo (no duplica por id) | Test: 2 adds con mismo id → solo 1 en la lista |
| SEL-04 | Alta | `removeFilter(id)` elimina del array | Test |
| SEL-05 | Alta | `filteredQueryResult$` deriva de `queryResult$` + `activeFilters$` | Filtro geo aplicado → solo nodos con coord dentro del polígono |
| SEL-06 | Alta | Latencia: emit → suscriptor recibe < 200ms (excluyendo render) | Test con `fakeAsync` + `tick` mide el delay |
| SEL-07 | Alta | `source` del evento preserva trazabilidad para debug y evitar loops | Test verifica que `selectedNode$` emite el objeto con `source` correcto |
| SEL-08 | Media | `clearSelection()` y `clearFilters()` | Tests |
| SEL-09 | Media | `setQueryResult(null)` limpia selección y filtros (reset al ejecutar nueva query) | Test verifica side-effect |

## 4. Dependencias

- **Lee de:** nada (es estado puro).
- **Es consumido por:** M01 (lee result), M02 (lee+emite selección), M03 (lee+emite), M04 (lee+emite+filtros geo), M05 (lee+emite+filtros temporales), M06 (lee selección).
- **Librerías:** `rxjs ^7.8.0`, `@turf/boolean-point-in-polygon ^6.5.0` (para filtros geo).

## 5. Interfaces TypeScript

```ts
// frontend/src/app/core/services/selection.service.ts
import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, combineLatest, map } from 'rxjs';
import booleanPointInPolygon from '@turf/boolean-point-in-polygon';
import {
  NormalizedNode, QueryResult, Selection, Filter
} from '@shared/models';

@Injectable({ providedIn: 'root' })
export class SelectionService {
  private _selectedNode$ = new BehaviorSubject<Selection>({ node: null, source: 'external' });
  private _activeFilters$ = new BehaviorSubject<Filter[]>([]);
  private _queryResult$ = new BehaviorSubject<QueryResult | null>(null);

  readonly selectedNode$: Observable<Selection> = this._selectedNode$.asObservable();
  readonly activeFilters$: Observable<Filter[]> = this._activeFilters$.asObservable();
  readonly queryResult$: Observable<QueryResult | null> = this._queryResult$.asObservable();

  readonly filteredQueryResult$: Observable<QueryResult | null> = combineLatest([
    this._queryResult$,
    this._activeFilters$,
  ]).pipe(map(([result, filters]) => this.applyFilters(result, filters)));

  select(node: NormalizedNode | null, source: Selection['source'] = 'external'): void { /* ... */ }
  clearSelection(): void { /* ... */ }
  addFilter(filter: Filter): void { /* ... */ }
  removeFilter(id: string): void { /* ... */ }
  clearFilters(): void { /* ... */ }
  setQueryResult(result: QueryResult | null): void { /* ... resetea selección y filtros ... */ }

  private applyFilters(result: QueryResult | null, filters: Filter[]): QueryResult | null { /* ... */ }
}
```

## 6. Contrato HTTP

N/A (servicio frontend).

## 7. Comportamiento esperado

### Aplicación de filtros (`applyFilters`)

```ts
private applyFilters(result: QueryResult | null, filters: Filter[]): QueryResult | null {
  if (!result) return null;
  if (filters.length === 0) return result;

  const filtered = result.nodes.filter(node => filters.every(f => this.nodePassesFilter(node, f)));
  const filteredUris = new Set(filtered.map(n => n.uri));
  const edges = result.edges.filter(e => filteredUris.has(e.source) && filteredUris.has(e.target));

  return { ...result, nodes: filtered, edges };
}

private nodePassesFilter(node: NormalizedNode, filter: Filter): boolean {
  if (filter.kind === 'geo') {
    if (!node.coordinate) return false; // nodos sin coord se excluyen cuando hay filtro geo
    return booleanPointInPolygon(
      [node.coordinate.lng, node.coordinate.lat],
      filter.polygon
    );
  }
  if (filter.kind === 'temporal') {
    if (!node.temporalEvents?.length) return false;
    return node.temporalEvents.some(ev => ev.isoDate >= filter.from && ev.isoDate <= filter.to);
  }
  return true;
}
```

### Loop prevention
Cada vista, al suscribirse, ignora eventos cuyo `source` sea el suyo propio. Ejemplo:

```ts
// En GraphViewComponent
this.selectionService.selectedNode$
  .pipe(filter(sel => sel.source !== 'graph'))
  .subscribe(sel => this.highlightNode(sel.node));
```

### Reset al cambiar de query
```ts
setQueryResult(result: QueryResult | null): void {
  this._queryResult$.next(result);
  this._selectedNode$.next({ node: null, source: 'external' });
  this._activeFilters$.next([]);
}
```

## 8. Ejemplos

### Escenario: usuario filtra por área geográfica
1. Usuario dibuja polígono en M04 (mapa).
2. M04 llama `selectionService.addFilter({ id: 'geo-1', kind: 'geo', polygon, label: 'Centro CABA' })`.
3. `activeFilters$` emite `[GeoFilter]`.
4. `filteredQueryResult$` deriva un `QueryResult` con solo los nodos dentro del polígono.
5. M02 (tabla), M03 (grafo) y M05 (timeline) están suscriptos a `filteredQueryResult$` → re-renderizan con el subset.

### Escenario: usuario selecciona fila en tabla
1. M02 emite `selectionService.select(node, 'table')`.
2. `selectedNode$` emite `{ node, source: 'table' }`.
3. M03, M04, M05 reaccionan haciendo highlight/flyTo/scroll.
4. M02 ignora el evento (source === 'table').

## 9. Criterios de aceptación

- [ ] `SelectionService` declarado con `providedIn: 'root'`.
- [ ] Los tres observables emiten valores iniciales correctos.
- [ ] `addFilter` con id duplicado no agrega duplicado (lo reemplaza).
- [ ] `filteredQueryResult$` con filtro geo y temporal acumulados funciona.
- [ ] Tests `fakeAsync` verifican latencia <50ms entre emit y suscripción (cota más estricta que 200ms para dejar margen al render).
- [ ] Cobertura 100% del servicio.

## 10. Prompt para AI ejecutora

```
Sos un experto en Angular 17 + RxJS 7. Tu tarea es implementar el módulo M07 (SelectionService).

Lee primero (obligatorio):
- docs/00-architecture.md
- docs/01-tech-stack.md
- docs/02-data-contracts.md (especialmente §2, §3)
- docs/04-conventions-and-glossary.md
- docs/modules/M07-selection-service.md (este archivo)

Archivos a crear:
- frontend/src/app/core/services/selection.service.ts
- frontend/src/app/core/services/selection.service.spec.ts
- frontend/src/app/shared/models/index.ts (re-exports de los tipos de 02-data-contracts.md)
- frontend/src/app/shared/models/{node.model.ts, edge.model.ts, query-result.model.ts, selection.model.ts, filter.model.ts, coordinate.model.ts, temporal-event.model.ts, binding.model.ts}

Restricciones:
- NO modifiques 02-data-contracts.md.
- NO toques otras features de frontend/src/app/features/.
- Cobertura 100% en este servicio.
- TS strict.

Definición de hecho:
- Todos los criterios de §9 verificados.
- Tests pasan con `ng test --watch=false`.
- Lint limpio.
```
