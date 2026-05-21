# M04 — Map View

## 1. Contexto

Vista geo-espacial. Todos los nodos con coordenadas válidas se muestran como marcadores en un mapa Leaflet. Permite además dibujar áreas para filtrar el resto de las vistas.

## 2. Alcance

**SÍ implementa:**
- Componente Angular standalone `MapViewComponent`.
- Mapa Leaflet con tres mapas base alternables.
- Marcadores con clustering automático.
- Popup hover con datos clave.
- Click en marcador → selección.
- Selección externa → `flyTo` animado + anillo pulsante.
- Dibujo de área (rectángulo/polígono) → emite filtro al SelectionService.
- Color de marcador consistente con M03 (misma `ENTITY_TYPE_COLORS`).

**NO implementa:**
- Layout del polígono o computación del filtro (la aplicación del filtro está en M07).

## 3. Requerimientos funcionales

| ID PDF | Prioridad | Descripción | Criterio de aceptación |
|---|---|---|---|
| MAP-01 | Alta | Marcadores para nodos con coordenadas | Cantidad de marcadores = cantidad de nodos con `coordinate` |
| MAP-02 | Alta | Clustering con `leaflet.markercluster` | Verificable: zoom alejado agrupa, zoom cercano expande |
| MAP-03 | Alta | Popup hover con datos clave | Hover muestra label, tipo, 2-3 atributos |
| MAP-04 | Alta | Click en marcador → `select(node, 'map')` | Test con spy |
| MAP-05 | Alta | FlyTo animado al recibir selección externa | `map.flyTo(coord, zoom, { duration: 1.0 })` |
| MAP-06 | Alta | Dibujo de polígono/rect → `addFilter(geoFilter)` | Polígono cerrado emite GeoFilter; sucesivos polígonos agregan más filtros |
| MAP-07 | Media | Cambio de mapa base (OSM / Positron / Dark) | Dropdown cambia tile layer |
| MAP-08 | Media | Color consistente con grafo (M03) | Importa `ENTITY_TYPE_COLORS` de M03 o lo refactoriza a `shared/` |

## 4. Dependencias

- **Lee de:** `filteredQueryResult$`, `selectedNode$`.
- **Emite a:** `select(node, 'map')`, `addFilter(geoFilter)`, `removeFilter(id)`.
- **Librerías:** `leaflet ^1.9`, `leaflet.markercluster ^1.5`, `leaflet-draw ^1.0`, `@turf/boolean-point-in-polygon` (también usado por M07).

## 5. Interfaces TypeScript

```ts
// frontend/src/app/features/map-view/map-view.component.ts
import { Component, OnInit, OnDestroy, ElementRef, ViewChild } from '@angular/core';
import * as L from 'leaflet';
import 'leaflet.markercluster';
import 'leaflet-draw';

export type BaseLayer = 'osm' | 'positron' | 'dark';

@Component({
  selector: 'app-map-view',
  standalone: true,
  templateUrl: './map-view.component.html',
})
export class MapViewComponent implements OnInit, OnDestroy {
  @ViewChild('mapContainer', { static: true }) container!: ElementRef<HTMLDivElement>;
  private map?: L.Map;
  private clusterGroup?: L.MarkerClusterGroup;
  private drawnItems?: L.FeatureGroup;
  currentBase: BaseLayer = 'osm';

  setBaseLayer(layer: BaseLayer): void { /* ... */ }
  private renderNodes(result: QueryResult): void { /* ... */ }
  private setupDrawControl(): void { /* ... */ }
}
```

### Tiles

```ts
const TILE_LAYERS: Record<BaseLayer, string> = {
  osm: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
  positron: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
  dark: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
};
```

### Marker con color por tipo

```ts
private createMarker(node: NormalizedNode): L.CircleMarker {
  const color = ENTITY_TYPE_COLORS[node.type ?? ''] ?? ENTITY_TYPE_COLORS.default;
  const marker = L.circleMarker(
    [node.coordinate!.lat, node.coordinate!.lng],
    { radius: 8, color, fillColor: color, fillOpacity: 0.8 }
  );
  marker.bindTooltip(this.popupHtml(node), { direction: 'top' });
  marker.on('click', () => this.selectionService.select(node, 'map'));
  return marker;
}
```

