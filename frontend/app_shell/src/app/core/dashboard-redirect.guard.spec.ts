import { TestBed } from '@angular/core/testing';
import { Router, type UrlTree } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { firstValueFrom, Observable } from 'rxjs';
import { dashboardRedirectGuard } from './dashboard-redirect.guard';
import type { Dashboard } from './dashboard.model';

describe('dashboardRedirectGuard', () => {
  let router: Router;
  let httpMock: HttpTestingController;

  const gisDashboard: Dashboard = {
    id: 'dash-1',
    kind: 'gis',
    name: 'GIS Dashboard',
    payload: {},
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-01T00:00:00Z',
  };

  const explorerDashboard: Dashboard = {
    id: 'dash-2',
    kind: 'explorer',
    name: 'Explorer Dashboard',
    payload: {},
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-01T00:00:00Z',
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    router = TestBed.inject(Router);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  function createRouteSnapshot(id: string) {
    return { paramMap: new Map([['id', id]]) } as any;
  }

  function getGuardResult(id: string) {
    const result = TestBed.runInInjectionContext(() =>
      dashboardRedirectGuard(createRouteSnapshot(id), {} as any),
    );
    if (result instanceof Observable) {
      return firstValueFrom(result);
    }
    return Promise.resolve(result as UrlTree | boolean);
  }

  it('redirects to /gis?dashboardId=:id when kind is gis', async () => {
    const promise = getGuardResult('dash-1');
    httpMock.expectOne('/api/dashboards/dash-1').flush(gisDashboard);
    const urlTree = await promise;
    expect(router.serializeUrl(urlTree as UrlTree)).toBe('/gis?dashboardId=dash-1');
  });

  it('redirects to /explorer?workspaceId=:id when kind is explorer', async () => {
    const promise = getGuardResult('dash-2');
    httpMock.expectOne('/api/dashboards/dash-2').flush(explorerDashboard);
    const urlTree = await promise;
    expect(router.serializeUrl(urlTree as UrlTree)).toBe('/explorer?workspaceId=dash-2');
  });

  it('redirects to / with snackbar on 404', async () => {
    const promise = getGuardResult('unknown');
    httpMock.expectOne('/api/dashboards/unknown').flush(null, {
      status: 404,
      statusText: 'Not Found',
    });
    const urlTree = await promise;
    expect(router.serializeUrl(urlTree as UrlTree)).toBe('/');
  });
});
