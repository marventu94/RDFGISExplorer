// Ensures `ngDevMode` is set as a global before any Angular code runs.
//
// Why this is needed:
//   @angular/core declares "sideEffects": false in its package.json, and the
//   @angular-architects/native-federation esbuild builder does NOT apply the
//   side-effect override that the standard @angular/build:application builder
//   does for Angular packages. As a result, esbuild tree-shakes the
//   `_global['ngDevMode'] = ...` initializer in @angular/core, leaving the
//   global `undefined`. Code paths that reference `ngDevMode` directly (the
//   `if (ngDevMode && ...)` patterns in dev builds) then throw
//   `ReferenceError: ngDevMode is not defined`.
//
// This polyfill must run before the Angular runtime, so it is listed first
// in `angular.json#architect.esbuild.options.polyfills`.
//
// In production builds, esbuild constant-folds the bare `ngDevMode` references
// to `false`, so this polyfill is a no-op there.
const _ngDevModeGlobal = globalThis as unknown as { ngDevMode?: boolean };
if (typeof _ngDevModeGlobal.ngDevMode === 'undefined') {
  _ngDevModeGlobal.ngDevMode = true;
}
