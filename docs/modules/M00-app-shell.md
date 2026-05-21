# M00 — App Shell (Layout principal)

## 1. Contexto

Define cómo se ensamblan todos los módulos en pantalla. Es el `AppComponent` + el componente `DashboardComponent` que organiza las cuatro vistas. Sin este módulo los demás componentes existen pero no se ven.

**Este módulo es prerrequisito visual de Wave 2.** Debe implementarse junto con o antes de M01-M05.

## 2. Layout general

```
┌─────────────────────────────────────────────────────────────────────┐
│  NAVBAR: "RDF GIS Explorer"   [filtros activos: badge×N]  [▼ Query] │
├─────────────────────────────────────────────────────────────────────┤
│  SPARQL INPUT (M01) — colapsable, altura ~180px                      │
│  PREFIX wd: ...  SELECT ?city ?coord WHERE { ... }   [Ejecutar ▶]   │
│                                              [▲ Colapsar editor]    │
├──────────────────────────┬──────────────────────────────────────────┤
│                          │                                          │
│   TABLA (M02)            ║   GRAFO (M03)                            │
│                          ║                                          │
│   (50% ancho, 50% alto)  ║   (50% ancho, 50% alto)                 │
│                          ║                                          │
├══════════════════════════╬══════════════════════════════════════════┤
│  ← divisor vertical  →   ║   ← divisor horizontal →                │
├──────────────────────────┴──────────────────────────────────────────┤
│                          │                                          │
│   MAPA (M04)             ║   TIMELINE (M05)                         │
│                          ║                                          │
│   (50% ancho, 50% alto)  ║   (50% ancho, 50% alto)                 │
│                          ║                                          │
└──────────────────────────┴─────────────────────────────────────────┘
                                          ┌─────────────────────────┐
                                          │  CURADO (M06)           │
                                          │  Sidenav derecho        │
                                          │  (slide desde la der.)  │
                                          └─────────────────────────┘
```

## 3. Componentes involucrados

| Componente | Selector | Responsabilidad |
|---|---|---|
| `AppComponent` | `app-root` | Shell raíz: mat-sidenav-container, navbar, outlet |
| `DashboardComponent` | `app-dashboard` | Grid resizable con las 4 vistas |
| `NavbarComponent` | `app-navbar` | Logo, indicador de filtros activos, botón colapsar editor |
| `FilterBadgesComponent` | `app-filter-badges` | Muestra filtros activos con botón × para remover cada uno |
| `SparqlInputComponent` | `app-sparql-input` | M01 — editor SPARQL (colapsable) |
| `TableViewComponent` | `app-table-view` | M02 |
| `GraphViewComponent` | `app-graph-view` | M03 |
| `MapViewComponent` | `app-map-view` | M04 |
| `TimelineViewComponent` | `app-timeline-view` | M05 |
| `CurationPanelComponent` | `app-curation-panel` | M06 — sidenav derecho |

## 4. Implementación del grid redimensionable

Usar **CSS Grid + Angular CDK drag** para los divisores. No hay una librería oficial de Angular para esto; se implementa con un divisor custom.

```
DashboardComponent usa CSS Grid:
  grid-template-columns: var(--col-left, 50%) var(--col-right, 50%)
  grid-template-rows: var(--row-top, 50%) var(--row-bottom, 50%)
```

El divisor vertical (entre tabla/grafo y mapa/timeline) y el horizontal (entre arriba/abajo) son `<div>` con `cdkDrag` que actualizan las CSS custom properties al soltar.

```ts
// dashboard.component.ts — lógica del divisor

onVerticalDragEnd(event: CdkDragEnd): void {
  const delta = event.distance.x;
  const containerWidth = this.containerRef.nativeElement.offsetWidth;
  const pct = Math.max(20, Math.min(80,
    (this.colLeft + (delta / containerWidth) * 100)
  ));
  this.colLeft = pct;
  document.documentElement.style.setProperty('--col-left', `${pct}%`);
  document.documentElement.style.setProperty('--col-right', `${100 - pct}%`);
}
```

## 5. Editor SPARQL colapsable

El editor ocupa una franja en la parte superior. El botón "▲ Colapsar" lo anima hacia arriba (Angular Animations).

```ts
// Estados: 'expanded' | 'collapsed'
// Altura expanded: 180px
// Altura collapsed: 0px + overflow hidden
// El grid debajo ocupa el espacio liberado (height: calc(100vh - navbarH - editorH))
```

## 6. Indicador de filtros activos

En la navbar, un componente `FilterBadgesComponent` se suscribe a `activeFilters$` y muestra un badge por cada filtro activo:

```
[× Área: Centro CABA]  [× Rango: 2020–2023]
```

Click en `×` llama `selectionService.removeFilter(id)`. Automáticamente M07 recalcula `filteredQueryResult$` y todas las vistas se actualizan.

## 7. Sidenav de curado (M06)

`MatSidenav` en modo `over` desde la derecha. Se abre cuando `selectedNode$ !== null` y el usuario hace click en "Ver detalle" (botón flotante sobre las vistas o en el panel inferior). Se cierra con `×` o cuando `selectedNode$` emite null.

```ts
// app.component.ts
this.selectionService.selectedNode$.subscribe(sel => {
  if (sel.node) this.sidenavOpen = true;
  // no se cierra automáticamente al deseleccionar — el usuario cierra con ×
});
```

## 8. Estados vacíos (sin resultados o resultados parciales)

El shell **no maneja** empty states de las vistas — cada módulo (M02-M05) muestra su propio empty state según el caso. M00 solo se asegura de que las celdas del grid existen aunque la vista esté "vacía".

