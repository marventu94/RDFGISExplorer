import { DashboardLayoutService } from './dashboard-layout.service';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { MatSnackBar } from '@angular/material/snack-bar';
import { signal } from '@angular/core';
import { firstValueFrom, of } from 'rxjs';
import { DashboardStateService } from './dashboard-state.service';
import { DashboardViewStateService } from './dashboard-view-state.service';
import { SelectionService } from './selection.service';
import { SparqlQueryStateService } from './sparql-query-state.service';
import { ApiService } from './api.service';
import { AppConfigService } from './app-config.service';
import type { QueryResult } from '@rdfgis/contracts';

it('round-trips active GIS filters and view state through a JSON dashboard', async () => {
  const result: QueryResult = { variables: ['listing','date'],
    bindings: [{ listing: { type: 'uri', value: 'urn:house' }, date: { type: 'date', value: '2023-10-15', raw: '2023-10-15' } }],
    nodes: [{ uri: 'urn:house', label: 'Casa', attributes: {} }], edges: [],
    meta: { durationMs: 1, truncated: false, limitApplied: 300, backend: 'test' } };
  TestBed.configureTestingModule({ providers: [provideHttpClient(),
    { provide: MatSnackBar, useValue: { open: vi.fn() } },
    { provide: ApiService, useValue: { fetchSummary: () => of({ totalRows: 1 }), executeQuery: () => of(result) } },
    { provide: AppConfigService, useValue: { load: () => of({ maxLimit: 1000 }), config: signal({ maxLimit: 1000 }) } },
  ] });
  const layout = TestBed.inject(DashboardLayoutService);
  layout.restoreDividers(65, 35);
  layout.editorCollapsed.set(true);
  const state = TestBed.inject(DashboardStateService);
  const selection = TestBed.inject(SelectionService);
  const view = TestBed.inject(DashboardViewStateService);
  TestBed.inject(SparqlQueryStateService).query.set('SELECT ?listing ?date WHERE { ?listing <urn:date> ?date }');
  selection.setQueryResult(result);
  const filter = { id: 'time', kind: 'temporal' as const, from: '2023-10-01', to: '2023-10-31', label: 'Octubre' };
  selection.addFilter(filter);
  view.mapState.set({ center: [-34, -58], zoom: 12 });
  const saved = JSON.parse(JSON.stringify(state.serialize()));
  layout.restoreDividers();
  layout.editorCollapsed.set(false);
  selection.clearFilters();
  view.mapState.set(null);
  await firstValueFrom(state.deserialize(saved));
  expect(selection.getActiveFiltersSnapshot()).toEqual([filter]);
  expect(view.mapState()).toEqual({ center: [-34, -58], zoom: 12 });
  expect(layout.colLeft()).toBe(65);
  expect(layout.rowTop()).toBe(35);
  expect(layout.editorCollapsed()).toBe(true);
  expect(state.isHydrating()).toBe(false);
});
