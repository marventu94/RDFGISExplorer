import { Routes } from '@angular/router';
import { loadRemoteModule } from '@angular-architects/native-federation';

export const routes: Routes = [
  {
    path: 'explorer',
    loadComponent: () =>
      loadRemoteModule('rdf_explorer', './Component').then((m) => m.AppComponent),
  },
  {
    path: 'gis',
    loadComponent: () =>
      loadRemoteModule('rdf_gis_explorer', './Component').then((m) => m.App),
  },
  {
    path: '',
    redirectTo: 'explorer',
    pathMatch: 'full',
  },
];