**Tres niveles de estado vacío en cada vista:**

| Nivel | Detección | Manejado por |
|---|---|---|
| Sin query ejecutada | `queryResult === null` | Empty state inicial de cada vista |
| Query con resultados pero sin datos relevantes | Ej. `nodes` sin coordenadas → mapa | Empty state informativo en M03/M04/M05 con link a Mapeo de Variables de M01 |
| Resultados filtrados a cero | filtros activos dejan 0 | Banner con chips de filtros activos para removerlos |

Antes de ejecutar la primera query, el dashboard muestra:

```
┌─────────────────────────────────────────────────────────────────────┐
│  Editor SPARQL (vacío, listo para tipear)                           │
├──────────────────────────────────┬──────────────────────────────────┤
│  📊 Tabla — Ejecutá una query    │  🕸 Grafo — Ejecutá una query    │
├──────────────────────────────────┼──────────────────────────────────┤
│  🗺 Mapa de Argentina visible    │  🕐 Eje temporal vacío            │
└──────────────────────────────────┴──────────────────────────────────┘
```

Cuando la query devuelve resultados pero sin coordenadas:

```
┌──────────────────────────────────┬──────────────────────────────────┐
│  📊 Tabla con N filas             │  🕸 Grafo con N nodos             │
├──────────────────────────────────┼──────────────────────────────────┤
│  🗺 Mapa base + overlay:          │  🕐 Timeline con eventos          │
│     "Esta query no devolvió      │     (si hay fechas)               │
│      coordenadas. Ajustá el      │                                   │
│      Mapeo de Variables ↑"       │                                   │
└──────────────────────────────────┴──────────────────────────────────┘
```

Detalles por vista: ver §"Empty states" de cada MD (M02, M03, M04, M05).

## 9. Estructura de archivos

```
frontend/src/app/
├── app.ts                          ← AppComponent (mat-sidenav-container)
├── app.html
├── app.scss
├── app.config.ts                   ← ya existe, agregar provideAnimations, provideHttpClient
├── features/
│   └── dashboard/
│       ├── dashboard.component.ts
│       ├── dashboard.component.html
│       ├── dashboard.component.scss
│       ├── navbar/
│       │   ├── navbar.component.ts
│       │   └── navbar.component.html
│       └── filter-badges/
│           ├── filter-badges.component.ts
│           └── filter-badges.component.html
```

## 10. Requerimientos funcionales

| ID | Prioridad | Descripción | Criterio |
|---|---|---|---|
| SHELL-01 | Alta | 4 vistas visibles simultáneamente en grid | Verificable visualmente |
| SHELL-02 | Alta | Divisores verticales y horizontal arrastrables | Drag cambia proporción mínimo 20%-máximo 80% |
| SHELL-03 | Alta | Editor SPARQL colapsable con animación | Botón colapsa/expande; las vistas ganan/pierden espacio |
| SHELL-04 | Alta | Filtros activos visibles en navbar con botón × | Badge aparece al addFilter; desaparece al removeFilter |
| SHELL-05 | Alta | Sidenav de curado slide desde la derecha | Se abre al tener selectedNode; se cierra con × |
| SHELL-06 | Media | Responsive mínimo: funcional en 1280px+ | No requiere mobile |

## 11. Prompt para AI ejecutora

```
Sos un experto en Angular 17+ standalone components, Angular CDK y Angular Animations.

Lee primero (obligatorio):
- docs/00-architecture.md
- docs/01-tech-stack.md
- docs/02-data-contracts.md (§3: Filter)
- docs/04-conventions-and-glossary.md
- docs/modules/M00-app-shell.md (este archivo, completo)
- docs/modules/M07-selection-service.md (para suscribirte a activeFilters$ y selectedNode$)

Pre-requisito: M07 implementado.
Los componentes M01-M06 pueden ser stubs vacíos (<div>M02 placeholder</div>) — el shell
debe funcionar aunque las vistas internas estén vacías.

Archivos a modificar:
- frontend/src/app/app.ts
- frontend/src/app/app.html
- frontend/src/app/app.scss
- frontend/src/app/app.config.ts (agregar provideAnimations, provideHttpClient)

Archivos a crear:
- frontend/src/app/features/dashboard/dashboard.component.{ts,html,scss}
- frontend/src/app/features/dashboard/navbar/navbar.component.{ts,html}
- frontend/src/app/features/dashboard/filter-badges/filter-badges.component.{ts,html}

Comportamiento esperado:
1. La app arranca mostrando: navbar + editor SPARQL expandido + grid 2x2 con placeholders.
2. El divisor vertical (entre columna izq/der) es arrastrable.
3. El divisor horizontal (entre fila sup/inf) es arrastrable.
4. Click "Colapsar editor" → editor desaparece con animación, las vistas ganan altura.
5. Al llamar selectionService.addFilter(...) desde consola/test, aparece badge en navbar.
6. Click × en badge → removeFilter → badge desaparece.
7. Al llamar selectionService.select(node) desde consola/test → sidenav se abre desde la derecha.

Restricciones:
- NO implementes M01-M06 acá. Solo sus selectores como placeholders.
- NO modifiques shared/models ni M07.
- Standalone components. Sin NgModules.
- Usar Angular Animations para el colapso del editor.
- Mínimo 1280px de ancho. Sin media queries para mobile.

Definición de hecho:
- Criterios SHELL-01 a SHELL-06 verificados.
- ng build --configuration production sin errores.
- Demo: levantar con pnpm start, ver el grid 2x2, arrastrar un divisor, colapsar editor.
```
