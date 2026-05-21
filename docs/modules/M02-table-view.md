# M02 — Table View

## 1. Contexto

Representación tabular por defecto al obtener resultados. Es la vista de referencia para comparar con el baseline SPARQL directo en la evaluación con usuarios. Familiar, estructurada, con paginado/orden/filtro.

## 2. Alcance

**SÍ implementa:**
- Componente Angular standalone `TableViewComponent`.
- Grilla con `ag-grid-community`.
- Columnas dinámicas derivadas de `result.variables`.
- Detección de tipo de celda (URI, literal, coordenada, fecha) y formato apropiado.
- Linking: click en fila propaga selección.
- Exportación a CSV.
- **Edición inline por celda** con botón ✏️ (ver §7.5). Persiste vía `CurationService` en M08 backend, sin abrir el panel de M06.
- **Indicador visual de estado de curado** por celda: badge ✓ validado, color distinto si tiene corrección manual o de script.

**NO implementa:**
- Panel completo de detalle del nodo (validar todo, anotaciones, duplicados — eso es M06).
- Lógica de filtros geo/temporales (filtros viven en mapa/timeline; la tabla solo reacciona a `filteredQueryResult$`).

## 3. Requerimientos funcionales

| ID PDF | Prioridad | Descripción | Criterio de aceptación |
|---|---|---|---|
| TAB-01 | Alta | Grilla con columnas dinámicas del SELECT | Cambiar query con distintas variables re-renderiza columnas |
| TAB-02 | Alta | Click en fila → `selectionService.select(node, 'table')` | Test: spy en selectionService recibe llamada con node correcto |
| TAB-03 | Alta | Ordenamiento por columna asc/desc | Click en cabecera ordena; ag-grid built-in |
| TAB-04 | Alta | Filtrado por texto libre por columna | ag-grid filter built-in |
| TAB-05 | Alta | Icono pin en celdas con coordenadas | Click en pin emite evento para centrar mapa (vía `selectionService.select`) |
| TAB-06 | Media | Exportar a CSV | Botón "Exportar CSV" descarga archivo con las filas visibles |
| TAB-07 | Media | Columnas redimensionables y reordenables | ag-grid built-in con `enableSorting`, `resizable`, `lockPinned` off |
| TAB-08 | Alta | Botón ✏️ en cada celda editable, click → edición inline | Editar valor → blur o Enter guarda contra `POST /api/curation` o `PATCH /api/curation/:id` |
| TAB-09 | Alta | Celdas muestran el valor efectivo (manual > script > raw) | Si hay correcciones cargadas, la celda muestra `manualValue ?? scriptValue ?? rawValue` |
| TAB-10 | Alta | Badge visual ✓ en celdas validadas, color en corregidas | Verificable por screenshot manual; tests de mapping `status → CSS class` |
| TAB-11 | Media | Carga lazy de correcciones por nodo al renderizar la fila | `CurationService.getForNode(uri)` se llama on-demand, no en bulk |

## 4. Dependencias

- **Lee de:** `selectionService.filteredQueryResult$`, `selectionService.selectedNode$`, `CurationService.getForNode()` (lazy).
- **Emite a:** `selectionService.select(node, 'table')`, `CurationService.create()` / `.update()`.
- **Librerías:** `ag-grid-community ^31`, `ag-grid-angular ^31`.
- **Crea `CurationService`** en `frontend/src/app/core/services/curation.service.ts`. M06 después lo consume sin duplicarlo.

## 5. Interfaces TypeScript

```ts
// frontend/src/app/features/table-view/table-view.component.ts
import { Component, OnInit, OnDestroy } from '@angular/core';
import { ColDef, GridApi, GridReadyEvent, RowSelectedEvent } from 'ag-grid-community';

@Component({
  selector: 'app-table-view',
  standalone: true,
  imports: [/* AgGridModule, ... */],
  templateUrl: './table-view.component.html',
})
export class TableViewComponent implements OnInit, OnDestroy {
  rowData: ResultBinding[] = [];
  columnDefs: ColDef[] = [];
  // ...
  onRowSelected(event: RowSelectedEvent): void { /* selectionService.select(...) */ }
  exportCsv(): void { /* gridApi.exportDataAsCsv() */ }
}
```

### Generación de columnas

