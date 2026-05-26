export interface Dashboard {
  id: string;
  kind: 'gis' | 'explorer';
  name: string;
  payload: object;
  createdAt: string;
  updatedAt: string;
}
