import {
  Component,
  OnInit,
  OnDestroy,
  ElementRef,
  ViewChild,
  HostListener,
  HostBinding,
  NgZone,
  ChangeDetectorRef,
  inject,
} from '@angular/core';
import { SelectionService } from '@core/services/selection.service';
import { DashboardViewStateService } from '@core/services/dashboard-view-state.service';
import { combineLatest, debounceTime, filter, Subject, takeUntil } from 'rxjs';
import './leaflet-global'; // setea window.L ANTES que los plugins — ver leaflet-global.ts
import * as L from 'leaflet';
import 'leaflet.markercluster';
import 'leaflet-draw';
import * as GeocoderControl from 'leaflet-control-geocoder';
import type { QueryResult, NormalizedNode, Selection, Filter, GeoFilter } from '@shared/models';
import { colorForType } from '../../shared/entity-colors';
import { TILE_LAYERS } from './tile-layers';

type QueryState = 'no-query' | 'no-coords' | 'filtered-zero' | 'normal';

@Component({
  selector: 'app-map-view',
  standalone: true,
  imports: [],
  templateUrl: './map-view.component.html',
  styleUrl: './map-view.component.scss',
})
export class MapViewComponent implements OnInit, OnDestroy {
  @ViewChild('mapContainer', { static: true }) container!: ElementRef<HTMLDivElement>;

  private map?: L.Map;
  private clusterGroup?: L.MarkerClusterGroup;
  private drawnItems?: L.FeatureGroup;
  private tileLayer?: L.TileLayer;
  private destroy$ = new Subject<void>();
  private resizeObserver?: ResizeObserver;

  queryState: QueryState = 'no-query';
  originalNodeCount = 0;
  filteredNodeCount = 0;
  activeFilterCount = 0;

  @HostBinding('class.is-active-view') isActiveView = false;

  private currentNodes: NormalizedNode[] = [];
  private suppressViewportEmit = false;
  private readonly viewportChange$ = new Subject<void>();

  private readonly selectionService = inject(SelectionService);
  private readonly viewState = inject(DashboardViewStateService);
  private readonly ngZone = inject(NgZone);
  private readonly cdr = inject(ChangeDetectorRef);

  ngOnInit(): void {
    requestAnimationFrame(() => requestAnimationFrame(() => this.initMap()));
  }

  private initMap(): void {
    delete (L.Icon.Default.prototype as unknown as Record<string, unknown>)['_getIconUrl'];
    L.Icon.Default.mergeOptions({
      iconRetinaUrl: 'assets/leaflet/marker-icon-2x.png',
      iconUrl: 'assets/leaflet/marker-icon.png',
      shadowUrl: 'assets/leaflet/marker-shadow.png',
    });

    this.map = L.map(this.container.nativeElement, {
      center: [-34.6, -58.4],
      zoom: 5,
    });

    this.tileLayer = L.tileLayer(TILE_LAYERS['osm'].url, {
      attribution: TILE_LAYERS['osm'].attribution,
    }).addTo(this.map);

    // markerClusterGroup falla en native federation cuando L global no coincide
    // con el módulo bundleado. Fallback a layerGroup para que el mapa siempre funcione.
    try {
      this.clusterGroup = L.markerClusterGroup();
    } catch {
      this.clusterGroup = L.layerGroup() as unknown as L.MarkerClusterGroup;
    }
    this.map.addLayer(this.clusterGroup);

    this.drawnItems = L.featureGroup();
    this.map!.addLayer(this.drawnItems);

    // Los event listeners y setupSubscriptions DEBEN registrarse siempre.
    // setupDrawControl/setupGeocoder pueden fallar si leaflet-draw/geocoder no augmentaron
    // la instancia correcta de L en native federation — se envuelven en try-catch para
    // que su fallo no corte el resto de la inicialización.
    this.setupSubscriptions();

    this.map.on('moveend zoomend', () => {
      if (this.suppressViewportEmit) return;
      const center = this.map!.getCenter();
      this.viewState.mapState.set({
        center: [center.lat, center.lng],
        zoom: this.map!.getZoom(),
      });
      this.ngZone.run(() => this.viewportChange$.next());
    });

    this.map.on('mousedown wheel touchstart movestart zoomstart drag move zoom', () => {
      if (this.suppressViewportEmit) return;
      this.selectionService.markActiveView('map');
    });

    try { this.setupDrawControl(); } catch { /* leaflet-draw no disponible en este contexto */ }
    try { this.setupGeocoder(); } catch { /* geocoder no disponible en este contexto */ }
    this.initResizeObserver();

    // Restore stored view state
    const storedMapState = this.viewState.mapState();
    if (storedMapState) {
      this.map.setView(storedMapState.center, storedMapState.zoom);
    }

    this.map.whenReady(() => {
      setTimeout(() => this.map?.invalidateSize(), 50);
    });
  }

