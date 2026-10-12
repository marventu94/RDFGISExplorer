import { Injectable, signal } from '@angular/core';

export interface MapViewState {
  center: [number, number];
  zoom: number;
  activeLayers?: string[];
}

export interface TimelineViewState {
  rangeStart?: string;
  rangeEnd?: string;
}

export interface GraphViewState {
  layout: string;
  /** Cámara del grafo, para que el zoom/pan sobreviva a un remonte del slot. */
  pan?: { x: number; y: number };
  zoom?: number;
  /**
   * Posiciones de los nodos que el usuario acomodó a mano, por URI. Solo esos:
   * el resto lo sigue ubicando el layout.
   */
  manualPositions?: Record<string, { x: number; y: number }>;
  detailLevel?: 'summary' | 'exploration' | 'detail';
  expandedSuperEdgeIds?: string[];
  expandedMotifIds?: string[];
}

export interface TableViewState {
  quickFilter?: string;
  pageSize?: number;
}

@Injectable({ providedIn: 'root' })
export class DashboardViewStateService {
  readonly mapState = signal<MapViewState | null>(null);
  readonly mapViewportFit = signal(0);
  readonly timelineState = signal<TimelineViewState | null>(null);
  /**
   * Ventana que un tablero hidratado pidió mostrar. La línea de tiempo puede
   * existir antes de la hidratación, así que la aplica en el primer render con
   * datos en lugar de encuadrarlos, y la consume.
   */
  readonly pendingTimelineWindow = signal<TimelineViewState | null>(null);
  readonly graphState = signal<GraphViewState | null>(null);
  readonly graphLayoutReset = signal<{ revision: number; layout: string }>({
    revision: 0,
    layout: 'dagre',
  });
  readonly tableState = signal<TableViewState | null>(null);

  resetGraphLayout(layout: string): void {
    this.graphState.set({ layout });
    this.graphLayoutReset.update((request) => ({
      revision: request.revision + 1,
      layout,
    }));
  }

  restoreTimelineWindow(state: TimelineViewState): void {
    this.timelineState.set(state);
    this.pendingTimelineWindow.set(state.rangeStart && state.rangeEnd ? state : null);
  }

  requestMapViewportFit(): void {
    this.mapState.set(null);
    this.mapViewportFit.update((revision) => revision + 1);
  }
}
