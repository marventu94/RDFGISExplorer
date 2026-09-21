const { withNativeFederation, shareAll } = require('@angular-architects/native-federation/config');

module.exports = withNativeFederation({
  name: 'rdf_explorer',

  exposes: {
    './Component': './src/app/pages/main/main.component.ts',
  },

  shared: {
    ...shareAll({ singleton: true, strictVersion: true, requiredVersion: 'auto' }),
  },

  skip: [
    'rxjs/ajax',
    'rxjs/fetch',
    'rxjs/testing',
    'rxjs/webSocket',
    '@lezer/highlight',
    'style-mod',
    '@lezer/common',
    '@lezer/lr',
    'crelt',
    'w3c-keyname',
    '@marijn/find-cluster-break',
    'lodash.throttle',
    'lodash.memoize',
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
