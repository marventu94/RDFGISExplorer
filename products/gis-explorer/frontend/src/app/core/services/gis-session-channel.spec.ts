import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';

import {
  publishGisSessionState,
  readGisSessionState,
  clearGisSessionState,
} from './gis-session-channel';
import { GisSessionStateService } from './gis-session-state.service';
import { DashboardStateService } from './dashboard-state.service';
import { SparqlQueryStateService } from './sparql-query-state.service';

// The key is duplicated in the Explorer remote because services cannot be
// shared across remotes): if it changes here, it must change there too.
const CHANNEL_KEY = '__rdfgisGisSession_v1';

function windowKey(): unknown {
  return (window as unknown as Record<string, unknown>)[CHANNEL_KEY];
}

describe('canal de estado del GIS', () => {
  afterEach(() => {
    clearGisSessionState();
  });

  it('publishes state under the shared window key', () => {
    publishGisSessionState({
      dashboardId: 'esc-e01',
      dashboardName: 'E01',
      hasWorkAtRisk: true,
      updatedAt: '2026-09-10T00:00:00.000Z',
    });

    expect(windowKey()).toEqual({
      dashboardId: 'esc-e01',
      dashboardName: 'E01',
      hasWorkAtRisk: true,
      updatedAt: '2026-09-10T00:00:00.000Z',
    });
    expect(readGisSessionState()?.dashboardName).toBe('E01');
  });

  it('returns null when nothing is published or the content is unusable', () => {
    clearGisSessionState();
    expect(readGisSessionState()).toBeNull();

    (window as unknown as Record<string, unknown>)[CHANNEL_KEY] = { roto: true };
    expect(readGisSessionState()).toBeNull();
  });
});

describe('GisSessionStateService', () => {
  let persistenceMock: {
    currentDashboardId: ReturnType<typeof signal<string | null>>;
    currentDashboardName: ReturnType<typeof signal<string | null>>;
  };
  let queryState: SparqlQueryStateService;

  beforeEach(() => {
    clearGisSessionState();
    persistenceMock = {
      currentDashboardId: signal<string | null>(null),
      currentDashboardName: signal<string | null>(null),
    };

    TestBed.configureTestingModule({
      providers: [
        GisSessionStateService,
        SparqlQueryStateService,
        { provide: DashboardStateService, useValue: persistenceMock },
      ],
    });
    queryState = TestBed.inject(SparqlQueryStateService);
    TestBed.inject(GisSessionStateService);
  });

  afterEach(() => {
    clearGisSessionState();
    vi.clearAllMocks();
  });

  it('publishes hasWorkAtRisk=false when GIS is empty', () => {
    TestBed.tick();
    expect(readGisSessionState()).toMatchObject({
      dashboardId: null,
      dashboardName: null,
      hasWorkAtRisk: false,
    });
  });

  it('publishes the open dashboard', () => {
    persistenceMock.currentDashboardId.set('esc-e01');
    persistenceMock.currentDashboardName.set('E01 · Berisso');
    TestBed.tick();

    expect(readGisSessionState()).toMatchObject({
      dashboardId: 'esc-e01',
      dashboardName: 'E01 · Berisso',
      hasWorkAtRisk: true,
    });
  });

  it('marks an unsaved query without a dashboard as at risk', () => {
    queryState.query.set('SELECT ?x WHERE { ?x ?p ?o }');
    TestBed.tick();

    expect(readGisSessionState()).toMatchObject({ dashboardId: null, hasWorkAtRisk: true });
  });

  it('marks the latest imported query as at risk once it has been executed', () => {
    queryState.query.set('SELECT ?x WHERE { ?x ?p ?o } LIMIT 100');
    TestBed.tick();

    expect(readGisSessionState()?.hasWorkAtRisk).toBe(true);
  });
});
