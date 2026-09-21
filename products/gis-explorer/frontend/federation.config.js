const { withNativeFederation, shareAll } = require('@angular-architects/native-federation/config');

module.exports = withNativeFederation({
  name: 'rdf_gis_explorer',

  exposes: {
    './Component': './src/app/app.ts',
  },

  shared: {
    ...shareAll({ singleton: true, strictVersion: true, requiredVersion: 'auto' }),
  },

  skip: [
    'rxjs/ajax',
    'rxjs/fetch',
    'rxjs/testing',
    'rxjs/webSocket',
    '@kurkle/color',
    'webcola',
    'geojson',
    '@turf/invariant',
    'point-in-polygon-hao',
    'rdf-data-factory',
    '@codemirror/lint',
    '@codemirror/autocomplete',
    '@codemirror/search',
    '@codemirror/commands',
    'crelt',
    'w3c-keyname',
    'style-mod',
    '@marijn/find-cluster-break',
    '@lezer/highlight',
    '@lezer/common',
    // Contrato del handoff (packages/platform-bridge): tiene codigo de runtime.
    // Se bundlea dentro de cada remote en vez de compartirse: son ~40 lineas y el
    // host no lo tiene en sus deps, asi que con shareAll+ignoreUnusedDeps el host
    // omitiria el chunk del import-map y el remote no resolveria el specifier
    // (mismo problema que ag-grid). Ademas el acoplamiento es via sessionStorage y
    // window, no via instancia compartida: no hace falta que sea singleton.
    '@rdfgis/platform-bridge',
    '@softarc/native-federation-runtime',
    '@softarc/native-federation',
    '@softarc/native-federation-node',
    // CJS/UMD packages that don't work as federation shared chunks
    'sparqljs',
    'leaflet',
    'leaflet-control-geocoder',
    'leaflet-draw',
    'leaflet.markercluster',
    'exceljs',
    // AG Grid es privativo de este remote: no compartir via federation.
    // Si se comparte con shareAll+singleton, el host (que no lo tiene en sus deps)
    // omite el @nf-internal/chunk-* en su import-map (ignoreUnusedDeps) y el
    // remote no resuelve el specifier al cargar el componente.
    'ag-grid-community',
    'ag-grid-angular',
    '@ag-grid-community/core',
    '@ag-grid-community/client-side-row-model',
    '@ag-grid-community/styles',
  ],

  // Please read our FAQ about sharing libs:
  // https://shorturl.at/jmzH0

  features: {
    // New feature for more performance and avoiding
    // issues with node libs. Comment this out to
    // get the traditional behavior:
    ignoreUnusedDeps: true,
  },
});