  scrollToEditor(): void {
    const editor = document.querySelector('.editor-area');
    if (editor) {
      editor.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } else {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }

  @HostListener('window:resize')
  onResize(): void {
    this.map?.invalidateSize();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    this.resizeObserver?.disconnect();
    this.map?.remove();
  }

  private setupGeocoder(): void {
    if (!this.map) return;
    GeocoderControl.geocoder({
      defaultMarkGeocode: false,
      placeholder: 'Buscar ciudad, calle…',
      errorMessage: 'No se encontraron resultados',
      geocoder: GeocoderControl.geocoders.nominatim(),
    })
      .on('markgeocode', (e: { geocode: { center: L.LatLng; bbox: L.LatLngBounds } }) => {
        this.map!.fitBounds(e.geocode.bbox, { maxZoom: 14 });
      })
      .addTo(this.map);
  }

  private setupDrawControl(): void {
    if (!this.map || !this.drawnItems) return;

    // leaflet-draw augmenta window.L (variable global libre), no el módulo L.
    // Resolvemos Draw desde ambos lados para cubrir ambos casos.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const anyL = L as any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const winL = (window as any).L;
    const DrawControl: new (opts: unknown) => L.Control =
      anyL.Control?.Draw ?? winL?.Control?.Draw;
    if (typeof DrawControl !== 'function') return;

    const drawControl = new DrawControl({
      position: 'topright',
      draw: {
        rectangle: false,
        polygon: { shapeOptions: {} },
        marker: false,
        circle: false,
        polyline: false,
        circlemarker: false,
      },
      edit: {
        featureGroup: this.drawnItems,
        edit: false,
        remove: false,
      },
    });
    this.map.addControl(drawControl);

    // 'draw:created' es el valor literal de L.Draw.Event.CREATED.
    // Usamos el string directamente para evitar TypeError si L.Draw es undefined.
    this.map.on('draw:created', (e: L.LeafletEvent) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const layer = (e as any).layer as L.Layer & { toGeoJSON(): GeoJSON.Feature };
      this.drawnItems!.addLayer(layer);
      const geoJson = layer.toGeoJSON();
      const filterId = crypto.randomUUID();
      const filter: GeoFilter = {
        id: filterId,
        kind: 'geo',
        polygon: geoJson.geometry as GeoJSON.Polygon,
        label: `Área dibujada ${this.drawnItems!.getLayers().length}`,
      };
      (layer as unknown as Record<string, unknown>)['_filterId'] = filterId;
      this.ngZone.run(() => {
        this.selectionService.addFilter(filter);
      });
    });
  }

  private setupSubscriptions(): void {
    combineLatest([
      this.selectionService.queryResult$,
      this.selectionService.filteredQueryResult$,
      this.selectionService.activeFilters$,
    ])
      .pipe(takeUntil(this.destroy$))
      .subscribe(([original, filtered, activeFilters]) => {
        this.activeFilterCount = activeFilters.length;

        if (!original || original.nodes.length === 0) {
          this.queryState = 'no-query';
          this.clearMarkers();
          this.cdr.markForCheck();
          return;
        }

        this.originalNodeCount = original.nodes.length;
        this.filteredNodeCount = filtered?.nodes.length ?? 0;

        const originalHasCoords = original.nodes.some((n) => n.coordinate);

        if (!originalHasCoords) {
          this.queryState = 'no-coords';
          this.clearMarkers();
          this.cdr.markForCheck();
          return;
        }

        if (!filtered || filtered.nodes.length === 0) {
          this.queryState = activeFilters.length > 0 ? 'filtered-zero' : 'no-query';
          this.clearMarkers();
          this.syncDrawnItems(activeFilters);
          this.cdr.markForCheck();
          return;
        }

        this.queryState = 'normal';
        this.currentNodes = filtered.nodes;
        this.renderMarkers(filtered);
        this.syncDrawnItems(activeFilters);
        this.cdr.markForCheck();
      });

    this.viewportChange$
      .pipe(takeUntil(this.destroy$), debounceTime(500))
      .subscribe(() => this.emitFocusFromViewport());

    this.selectionService.activeView$.pipe(takeUntil(this.destroy$)).subscribe((v) => {
      this.isActiveView = v === 'map';
      this.cdr.markForCheck();
    });

    this.selectionService.focus$
      .pipe(
        takeUntil(this.destroy$),
        filter(
          (f) =>
            f.source !== null &&
            f.source !== 'map' &&
            f.uris.size > 0 &&
            this.selectionService.getActiveView() !== 'map',
        ),
      )
      .subscribe((f) => this.applyExternalFocus(f.uris));

    this.selectionService.selectedNode$
      .pipe(
        takeUntil(this.destroy$),
        filter((sel: Selection) => sel.source !== 'map'),
      )
      .subscribe((sel: Selection) => {
        if (sel.node?.coordinate) {
          this.flyToNode(sel.node);
        }
      });
  }

