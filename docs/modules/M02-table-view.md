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

**NO implementa:**
- Edición de celdas (eso es M06 curado, en un panel aparte).
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

## 4. Dependencias

- **Lee de:** `selectionService.filteredQueryResult$`.
- **Emite a:** `selectionService.select(node, 'table')`.
- **Librerías:** `ag-grid-community ^31`, `ag-grid-angular ^31`.

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

## 10. Prompt para AI ejecutora

```
Sos un experto en Angular 17 + ag-grid-community.

Lee primero:
- docs/00-architecture.md
- docs/01-tech-stack.md
- docs/02-data-contracts.md (§1, §2)
- docs/04-conventions-and-glossary.md
- docs/modules/M02-table-view.md (este archivo)
- docs/modules/M07-selection-service.md

Pre-requisitos: M07 implementado.

Archivos a crear:
- frontend/src/app/features/table-view/table-view.component.{ts,html,scss}
- frontend/src/app/features/table-view/cell-renderers/coord-cell-renderer.component.ts
- frontend/src/app/features/table-view/cell-renderers/uri-cell-renderer.component.ts
- frontend/src/app/features/table-view/table-view.component.spec.ts

Restricciones:
- NO modifiques M07 ni 02-data-contracts.md.
- Usar ag-grid-community (no enterprise).
- Standalone components.

Definición de hecho:
- Criterios §9 verificados.
- Tests pasan.
- Demo: ejecutar query "Ciudades de Argentina", ver tabla, click en fila, ver evento en SelectionService.
```
