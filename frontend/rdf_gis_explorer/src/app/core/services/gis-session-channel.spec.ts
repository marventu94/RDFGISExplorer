import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';

import {
  publishGisSessionState,
  readGisSessionState,
  clearGisSessionState,
} from './gis-session-channel';
import { GisSessionStateService } from './gis-session-state.service';
import { DashboardPersistenceService } from './dashboard-persistence.service';
import { SparqlQueryStateService } from './sparql-query-state.service';

// La clave viaja duplicada en el remote del Explorer (los servicios no se
// comparten entre remotes): si cambia acá, hay que cambiarla allá.
const CHANNEL_KEY = '__rdfgisGisSession_v1';

function windowKey(): unknown {
  return (window as unknown as Record<string, unknown>)[CHANNEL_KEY];
}

describe('canal de estado del GIS', () => {
  afterEach(() => {
    clearGisSessionState();
  });

  it('publica el estado en la clave compartida de window', () => {
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

  it('devuelve null si no hay nada publicado o el contenido no sirve', () => {
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
        { provide: DashboardPersistenceService, useValue: persistenceMock },
      ],
    });
    queryState = TestBed.inject(SparqlQueryStateService);
    TestBed.inject(GisSessionStateService);
  });

  afterEach(() => {
    clearGisSessionState();
    vi.clearAllMocks();
  });

  it('publica hasWorkAtRisk=false con el GIS vacío', () => {
    TestBed.tick();
    expect(readGisSessionState()).toMatchObject({
      dashboardId: null,
      dashboardName: null,
      hasWorkAtRisk: false,
    });
  });

  it('publica el tablero abierto', () => {
    persistenceMock.currentDashboardId.set('esc-e01');
    persistenceMock.currentDashboardName.set('E01 · Berisso');
    TestBed.tick();

    expect(readGisSessionState()).toMatchObject({
      dashboardId: 'esc-e01',
      dashboardName: 'E01 · Berisso',
      hasWorkAtRisk: true,
    });
  });

  it('marca riesgo con una consulta sin guardar (sin tablero)', () => {
    queryState.query.set('SELECT ?x WHERE { ?x ?p ?o }');
    TestBed.tick();

    expect(readGisSessionState()).toMatchObject({ dashboardId: null, hasWorkAtRisk: true });
  });

  it('no marca riesgo si la vista es tal cual la última importación', () => {
    const imported = 'SELECT ?x WHERE { ?x ?p ?o } LIMIT 100';
    TestBed.inject(GisSessionStateService).markImported(imported);
    queryState.query.set(imported);
    TestBed.tick();

    expect(readGisSessionState()?.hasWorkAtRisk).toBe(false);
  });

  it('vuelve a marcar riesgo si la query importada se editó', () => {
    TestBed.inject(GisSessionStateService).markImported('SELECT ?x WHERE { ?x ?p ?o }');
    queryState.query.set('SELECT ?x WHERE { ?x ?p ?o } LIMIT 5');
    TestBed.tick();

    expect(readGisSessionState()?.hasWorkAtRisk).toBe(true);
  });
});
