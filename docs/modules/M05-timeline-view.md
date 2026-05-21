# M05 — Timeline View

## 1. Contexto

Vista temporal. Cada nodo con al menos un `TemporalEvent` aparece como ítem en una timeline `vis-timeline`. Caso de uso clave: ver la evolución de precios de un inmueble en el tiempo (gráfico de línea superpuesto cuando el nodo seleccionado tiene historial).

## 2. Alcance

**SÍ implementa:**
- Componente Angular standalone `TimelineViewComponent`.
- vis-timeline con zoom (año/mes/semana/día).
- Agrupación por tipo de entidad.
- Click en ítem → selección.
- Selección externa → scroll y resalte.
- Filtro por rango temporal (drag sobre la timeline).
- Gráfico de evolución de precio para el nodo seleccionado (Chart.js superpuesto).

**NO implementa:**
- Cálculo del precio histórico (lo trae el `NormalizedNode.temporalEvents[].numericValue`).

## 3. Requerimientos funcionales

| ID PDF | Prioridad | Descripción | Criterio de aceptación |
|---|---|---|---|
| TIME-01 | Alta | Un ítem por nodo con fecha | Verificable contando items vs nodos con `temporalEvents` |
| TIME-02 | Alta | Zoom entre año/mes/semana/día con rueda | Built-in de vis-timeline |
| TIME-03 | Alta | Click en ítem → `select(node, 'timeline')` | Test con spy |
| TIME-04 | Alta | Scroll animado al recibir selección externa | `timeline.moveTo(date, { animation: true })` |
| TIME-05 | Alta | Gráfico de evolución de precio para nodo seleccionado | Si el nodo tiene >1 `TemporalEvent` con `numericValue`, dibujar línea con Chart.js |
| TIME-06 | Alta | Filtrado por rango temporal (drag) | Drag emite `TemporalFilter`; suma a filtros geo si existen |
| TIME-07 | Media | Agrupación por tipo de entidad | vis-timeline groups con `type` como discriminador |

## 4. Dependencias

- **Lee de:** `filteredQueryResult$`, `selectedNode$`.
- **Emite a:** `select(node, 'timeline')`, `addFilter(temporalFilter)`.
- **Librerías:** `vis-timeline ^7.7`, `chart.js ^4.4`.

## 5. Interfaces TypeScript

```ts
// frontend/src/app/features/timeline-view/timeline-view.component.ts
import { Component, OnInit, OnDestroy, ElementRef, ViewChild } from '@angular/core';
import { Timeline, DataSet, TimelineOptions, DataItem, DataGroup } from 'vis-timeline/standalone';
import { Chart } from 'chart.js/auto';

@Component({
  selector: 'app-timeline-view',
  standalone: true,
  templateUrl: './timeline-view.component.html',
})
export class TimelineViewComponent implements OnInit, OnDestroy {
  @ViewChild('tlContainer', { static: true }) tlContainer!: ElementRef<HTMLDivElement>;
  @ViewChild('chartCanvas', { static: true }) chartCanvas!: ElementRef<HTMLCanvasElement>;

  private timeline?: Timeline;
  private chart?: Chart;
  private items = new DataSet<DataItem>();
  private groups = new DataSet<DataGroup>();

  private renderItems(result: QueryResult): void { /* ... */ }
  private renderPriceChart(node: NormalizedNode): void { /* ... */ }
  private destroyChart(): void { /* ... */ }
}
```

### Render de items

```ts
private renderItems(result: QueryResult): void {
  this.items.clear();
  this.groups.clear();

  const typeGroups = new Map<string, DataGroup>();
  for (const node of result.nodes) {
    if (!node.temporalEvents?.length) continue;
    const type = node.type ?? 'unknown';
    if (!typeGroups.has(type)) {
      typeGroups.set(type, { id: type, content: type });
    }
    const mostRecent = node.temporalEvents.reduce((a, b) => a.isoDate > b.isoDate ? a : b);
    this.items.add({
      id: node.uri,
      group: type,
      start: new Date(mostRecent.isoDate),
      content: node.label,
    });
  }
  this.groups.add(Array.from(typeGroups.values()));
}
```

