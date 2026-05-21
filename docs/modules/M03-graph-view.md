# M03 — Graph View

## 1. Contexto

Vista de grafo nodo-enlace con Cytoscape.js. Expresa la dimensión relacional del KG. El reto principal es manejar la sobrecarga visual cuando el resultado tiene muchos nodos: se aplica un límite duro de 300 + estrategia Focus+Context.

## 2. Alcance

**SÍ implementa:**
- Componente Angular standalone `GraphViewComponent`.
- Render Cytoscape.js con layout `cola` (force-directed) por default.
- Layouts alternativos: jerárquico (`dagre`), circular, grid.
- Focus+Context al seleccionar: vecinos directos saturados, resto opacity 0.2.
- Colapso de nodos con degree > 20.
- Codificación visual por tipo (color) y degree (tamaño).
- Marca naranja para nodos con anomalías.
- Panel de detalle del nodo al hacer click (delega contenido a M06).
- Zoom/pan/fit.

**NO implementa:**
- Edición del grafo (M06 curado).
- Filtros (los recibe ya aplicados vía `filteredQueryResult$`).

## 3. Requerimientos funcionales

| ID PDF | Prioridad | Descripción | Criterio de aceptación |
|---|---|---|---|
| GRAPH-01 | Alta | Render Cytoscape con límite 300 nodos | Si `nodes.length > 300`, muestra los 300 con mayor degree + banner "Mostrando 300/{total}" |
| GRAPH-02 | Alta | Focus+Context al seleccionar | Selección: vecinos visibles 100%, resto opacity 0.2. Deselección: todos vuelven a 1.0 |
| GRAPH-03 | Alta | Colapso de nodos con degree > 20 | Nodos compuestos muestran "N" como label; click expande |
| GRAPH-04 | Alta | Click en nodo emite selección y abre panel detalle | `selectionService.select(node, 'graph')` |
| GRAPH-05 | Alta | Color por tipo + tamaño por degree | Verificable por screenshot manual; test de mapping `entityType → color` |
| GRAPH-06 | Alta | Layouts alternativos seleccionables | Dropdown con 4 opciones; cambio re-layouta |
| GRAPH-07 | Alta | Selección externa: pan + highlight automático | Suscripción a `selectedNode$` con `source !== 'graph'` hace pan al nodo |
| GRAPH-08 | Media | Borde naranja en nodos con `flags.hasAnomaly` | Style condicional Cytoscape |
| GRAPH-09 | Media | Zoom/pan/fit | Built-in de Cytoscape + botón fit |

## 4. Dependencias

- **Lee de:** `selectionService.filteredQueryResult$`, `selectionService.selectedNode$`.
- **Emite a:** `selectionService.select(node, 'graph')`.
- **Librerías:** `cytoscape ^3.28`, `cytoscape-cola ^2.5`, `cytoscape-dagre ^2.5`.

## 5. Interfaces TypeScript

```ts
// frontend/src/app/features/graph-view/graph-view.component.ts
import { Component, OnInit, OnDestroy, ElementRef, ViewChild } from '@angular/core';
import cytoscape from 'cytoscape';
import cola from 'cytoscape-cola';
import dagre from 'cytoscape-dagre';

cytoscape.use(cola);
cytoscape.use(dagre);

export type GraphLayout = 'cola' | 'dagre' | 'circle' | 'grid';

@Component({
  selector: 'app-graph-view',
  standalone: true,
  templateUrl: './graph-view.component.html',
})
export class GraphViewComponent implements OnInit, OnDestroy {
  @ViewChild('cyContainer', { static: true }) container!: ElementRef<HTMLDivElement>;
  cy?: cytoscape.Core;
  currentLayout: GraphLayout = 'cola';

  setLayout(layout: GraphLayout): void { /* ... */ }
  fit(): void { /* this.cy?.fit(undefined, 50) */ }
  private buildElements(result: QueryResult): cytoscape.ElementDefinition[] { /* ... */ }
  private applyFocusContext(focusUri: string): void { /* ... */ }
}
```

### Mapeo tipo → color (fase 1 Wikidata)

```ts
// Provisorio. Cuando se migre a OVS se reemplaza esta tabla.
export const ENTITY_TYPE_COLORS: Record<string, string> = {
  'wd:Q515':   '#2196F3', // city
  'wd:Q5':     '#9C27B0', // human
  'wd:Q4022':  '#03A9F4', // river
  'wd:Q33506': '#FF9800', // museum
  'wd:Q3918':  '#4CAF50', // university
  default:     '#607D8B',
};
```

### Focus+Context

```ts
private applyFocusContext(focusUri: string | null): void {
  if (!this.cy) return;
  if (!focusUri) {
    this.cy.elements().style('opacity', 1.0);
    return;
  }
  const focus = this.cy.getElementById(focusUri);
  const neighbors = focus.closedNeighborhood();
  this.cy.elements().difference(neighbors).style('opacity', 0.2);
  neighbors.style('opacity', 1.0);
}
```

### Colapso por degree

```ts
private collapseHighDegreeNodes(): void {
  this.cy?.nodes().forEach(node => {
    if (node.degree(false) > 20) {
      // marcar como collapsed: ocultar vecinos y mostrar contador
      node.data('collapsed', true);
      node.data('label', `${node.data('label')} [${node.degree(false)}]`);
      node.connectedEdges().style('display', 'none');
    }
  });
}
```

## 6. Contrato HTTP

N/A.

## 7. Comportamiento esperado

### Render inicial
1. Suscripción a `filteredQueryResult$`.
2. Si `nodes.length > 300`, ordenar por degree desc, tomar top 300, banner.
3. `buildElements()` produce array Cytoscape: cada `NormalizedNode` → node, cada `NormalizedEdge` → edge.
4. Aplicar style sheet con color/tamaño/borde.
5. Layout `cola` al inicio. Una vez termina, fit.

