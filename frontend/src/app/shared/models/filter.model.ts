import type { Polygon } from 'geojson';

export type Filter = GeoFilter | TemporalFilter;

export interface GeoFilter {
  id: string;
  kind: 'geo';
  polygon: Polygon;
  label: string;
}

export interface TemporalFilter {
  id: string;
  kind: 'temporal';
  from: string;
  to: string;
  label: string;
}
