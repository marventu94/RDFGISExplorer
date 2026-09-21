import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import {
  dashboardHost,
  registerDashboardStateAdapter,
} from '@rdfgis/platform-bridge';
import { DashboardHostService } from './dashboard-host.service';
import { DashboardApiClient } from './dashboard-api.client';
import type { Dashboard } from './dashboard.model';

describe('DashboardHostService', () => {
  const explorer: Dashboard = {
    id: 'explorer-1', kind: 'explorer', name: 'Workspace', payload: { panels: [] },
    createdAt: '2026-01-01', updatedAt: '2026-01-01',
  };
  const gis: Dashboard = {
    id: 'gis-1', kind: 'gis', name: 'Mapa', payload: { query: 'SELECT * WHERE {}' },
    createdAt: '2026-01-01', updatedAt: '2026-01-01',
  };
  let api: {
    list: ReturnType<typeof vi.fn>;
    get: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
  };
  let unregisterAdapter: () => void;

  beforeEach(() => {
    api = {
      list: vi.fn(() => of([explorer, gis])),
      get: vi.fn(() => of(gis)),
      create: vi.fn((input) => of({ ...gis, ...input })),
      update: vi.fn((id, input) => of({ ...gis, id, ...input })),
      delete: vi.fn(() => of(undefined)),
    };
    unregisterAdapter = registerDashboardStateAdapter({
      kind: 'gis',
      exportPayload: () => ({ query: 'ASK {}' }),
      importPayload: vi.fn(),
    });
    TestBed.configureTestingModule({
      providers: [
        DashboardHostService,
        { provide: DashboardApiClient, useValue: api },
      ],
    });
    TestBed.inject(DashboardHostService);
  });

  afterEach(() => unregisterAdapter());

  it('filters listing in the Shell', async () => {
    expect(await dashboardHost().list('gis')).toEqual([gis]);
  });

  it('loads through the Shell and asks the remote to import state', async () => {
    const importPayload = vi.fn();
    unregisterAdapter();
    unregisterAdapter = registerDashboardStateAdapter({
      kind: 'gis', exportPayload: () => ({}), importPayload,
    });
    await dashboardHost().load('gis-1');
    expect(api.get).toHaveBeenCalledWith('gis-1');
    expect(importPayload).toHaveBeenCalledWith(gis.payload, {
      id: gis.id, name: gis.name, mode: 'replace',
    });
  });

  it('captures remote state but decides create/update in the Shell', async () => {
    await dashboardHost().save({ kind: 'gis', name: 'Nuevo', mode: 'copy' });
    expect(api.create).toHaveBeenCalledWith({
      kind: 'gis', name: 'Nuevo', payload: { query: 'ASK {}' },
    });

    await dashboardHost().save({
      kind: 'gis', name: 'Actualizado', mode: 'overwrite', currentId: 'gis-1',
    });
    expect(api.update).toHaveBeenCalledWith('gis-1', {
      name: 'Actualizado', payload: { query: 'ASK {}' },
    });
  });
});
