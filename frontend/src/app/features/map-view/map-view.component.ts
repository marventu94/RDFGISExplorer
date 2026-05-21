import {
  Component,
  OnInit,
  OnDestroy,
  ElementRef,
  ViewChild,
  HostListener,
  NgZone,
  ChangeDetectorRef,
  inject,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { SelectionService } from '@core/services/selection.service';
import { combineLatest, filter, Subject, takeUntil } from 'rxjs';
import * as L from 'leaflet';
import 'leaflet.markercluster';
import 'leaflet-draw';
import type {
  QueryResult,
  NormalizedNode,
  Selection,
  Filter,
  GeoFilter,
} from '@shared/models';
import { colorForType } from '../../shared/entity-colors';
import { TILE_LAYERS, BaseLayer } from './tile-layers';

type QueryState = 'no-query' | 'no-coords' | 'filtered-zero' | 'normal';

@Component({
  selector: 'app-map-view',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './map-view.component.html',
  styleUrl: './map-view.component.scss',
})
export class MapViewComponent implements OnInit, OnDestroy {
  @ViewChild('mapContainer', { static: true }) container!: ElementRef<HTMLDivElement>;

  private map?: L.Map;
  private clusterGroup?: L.MarkerClusterGroup;
  private drawnItems?: L.FeatureGroup;
  private tileLayer?: L.TileLayer;
  protected baseLayer: BaseLayer = 'osm';
  private destroy$ = new Subject<void>();
  private resizeObserver?: ResizeObserver;

  queryState: QueryState = 'no-query';
  originalNodeCount = 0;
  filteredNodeCount = 0;
  activeFilterCount = 0;

  readonly baseLayerOptions = [
    { value: 'osm' as const, label: 'OSM' },
    { value: 'positron' as const, label: 'Positron' },
    { value: 'dark' as const, label: 'Dark' },
  ];

  private readonly selectionService = inject(SelectionService);
  private readonly ngZone = inject(NgZone);
  private readonly cdr = inject(ChangeDetectorRef);

  ngOnInit(): void {
    setTimeout(() => this.initMap(), 0);
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

    this.tileLayer = L.tileLayer(TILE_LAYERS[this.baseLayer].url, {
      attribution: TILE_LAYERS[this.baseLayer].attribution,
    }).addTo(this.map);

    this.clusterGroup = L.markerClusterGroup();
    this.map.addLayer(this.clusterGroup);

    this.drawnItems = L.featureGroup();
    this.map!.addLayer(this.drawnItems);

    this.setupDrawControl();
    this.setupSubscriptions();
    this.initResizeObserver();
  }

  changeBaseLayer(layer: BaseLayer): void {
    if (this.baseLayer === layer || !this.map || !this.tileLayer) return;

    this.map.removeLayer(this.tileLayer);
    this.baseLayer = layer;
    this.tileLayer = L.tileLayer(TILE_LAYERS[layer].url, {
      attribution: TILE_LAYERS[layer].attribution,
    }).addTo(this.map);
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

  private setupDrawControl(): void {
    if (!this.map || !this.drawnItems) return;

    const drawControl = new L.Control.Draw({
      position: 'topright',
      draw: {
        rectangle: { shapeOptions: {} },
        polygon: { shapeOptions: {} },
        marker: false,
        circle: false,
        polyline: false,
        circlemarker: false,
      },
      edit: {
        featureGroup: this.drawnItems!,
        edit: false,
        remove: false,
      },
    } as L.Control.DrawConstructorOptions);
    this.map!.addControl(drawControl);

    this.map!.on(L.Draw.Event.CREATED, (e: L.LeafletEvent) => {
      const layer = e.layer;
      this.drawnItems!.addLayer(layer);
      const geoJson = layer.toGeoJSON() as GeoJSON.Feature;
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
          this.queryState =
            activeFilters.length > 0 ? 'filtered-zero' : 'no-query';
          this.clearMarkers();
          this.syncDrawnItems(activeFilters);
          this.cdr.markForCheck();
          return;
        }

        this.queryState = 'normal';
        this.renderMarkers(filtered);
        this.syncDrawnItems(activeFilters);
        this.cdr.markForCheck();
      });

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
      const layerFilterId = (layer as unknown as Record<string, unknown>)[
        '_filterId'
      ] as string | undefined;
      if (layerFilterId && !geoFilterIds.has(layerFilterId)) {
        this.drawnItems!.removeLayer(layer);
      }
    });
  }

  private flyToNode(node: NormalizedNode): void {
    if (!this.map || !node.coordinate) return;

    this.map.flyTo([node.coordinate.lat, node.coordinate.lng], 14, {
      duration: 1.0,
    });

    this.clusterGroup?.eachLayer((layer: L.Layer) => {
      const m = layer as L.CircleMarker & {
        _node?: NormalizedNode;
      };
      if (m._node?.uri === node.uri) {
        const latlng = m.getLatLng();
        this.clusterGroup?.zoomToShowLayer(layer, () => {
          this.addPulseRing(latlng);
        });
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
