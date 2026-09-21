export const DEMO_TOPIC_NAMES = [
  { explorerName: 'World War II battles', gisName: 'World War II battles (GIS)', panelName: 'WWII battles' },
  { explorerName: 'Earthquakes above magnitude 6', gisName: 'Earthquakes above magnitude 6 (GIS)', panelName: 'Earthquakes M>6' },
  { explorerName: 'Nobel Prize laureates', gisName: 'Nobel Prize laureates (GIS)', panelName: 'Nobel laureates' },
  { explorerName: 'Crewed spaceflights', gisName: 'Crewed spaceflights (GIS)', panelName: 'Crewed spaceflights' },
  { explorerName: 'Museums in Argentina', gisName: 'Museums in Argentina (GIS)', panelName: 'Argentine museums' },
] as const;

/** Nombres de dashboard escritos por la versión anterior del seed. */
export const LEGACY_SPANISH_DEMO_DASHBOARD_NAMES = [
  'Batallas de la Segunda Guerra Mundial',
  'Batallas de la Segunda Guerra Mundial (GIS)',
  'Terremotos de magnitud mayor a 6',
  'Terremotos de magnitud mayor a 6 (GIS)',
  'Premios Nobel',
  'Premios Nobel (GIS)',
  'Vuelos espaciales tripulados',
  'Vuelos espaciales tripulados (GIS)',
  'Museos de Argentina',
  'Museos de Argentina (GIS)',
] as const;

export function demoDashboardNamesToDelete(currentNames: readonly string[]): string[] {
  return [...new Set([...currentNames, ...LEGACY_SPANISH_DEMO_DASHBOARD_NAMES])];
}
