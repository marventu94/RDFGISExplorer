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
}

export interface TableViewState {
  quickFilter?: string;
  pageSize?: number;
}

@Injectable({ providedIn: 'root' })
export class DashboardViewStateService {
  readonly mapState = signal<MapViewState | null>(null);
  readonly timelineState = signal<TimelineViewState | null>(null);
  readonly graphState = signal<GraphViewState | null>(null);
  readonly tableState = signal<TableViewState | null>(null);
}
