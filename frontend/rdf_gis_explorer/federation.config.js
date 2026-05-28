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
    '@softarc/native-federation-runtime',
    '@softarc/native-federation',
    '@softarc/native-federation-node',
    // CJS/UMD packages that don't work as federation shared chunks
    'sparqljs',
    'leaflet',
    'leaflet-control-geocoder',
    'leaflet-draw',
    'leaflet.markercluster',
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