```ts
private buildColumnDefs(result: QueryResult): ColDef[] {
  return result.variables.map(variable => ({
    field: variable,
    headerName: variable,
    sortable: true,
    filter: true,
    resizable: true,
    valueGetter: params => this.formatCell(params.data[variable]),
    cellRenderer: this.cellRendererFor(variable, result),
  }));
}

private formatCell(value: BindingValue | undefined): string {
  if (!value) return '';
  switch (value.type) {
    case 'date': return new Date(value.value).toLocaleString('es-AR');
    case 'coordinate': return `${value.value.lat.toFixed(4)}, ${value.value.lng.toFixed(4)}`;
    case 'uri': return this.shortenUri(value.value);
    case 'literal': return value.value;
    default: return String(value.value);
  }
}
```

### Pin renderer para coordenadas

```ts
// Cell renderer que agrega botón pin junto al texto
@Component({
  template: `
    <span>{{ display }}</span>
    <button mat-icon-button (click)="onPinClick()" *ngIf="hasCoord">
      <mat-icon>place</mat-icon>
    </button>
  `,
})
export class CoordCellRenderer { /* ... */ }
```

## 6. Contrato HTTP

N/A (consume estado del SelectionService).

## 7. Comportamiento esperado

### Render inicial
1. Suscripción a `filteredQueryResult$`.
2. Cuando emite, llamar `buildColumnDefs` y setear `rowData = result.bindings`.
3. Si `result === null`, mostrar empty state ("Ejecutá una query para ver resultados").

### Selección
1. Usuario hace click en una fila.
2. Encontrar el `NormalizedNode` correspondiente (matching por URI de la columna `uri` o la primera columna URI del binding).
3. `selectionService.select(node, 'table')`.
4. La fila queda resaltada con color de acento.

### Selección desde otras vistas
1. Suscripción a `selectedNode$` filtrada por `source !== 'table'`.
2. Buscar la fila correspondiente, hacer scroll y resaltarla.

### Truncamiento
Si `result.meta.truncated`, mostrar banner sobre la tabla: "Mostrando {bindings.length} de {limit} resultados (truncado)".

### 7.5 Edición inline por celda (curado rápido)

**Flujo:**
1. Hover sobre una celda editable (cualquier celda excepto la columna URI primaria) → aparece icono ✏️ en la esquina derecha.
2. Click en ✏️ → la celda se convierte en input editable con el valor actual pre-cargado.
3. El usuario edita y:
   - **Enter** o blur fuera de la celda → guarda.
   - **Esc** → cancela sin guardar.
4. Al guardar:
   - Si **no hay** `CurationRecord` para `(nodeUri, fieldName)`: `CurationService.create({ nodeUri, fieldName, rawValue, manualValue: nuevoValor, status: 'corrected' })`.
   - Si **ya existe**: `CurationService.update(id, { manualValue: nuevoValor, status: 'corrected' })`.
5. Snackbar de confirmación. La celda se actualiza al nuevo valor con badge color "corregido".

**Visualización por estado:**

| Estado del campo | Visual de la celda |
|---|---|
| Sin record (valor raw del grafo) | Texto normal, sin badge |
| `status: 'validated'` | Badge ✓ verde a la derecha del valor |
| `status: 'corrected'` (tiene `manualValue`) | Texto en color azul con borde inferior punteado + badge ✏️ |
| `status: 'pending'` | Badge ⏳ amarillo |
| `scriptValue` presente sin override manual | Texto en color violeta + badge 🤖 |

**Tooltip al hover en una celda con record:** muestra autor, timestamp y valores anteriores.

**Carga lazy:**

```ts
// En la inicialización de cada fila visible
async onRowFirstVisible(node: NormalizedNode): Promise<void> {
  if (!this.curationCache.has(node.uri)) {
    const { records } = await this.curationService.getForNode(node.uri).toPromise();
    this.curationCache.set(node.uri, records);
    this.gridApi.refreshCells({ rowNodes: [/* esta fila */] });
  }
}
```

**Botón "Ver detalle completo":** cada fila tiene también un botón 🔍 que abre el panel M06 (sidenav con tabs Datos/Anotaciones/Duplicados) para operaciones avanzadas. La tabla cubre el flujo rápido (corregir 1 campo); el panel cubre el flujo profundo (validar todo, gestionar duplicados, ver historial).

**Columnas no editables:**

- La columna URI primaria (la primera columna `?uri` del SELECT) no es editable porque cambia la identidad del nodo.
- Columnas con tipo `coordinate` permiten editar mostrando dos inputs `lat` y `lng`.
- Columnas con tipo `date` muestran un date picker en vez de input texto libre.

## 8. Wireframe ASCII

