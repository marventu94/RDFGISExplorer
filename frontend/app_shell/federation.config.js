const {
  withNativeFederation,
  shareAll,
  share,
} = require('@angular-architects/native-federation/config');

module.exports = withNativeFederation({
  name: 'app_shell',

  shared: {
    ...shareAll({ singleton: true, strictVersion: true, requiredVersion: 'auto' }),
    // QueryHandoffService uses Plan B (sessionStorage + CustomEvent)
    // as the shared communication channel between shell and remotes,
    // since custom app services can't be shared via npm package sharing.

    // El shell no importa Material/CDK en su propio código, así que
    // ignoreUnusedDeps los sacaría del import map del host y cada remote
    // cargaría su PROPIA copia del CDK. Con dos copias vivas, los tokens de
    // clase no coinciden entre remotes (NG0912 "Component ID generation
    // collision") y MatDialog crashea: el viewChild(CdkPortalOutlet) del
    // contenedor no matchea la directiva de la otra copia y _portalOutlet
    // queda undefined. includeSecondaries.keepAll fuerza a compartirlos
    // desde el host aunque no se usen acá (sobrevive a ignoreUnusedDeps).
    ...share({
      '@angular/cdk': {
        singleton: true,
        strictVersion: true,
        requiredVersion: 'auto',
        includeSecondaries: { keepAll: true },
      },
      '@angular/material': {
        singleton: true,
        strictVersion: true,
        requiredVersion: 'auto',
        includeSecondaries: { keepAll: true },
      },
    }),
  },

  skip: [
    'rxjs/ajax',
    'rxjs/fetch',
    'rxjs/testing',
    'rxjs/webSocket',
    '@softarc/native-federation-runtime',
    '@softarc/native-federation',
    '@softarc/native-federation-node',
    // Add further packages you don't need at runtime
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