### Interacción
- Click en nodo → `select(node, 'graph')` + `applyFocusContext(node.uri)`.
- Click en background → `clearSelection()` + restaurar opacities.
- Click en nodo colapsado → expandir (mostrar edges).
- Dropdown layout → `cy.layout({ name: newLayout }).run()`.

### Reactivo a selección externa
- `selectedNode$.subscribe(sel => { if (sel.source !== 'graph' && sel.node) { panTo(sel.node.uri); applyFocusContext(sel.node.uri); } })`.

### Empty states (3 niveles)

| Caso | Detección | UI |
|---|---|---|
| `queryResult === null` | aún no se ejecutó query | Canvas vacío + texto centrado "Ejecutá una query para ver el grafo" |
| `nodes.length > 0` pero `edges.length === 0` | query sin relaciones (sin URIs joined) | Nodos visibles en layout grid (no force-directed, sin aristas) + banner: "Esta query no expresó relaciones entre entidades. El grafo muestra nodos aislados. Para ver conexiones, agregá variables URI adicionales al SELECT que vinculen tu entidad principal con otras (ej: `?city wdt:P36 ?capital`)." |
| `nodes.length > 0` pero filtros activos dejan 0 visibles | filtros aplicados | Canvas vacío + chip "0 de N nodos pasan los filtros activos" |

Para el segundo caso, el `forceLayout` produce un blob amontonado de nodos sin aristas — visualmente malo. Cambiar a `grid` layout cuando `edges.length === 0` da una grilla limpia que el usuario puede inspeccionar.

## 8. Ejemplos

### Style sheet base

```ts
const style: cytoscape.Stylesheet[] = [
  {
    selector: 'node',
    style: {
      'background-color': (ele: cytoscape.NodeSingular) =>
        ENTITY_TYPE_COLORS[ele.data('type')] ?? ENTITY_TYPE_COLORS.default,
      width: (ele: cytoscape.NodeSingular) => 20 + ele.degree(false) * 3,
      height: (ele: cytoscape.NodeSingular) => 20 + ele.degree(false) * 3,
      label: 'data(label)',
      'font-size': 11,
      'text-valign': 'bottom',
      'text-margin-y': 5,
    },
  },
  {
    selector: 'node[?flagAnomaly]',
    style: { 'border-color': '#FF9800', 'border-width': 3 },
  },
  {
    selector: 'edge',
    style: {
      'curve-style': 'bezier',
      width: 1.5,
      'line-color': '#B0BEC5',
      'target-arrow-color': '#B0BEC5',
      'target-arrow-shape': 'triangle',
    },
  },
];
```

## 9. Criterios de aceptación

- [ ] Render funciona con ≥ 1 nodo.
- [ ] Si >300 nodos, muestra solo 300 + banner.
- [ ] Click en nodo activa focus+context y abre panel.
- [ ] Layouts alternativos cambian sin recargar página.
- [ ] Selección externa hace pan + highlight.
- [ ] Borde naranja en nodos con `flags.hasAnomaly = true`.
- [ ] Botón fit recentra.
- [ ] Cleanup en `OnDestroy` (`cy?.destroy()`).

## 10. Integración con App Shell (M00)

Lee `docs/modules/M00-app-shell.md` §3 para ver el contexto completo.

| Ítem | Valor |
|---|---|
| **Selector exacto** | `app-graph-view` |
| **Dónde lo monta M00** | Celda superior-derecha del grid 2×2 |
| **Tamaño** | M00 controla ancho y alto. **No pongas width/height fijos.** |
| **CSS del host** | `:host { display: block; width: 100%; height: 100%; }` |

**Crítico para Cytoscape:** el `div#cyContainer` al que se pasa `cy = cytoscape({ container })` debe tener dimensiones reales en el momento del `ngAfterViewInit`. Si el host tiene `height: 0` o `height: auto`, Cytoscape renderiza con tamaño 0 y el grafo no aparece.

```scss
// graph-view.component.scss
:host {
  display: block;
  width: 100%;
  height: 100%;
}

.cy-container {
  width: 100%;
  height: 100%;  // hereda del host que ya tiene altura real de M00
}
```

Si el grid de M00 cambia de tamaño (divisor arrastrado), llamar `this.cy?.resize()` para que Cytoscape se adapte:

```ts
@HostListener('window:resize')
onResize(): void {
  this.cy?.resize();
}
```

## 11. Prompt para AI ejecutora

```
Sos un experto en Angular 17 + Cytoscape.js.

Lee primero:
- docs/00-architecture.md
- docs/01-tech-stack.md
- docs/02-data-contracts.md (§2)
- docs/04-conventions-and-glossary.md
- docs/modules/M00-app-shell.md (§3 y §9 — selector y estructura de archivos)
- docs/modules/M03-graph-view.md (este archivo, especialmente §10 para el :host CSS)
- docs/modules/M07-selection-service.md

Pre-requisitos: M07 implementado.

Archivos a crear:
- frontend/src/app/features/graph-view/graph-view.component.{ts,html,scss}
- frontend/src/app/features/graph-view/graph-style.ts (style sheet + color map)
- frontend/src/app/features/graph-view/graph-view.component.spec.ts

Restricciones:
- NO modifiques M07 ni 02-data-contracts.md.
- Cleanup correcto en OnDestroy.
- TS strict.

Definición de hecho:
- Criterios §9 verificados.
- Demo: ejecutar query con relaciones (ej: presidentes argentinos con ?stmt), ver grafo, hacer click en un nodo, ver focus+context.
```
