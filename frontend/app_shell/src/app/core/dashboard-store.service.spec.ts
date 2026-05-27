import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { DashboardStoreService } from './dashboard-store.service';
import type { Dashboard } from './dashboard.model';

describe('DashboardStoreService', () => {
  let service: DashboardStoreService;
  let httpMock: HttpTestingController;

  const mockDashboards: Dashboard[] = [
    { id: '1', kind: 'gis', name: 'GIS One', payload: {}, createdAt: '', updatedAt: '2025-01-01T00:00:00Z' },
    { id: '2', kind: 'explorer', name: 'Explorer One', payload: {}, createdAt: '', updatedAt: '2025-01-02T00:00:00Z' },
  ];

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(DashboardStoreService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('fetches recent dashboards on first subscription', () => {
    const results: Dashboard[][] = [];
    service.recent$.subscribe((d) => results.push(d));

    httpMock.expectOne('http://localhost:3000/api/dashboards/recent').flush(mockDashboards);

    expect(results[0]).toEqual(mockDashboards);
  });

  it('refreshes when refresh() is called', () => {
    const results: Dashboard[][] = [];
    service.recent$.subscribe((d) => results.push(d));
    httpMock.expectOne('http://localhost:3000/api/dashboards/recent').flush(mockDashboards);

    service.refresh();
    httpMock.expectOne('http://localhost:3000/api/dashboards/recent').flush([mockDashboards[0]]);

    expect(results.length).toBe(2);
    expect(results[1]).toEqual([mockDashboards[0]]);
  });

  it('deletes and refreshes', () => {
    service.recent$.subscribe();
    httpMock.expectOne('http://localhost:3000/api/dashboards/recent').flush(mockDashboards);

    service.delete('1').subscribe();
    httpMock.expectOne('http://localhost:3000/api/dashboards/1').flush(null);

    httpMock.expectOne('http://localhost:3000/api/dashboards/recent').flush([]);
  });

  it('renames and refreshes', () => {
    service.recent$.subscribe();
    httpMock.expectOne('http://localhost:3000/api/dashboards/recent').flush(mockDashboards);

    const renamed = { ...mockDashboards[0], name: 'New Name' };
    service.rename('1', 'New Name').subscribe((d) => {
      expect(d.name).toBe('New Name');
    });
    httpMock.expectOne('http://localhost:3000/api/dashboards/1').flush(renamed);

    httpMock.expectOne('http://localhost:3000/api/dashboards/recent').flush([]);
  });

  it('duplicates and refreshes', () => {
    service.recent$.subscribe();
    httpMock.expectOne('http://localhost:3000/api/dashboards/recent').flush(mockDashboards);

    service.duplicate('1').subscribe();
    httpMock.expectOne('http://localhost:3000/api/dashboards/1').flush(mockDashboards[0]);

    const created = { ...mockDashboards[0], id: '3', name: 'GIS One (copia)' };
    httpMock.expectOne({ method: 'POST', url: 'http://localhost:3000/api/dashboards' }).flush(created);

    httpMock.expectOne('http://localhost:3000/api/dashboards/recent').flush([]);
  });
});