  private renderMarkers(result: QueryResult): void {
    this.clusterGroup?.clearLayers();

    for (const node of result.nodes) {
      if (!node.coordinate) continue;

      const color = colorForType(node.type);
      const marker = L.circleMarker([node.coordinate.lat, node.coordinate.lng], {
        radius: 8,
        color,
        fillColor: color,
        fillOpacity: 0.8,
        weight: 2,
      });

      (marker as unknown as Record<string, unknown>)['_node'] = node;
      marker.bindTooltip(this.popupHtml(node), { direction: 'top' });
      marker.on('click', () => {
        this.ngZone.run(() => {
          this.selectionService.select(node, 'map');
        });
      });

      this.clusterGroup?.addLayer(marker);
    }
  }

  private popupHtml(node: NormalizedNode): string {
    let html = `<strong>${this.escapeHtml(node.label)}</strong>`;

    if (node.type) {
      html += `<br><span class="tooltip-label">Tipo:</span> ${this.escapeHtml(node.type)}`;
    }

    const attrKeys = Object.keys(node.attributes).slice(0, 3);
    for (const key of attrKeys) {
      const attr = node.attributes[key];
      if (attr && attr.type === 'literal') {
        html += `<br><span class="tooltip-label">${this.escapeHtml(key)}:</span> ${this.escapeHtml(String(attr.value))}`;
      }
    }

    if (node.coordinate) {
      html += `<br><span class="tooltip-label">Coords:</span> ${node.coordinate.lat.toFixed(4)}, ${node.coordinate.lng.toFixed(4)}`;
    }

    return html;
  }

  private escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  private clearMarkers(): void {
    this.clusterGroup?.clearLayers();
  }

  private syncDrawnItems(filters: Filter[]): void {
    if (!this.drawnItems) return;

    const geoFilterIds = new Set(
      filters.filter((f): f is GeoFilter => f.kind === 'geo').map((f) => f.id),
    );

    this.drawnItems.eachLayer((layer) => {
      const layerFilterId = (layer as unknown as Record<string, unknown>)['_filterId'] as
        | string
        | undefined;
      if (layerFilterId && !geoFilterIds.has(layerFilterId)) {
        this.drawnItems!.removeLayer(layer);
      }
    });
  }

  private emitFocusFromViewport(): void {
    if (!this.map || this.currentNodes.length === 0) return;
    const bounds = this.map.getBounds();
    const uris: string[] = [];
    for (const node of this.currentNodes) {
      if (!node.coordinate) continue;
      if (bounds.contains([node.coordinate.lat, node.coordinate.lng])) {
        uris.push(node.uri);
      }
    }
    if (uris.length === 0) return;
    this.selectionService.markActiveView('map');
    this.selectionService.setFocus(uris, 'map');
  }

  private applyExternalFocus(uris: ReadonlySet<string>): void {
    if (!this.map) return;
    const points: L.LatLngTuple[] = [];
    for (const node of this.currentNodes) {
      if (!node.coordinate) continue;
      if (uris.has(node.uri)) {
        points.push([node.coordinate.lat, node.coordinate.lng]);
      }
    }
    if (points.length === 0) return;
    const bounds = L.latLngBounds(points);
    this.suppressViewportEmit = true;
    this.map.flyToBounds(bounds, { padding: [40, 40], duration: 0.8, maxZoom: 14 });
    setTimeout(() => {
      this.suppressViewportEmit = false;
    }, 1000);
  }

  private flyToNode(node: NormalizedNode): void {
    if (!this.map || !node.coordinate) return;

    const latlng: L.LatLngTuple = [node.coordinate.lat, node.coordinate.lng];
    if (!this.map.getBounds().contains(latlng)) {
      this.map.flyTo(latlng, 14, {
        duration: 1.0,
      });
    }

    this.clusterGroup?.eachLayer((layer: L.Layer) => {
      const m = layer as L.CircleMarker & { _node?: NormalizedNode };
      if (m._node?.uri === node.uri) {
        const latlng = m.getLatLng();
        // zoomToShowLayer solo existe en MarkerClusterGroup, no en el fallback LayerGroup
        const cluster = this.clusterGroup as L.MarkerClusterGroup & { zoomToShowLayer?: Function };
        if (typeof cluster?.zoomToShowLayer === 'function') {
          cluster.zoomToShowLayer(layer, () => this.addPulseRing(latlng));
        } else {
          this.addPulseRing(latlng);
        }
      }
    });
  }

  private addPulseRing(latlng: L.LatLng): void {
    if (!this.map) return;

    const pulseIcon = L.divIcon({
      className: 'pulse-ring',
      iconSize: [20, 20],
      iconAnchor: [10, 10],
    });
    const pulseMarker = L.marker(latlng, {
      icon: pulseIcon,
      interactive: false,
    });
    this.map.addLayer(pulseMarker);

    setTimeout(() => {
      this.map?.removeLayer(pulseMarker);
    }, 2400);
  }

  private initResizeObserver(): void {
    if (typeof ResizeObserver === 'undefined') return;
    this.resizeObserver = new ResizeObserver(() => {
      this.map?.invalidateSize();
    });
    const el = this.container?.nativeElement;
    if (el) {
      this.resizeObserver.observe(el);
    }
  }
}
