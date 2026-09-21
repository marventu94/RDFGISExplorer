import {
  DEMO_TOPIC_NAMES,
  LEGACY_SPANISH_DEMO_DASHBOARD_NAMES,
  demoDashboardNamesToDelete,
} from './seed-demo-dashboard-names';

describe('Wikidata demo dashboard names', () => {
  it('keeps dashboard and panel names exclusively in English', () => {
    expect(DEMO_TOPIC_NAMES).toEqual([
      { explorerName: 'World War II battles', gisName: 'World War II battles (GIS)', panelName: 'WWII battles' },
      { explorerName: 'Earthquakes above magnitude 6', gisName: 'Earthquakes above magnitude 6 (GIS)', panelName: 'Earthquakes M>6' },
      { explorerName: 'Nobel Prize laureates', gisName: 'Nobel Prize laureates (GIS)', panelName: 'Nobel laureates' },
      { explorerName: 'Crewed spaceflights', gisName: 'Crewed spaceflights (GIS)', panelName: 'Crewed spaceflights' },
      { explorerName: 'Museums in Argentina', gisName: 'Museums in Argentina (GIS)', panelName: 'Argentine museums' },
    ]);
  });

  it('deletes both current dashboard names and exactly the ten legacy Spanish names', () => {
    const currentNames = DEMO_TOPIC_NAMES.flatMap(({ explorerName, gisName }) => [explorerName, gisName]);
    const names = demoDashboardNamesToDelete(currentNames);

    expect(LEGACY_SPANISH_DEMO_DASHBOARD_NAMES).toHaveLength(10);
    expect(names).toEqual([...currentNames, ...LEGACY_SPANISH_DEMO_DASHBOARD_NAMES]);
  });
});