```
┌──────────────────────────────────────────────────────────────────┐
│ [Filtro global: ____________] [Exportar CSV] [Cols: 50/100/200▼] │
├──────────────────────────────────────────────────────────────────┤
│ city ▼              │ cityLabel       │ coord 📍       │ pop     │
├─────────────────────┼─────────────────┼────────────────┼─────────┤
│ wd:Q1486            │ Buenos Aires    │ -34.60, -58.38 │ 3075646 │  ← seleccionada
│ wd:Q11164           │ Córdoba         │ -31.41, -64.18 │ 1391000 │
│ wd:Q200005          │ Rosario         │ -32.95, -60.66 │ 1193605 │
│ ...                                                              │
├──────────────────────────────────────────────────────────────────┤
│ Página 1/4 (50/200)              [< ] [1] 2  3  4 [>]            │
└──────────────────────────────────────────────────────────────────┘
```

## 9. Criterios de aceptación

- [ ] Tabla renderiza con columnas dinámicas según query.
- [ ] Click en fila → `selectionService.select(_, 'table')` (verificado con spy).
- [ ] Selección externa (desde grafo, mapa, timeline) hace scroll + highlight.
- [ ] Filtro por texto en cualquier columna funciona.
- [ ] Sort por click en cabecera funciona (asc/desc/none).
- [ ] Pin en celda de coord centra el mapa (verificable porque emite la misma selección al SelectionService).
- [ ] Exportar CSV descarga archivo con filas actualmente visibles.
- [ ] Columnas resizable y reordenable por drag.
- [ ] Empty state cuando no hay resultados.

## 10. Integración con App Shell (M00)

Lee `docs/modules/M00-app-shell.md` §3 para ver el contexto completo.

| Ítem | Valor |
|---|---|
| **Selector exacto** | `app-table-view` |
| **Dónde lo monta M00** | Celda superior-izquierda del grid 2×2 |
| **Tamaño** | M00 controla ancho y alto vía CSS Grid. **No pongas width/height fijos.** |
| **CSS del host** | `:host { display: block; width: 100%; height: 100%; overflow: hidden; }` |

ag-grid necesita un contenedor con altura real para renderizar. Como M00 lo provee vía CSS Grid, el componente solo debe asegurarse de que su template raíz tenga `height: 100%`:

```html
<!-- table-view.component.html -->
<ag-grid-angular style="width: 100%; height: 100%" ...></ag-grid-angular>
```

## 11. Prompt para AI ejecutora

```
Sos un experto en Angular 17 + ag-grid-community.

Lee primero:
- docs/00-architecture.md
- docs/01-tech-stack.md
- docs/02-data-contracts.md (§1, §2, §4)
- docs/04-conventions-and-glossary.md
- docs/modules/M00-app-shell.md (§3 y §9 — selector y estructura de archivos)
- docs/modules/M02-table-view.md (este archivo, especialmente §7.5 — edición inline)
- docs/modules/M07-selection-service.md
- docs/modules/M08-backend-api.md (endpoints /curation para edición inline)

Pre-requisitos: M07 implementado. M08 con endpoints /curation/* implementado (o stub mockeado).

Archivos a crear:
- frontend/src/app/features/table-view/table-view.component.{ts,html,scss}
- frontend/src/app/features/table-view/cell-renderers/coord-cell-renderer.component.ts
- frontend/src/app/features/table-view/cell-renderers/uri-cell-renderer.component.ts
- frontend/src/app/features/table-view/cell-renderers/editable-cell-renderer.component.ts  ← NEW (botón ✏️ + indicador estado curado)
- frontend/src/app/features/table-view/cell-editors/inline-editor.component.ts  ← NEW (input editable cuando se activa)
- frontend/src/app/core/services/curation.service.ts  ← NEW (lo usa también M06)
- frontend/src/app/core/services/curation.service.spec.ts
- frontend/src/app/features/table-view/table-view.component.spec.ts

Restricciones:
- NO modifiques M07, M08 (ya implementados) ni 02-data-contracts.md.
- Usar ag-grid-community (no enterprise).
- Standalone components.
- CurationService debe quedar en core/services (NO dentro de features/table-view) porque M06 lo va a consumir.
- Edición inline: Enter o blur guarda, Esc cancela.
- Author del curado: leer de localStorage con default 'martin@bago.com.ar'.

Definición de hecho:
- Criterios §9 verificados.
- Tests pasan.
- Demo: ejecutar query "Ciudades de Argentina", ver tabla, click en fila, ver evento en SelectionService.
```