### Filtro por rango

```ts
this.timeline?.on('rangechanged', (props: any) => {
  if (this.userIsDragging) {
    const filter: TemporalFilter = {
      id: 'timeline-range',
      kind: 'temporal',
      from: props.start.toISOString(),
      to: props.end.toISOString(),
      label: `${props.start.toLocaleDateString()} – ${props.end.toLocaleDateString()}`,
    };
    this.selectionService.addFilter(filter);
  }
});
```

Decisión: el filtro se setea cuando el usuario explícitamente hace "Aplicar rango" (botón) — no en cada `rangechanged` para evitar spam de eventos. El `rangechanged` solo registra el rango candidato.

### Gráfico de evolución

```ts
private renderPriceChart(node: NormalizedNode): void {
  this.destroyChart();
  const priced = node.temporalEvents?.filter(ev => ev.numericValue != null);
  if (!priced || priced.length < 2) return;

  const sorted = [...priced].sort((a, b) => a.isoDate.localeCompare(b.isoDate));
  this.chart = new Chart(this.chartCanvas.nativeElement, {
    type: 'line',
    data: {
      labels: sorted.map(e => e.isoDate.slice(0, 10)),
      datasets: [{ label: `${node.label} — evolución`, data: sorted.map(e => e.numericValue!) }],
    },
    options: { responsive: true, maintainAspectRatio: false },
  });
}
```

## 6. Contrato HTTP

N/A.

## 7. Comportamiento esperado

- Al recibir `filteredQueryResult$`: re-render items y groups.
- Al recibir `selectedNode$` con `source !== 'timeline'`: scroll al item + render chart si aplica.
- Al hacer drag de rango y click "Aplicar": addFilter.
- Cleanup en OnDestroy: `timeline?.destroy()`, `chart?.destroy()`.

## 8. Wireframe

```
┌────────────────────────────────────────────────────────────────┐
│ [Aplicar rango]  Zoom: año mes semana día                      │
├────────────────────────────────────────────────────────────────┤
│ city      │   ●         ●        ●                             │
│ museum    │     ●  ●         ●           ●                     │
│ writer    │ ●        ●         ●            ●    ●             │
├────────────────────────────────────────────────────────────────┤
│ 1900    1920    1940    1960    1980    2000    2020           │
├────────────────────────────────────────────────────────────────┤
│ ▼ Evolución del nodo seleccionado (si aplica)                  │
│      ╱╲                                                        │
│     ╱  ╲___╱╲                                                  │
│    ╱       ╲                                                   │
└────────────────────────────────────────────────────────────────┘
```

## 9. Criterios de aceptación

- [ ] Timeline renderiza con items agrupados por tipo.
- [ ] Zoom funciona con rueda.
- [ ] Click en item → `select(_, 'timeline')`.
- [ ] Selección externa → scroll animado.
- [ ] Drag + "Aplicar rango" → filtro emitido.
- [ ] Gráfico aparece para nodos con ≥2 eventos con `numericValue`.
- [ ] Cleanup en OnDestroy.

## 10. Prompt para AI ejecutora

```
Sos un experto en Angular 17 + vis-timeline + Chart.js.

Lee primero:
- docs/00-architecture.md
- docs/01-tech-stack.md
- docs/02-data-contracts.md (§2, §3)
- docs/04-conventions-and-glossary.md
- docs/modules/M05-timeline-view.md (este archivo)
- docs/modules/M07-selection-service.md

Pre-requisitos: M07 implementado.

Archivos a crear:
- frontend/src/app/features/timeline-view/timeline-view.component.{ts,html,scss}
- frontend/src/app/features/timeline-view/timeline-view.component.spec.ts

Restricciones:
- NO modifiques M07 ni 02-data-contracts.md.
- vis-timeline: usar import 'vis-timeline/standalone' para evitar problemas SSR.
- Cleanup en OnDestroy.

Definición de hecho:
- Criterios §9 verificados.
- Demo: query "Museos por año de fundación" + ver items en timeline; "Presidentes argentinos" → ver agrupación por tipo.
```