### Filtro por dibujo

```ts
this.map.on(L.Draw.Event.CREATED, (e: any) => {
  const layer = e.layer;
  this.drawnItems?.addLayer(layer);
  const geoJson = layer.toGeoJSON();
  const filter: GeoFilter = {
    id: crypto.randomUUID(),
    kind: 'geo',
    polygon: geoJson.geometry,
    label: `Área dibujada (${this.drawnItems?.getLayers().length})`,
  };
  this.selectionService.addFilter(filter);
});
```

## 6. Contrato HTTP

N/A.

## 7. Comportamiento esperado

### Render inicial
1. Crear `L.map(container, { center: [-34.6, -58.4], zoom: 5 })` (Argentina como vista inicial).
2. Aplicar tile layer default (OSM).
3. Inicializar `markerClusterGroup` y `drawnItems` (FeatureGroup).
4. Setup de `L.Control.Draw` con rectangle + polygon.

### Reactivo
- `filteredQueryResult$.subscribe(...)`: limpiar cluster, agregar marcadores nuevos.
- `selectedNode$.subscribe(...)`: si `source !== 'map'` y `sel.node?.coordinate`, `flyTo` + animación de anillo pulsante.

### Cambio de mapa base
Remover layer actual, agregar el nuevo. Mantener marcadores y dibujos.

### Animación de anillo pulsante
```scss
.pulse-ring {
  animation: pulse 1.2s ease-out infinite;
}
@keyframes pulse {
  0% { transform: scale(0.5); opacity: 1; }
  100% { transform: scale(2); opacity: 0; }
}
```
Implementar con un `L.divIcon` temporal sobre el marcador seleccionado.

## 8. Wireframe

```
┌─────────────────────────────────────────────────────┐
│ [Mapa ▼ OSM]  [Dibujar polígono] [Limpiar filtros]  │
├─────────────────────────────────────────────────────┤
│                                                     │
│                  ┌─────┐                            │
│                  │  47 │  (cluster)                 │
│                  └─────┘                            │
│                                                     │
│           ●        ●     ●  ←(marcadores)           │
│                  ●                                  │
│        ●                                            │
│                                                     │
└─────────────────────────────────────────────────────┘
```

## 9. Criterios de aceptación

- [ ] Mapa carga con OSM tiles.
- [ ] Marcadores para todos los nodos con coordenada.
- [ ] Clustering visible al alejar zoom.
- [ ] Hover muestra popup con info.
- [ ] Click en marcador → `select(_, 'map')`.
- [ ] Selección externa → flyTo + anillo pulsante.
- [ ] Dibujar polígono → filtro emitido al SelectionService → tabla/grafo/timeline filtran.
- [ ] Dropdown de mapas base funciona.
- [ ] Color coherente con M03.
- [ ] Cleanup en `OnDestroy` (`map.remove()`).

## 10. Prompt para AI ejecutora

```
Sos un experto en Angular 17 + Leaflet.

Lee primero:
- docs/00-architecture.md
- docs/01-tech-stack.md
- docs/02-data-contracts.md (§2, §3)
- docs/04-conventions-and-glossary.md
- docs/modules/M04-map-view.md (este archivo)
- docs/modules/M07-selection-service.md
- docs/modules/M03-graph-view.md (para reusar ENTITY_TYPE_COLORS; refactorizar a frontend/src/app/shared/entity-colors.ts si es necesario)

Pre-requisitos: M07 implementado.

Archivos a crear:
- frontend/src/app/features/map-view/map-view.component.{ts,html,scss}
- frontend/src/app/shared/entity-colors.ts (mover acá si todavía está en M03)
- frontend/src/app/features/map-view/map-view.component.spec.ts

Restricciones:
- NO modifiques M07 ni 02-data-contracts.md.
- leaflet types: instalar `@types/leaflet` y `@types/leaflet-draw`.
- Cleanup correcto en OnDestroy.

Definición de hecho:
- Criterios §9 verificados.
- Demo: ejecutar query "Ciudades de Argentina", ver marcadores agrupados, hacer zoom, dibujar polígono sobre CABA, verificar que tabla y grafo filtran.
```
