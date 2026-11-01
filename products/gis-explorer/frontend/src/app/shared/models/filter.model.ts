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
  /** YYYY-MM-DD bounds mean inclusive calendar days in the RDF value's own
   * zone. Timestamps retain instant precision (legacy/visual-range filters). */
  from: string;
  to: string;
  label: string;
}
