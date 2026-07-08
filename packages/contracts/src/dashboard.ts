// Contrato de /api/dashboards (dashboards GIS y workspaces del Explorer).

export type DashboardKind = 'gis' | 'explorer';

export interface Dashboard {
  id: string;
  kind: DashboardKind;
  name: string;
  payload: object;
  createdAt: string;
  updatedAt: string;
}
