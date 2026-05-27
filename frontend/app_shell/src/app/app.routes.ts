import { Routes } from '@angular/router';
import { loadRemoteModule } from '@angular-architects/native-federation';
import { Component } from '@angular/core';
import { dashboardRedirectGuard } from './core/dashboard-redirect.guard';

@Component({ template: '', standalone: true })
class DashboardStubComponent {}

export const routes: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./pages/welcome/welcome.component').then((m) => m.WelcomePageComponent),
  },
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
    path: 'dashboards/:id',
    canActivate: [dashboardRedirectGuard],
    component: DashboardStubComponent,
  },
  {
    path: '**',
    redirectTo: '',
  },
];
