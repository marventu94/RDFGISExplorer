import { TestBed } from '@angular/core/testing';
import { Router, type UrlTree } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { firstValueFrom, Observable } from 'rxjs';
import { dashboardRedirectGuard } from './dashboard-redirect.guard';
import { GisOpenGuardService, type OpenDecision } from './gis-open-guard.service';
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

  // El aviso de "vas a pisar lo que hay en GIS" se stubea: su contenido se
  // prueba en gis-open-guard.service.spec.ts. Acá importa a dónde se navega.
  let decision: OpenDecision;
  let asked: { id: string; name: string } | null;

  beforeEach(() => {
    decision = 'proceed';
    asked = null;

    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: GisOpenGuardService,
          useValue: {
            askBeforeOpen: (id: string, name: string) => {
              asked = { id, name };
              return Promise.resolve(decision);
            },
          },
        },
      ],
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

  it('asks before opening a gis dashboard, naming the one being opened', async () => {
    const promise = getGuardResult('dash-1');
    httpMock.expectOne('/api/dashboards/dash-1').flush(gisDashboard);
    await promise;
    expect(asked).toEqual({ id: 'dash-1', name: 'GIS Dashboard' });
  });

  it('cancels the navigation when the user backs out', async () => {
    decision = 'cancel';
    const promise = getGuardResult('dash-1');
    httpMock.expectOne('/api/dashboards/dash-1').flush(gisDashboard);
    expect(await promise).toBe(false);
  });

  it('goes to gis without dashboardId when the user wants to save first', async () => {
    decision = 'go-save';
    const promise = getGuardResult('dash-1');
    httpMock.expectOne('/api/dashboards/dash-1').flush(gisDashboard);
    const urlTree = await promise;
    // Sin dashboardId no se rehidrata nada: el tablero abierto sigue en pantalla.
    expect(router.serializeUrl(urlTree as UrlTree)).toBe('/gis');
  });

  it('opens the dashboard when the user confirms the replacement', async () => {
    decision = 'proceed-confirmed';
    const promise = getGuardResult('dash-1');
    httpMock.expectOne('/api/dashboards/dash-1').flush(gisDashboard);
    const urlTree = await promise;
    expect(router.serializeUrl(urlTree as UrlTree)).toBe('/gis?dashboardId=dash-1');
  });

  it('does not ask anything for explorer workspaces', async () => {
    const promise = getGuardResult('dash-2');
    httpMock.expectOne('/api/dashboards/dash-2').flush(explorerDashboard);
    await promise;
    expect(asked).toBeNull();
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
