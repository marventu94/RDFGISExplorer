import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { of } from 'rxjs';

import { GisHandoffService, type HandoffTarget } from './gis-handoff.service';
import { DashboardSaveFlowService } from './dashboard-save-flow.service';
import { OverwriteDashboardDialogComponent } from './overwrite-dashboard-dialog.component';
import { ErrorDialogComponent } from '@features/sparql-input/error-dialog.component';
import { QueryHandoffService, setAutoRunHandoff } from '@core/services/query-handoff.service';
import { DashboardStateService } from '@core/services/dashboard-state.service';
import { SparqlQueryStateService } from '@core/services/sparql-query-state.service';
import { DashboardLayoutService } from '@core/services/dashboard-layout.service';
import { DashboardViewStateService } from '@core/services/dashboard-view-state.service';
import { GisSessionStateService } from '@core/services/gis-session-state.service';
import { SelectionService } from '@core/services/selection.service';
import { I18nService } from '@core/services/i18n.service';

interface MockTarget {
  setQuery: ReturnType<typeof vi.fn>;
  setBackend: ReturnType<typeof vi.fn>;
  execute: ReturnType<typeof vi.fn>;
}

function makeTarget(): MockTarget {
  return { setQuery: vi.fn(), setBackend: vi.fn(), execute: vi.fn() };
}

function asTarget(target: MockTarget): HandoffTarget {
  return target as unknown as HandoffTarget;
}

describe('GisHandoffService', () => {
  let service: GisHandoffService;
  let handoff: QueryHandoffService;
  let queryState: SparqlQueryStateService;
  let persistenceMock: {
    currentDashboardId: ReturnType<typeof signal<string | null>>;
    currentDashboardName: ReturnType<typeof signal<string | null>>;
    clearCurrent: ReturnType<typeof vi.fn>;
    beginQueryLoad: ReturnType<typeof vi.fn>;
  };
  let saveFlowMock: { saveInteractive: ReturnType<typeof vi.fn> };
  let dialogMock: { open: ReturnType<typeof vi.fn> };
  let snackMock: { open: ReturnType<typeof vi.fn> };
  let selectionMock: { setQueryResult: ReturnType<typeof vi.fn> };
  let dialogResult: unknown;

  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
    // Without auto-run the flow is synchronous, which is enough to verify applied state.
    setAutoRunHandoff(false);

    persistenceMock = {
      currentDashboardId: signal<string | null>(null),
      currentDashboardName: signal<string | null>(null),
      clearCurrent: vi.fn(),
      beginQueryLoad: vi.fn(),
    };
    saveFlowMock = { saveInteractive: vi.fn().mockReturnValue(of(null)) };
    dialogResult = undefined;
    dialogMock = {
      open: vi.fn(() => ({ afterClosed: () => of(dialogResult) })),
    };
    snackMock = { open: vi.fn() };
    selectionMock = { setQueryResult: vi.fn() };

    TestBed.configureTestingModule({
      providers: [
        GisHandoffService,
        GisSessionStateService,
        QueryHandoffService,
        SparqlQueryStateService,
        { provide: DashboardStateService, useValue: persistenceMock },
        { provide: DashboardSaveFlowService, useValue: saveFlowMock },
        { provide: MatDialog, useValue: dialogMock },
        { provide: MatSnackBar, useValue: snackMock },
        { provide: SelectionService, useValue: selectionMock },
      ],
    });

    handoff = TestBed.inject(QueryHandoffService);
    queryState = TestBed.inject(SparqlQueryStateService);
    service = TestBed.inject(GisHandoffService);
  });

  afterEach(() => {
    sessionStorage.clear();
    localStorage.clear();
    vi.clearAllMocks();
  });

  function publish(overwriteConfirmed = false): void {
    handoff.publish({
      query: 'SELECT ?x WHERE { ?x ?p ?o } LIMIT 10',
      backend: 'custom',
      overwriteConfirmed,
      source: {},
    });
  }

  it('shows a dialog when there is no query to import', () => {
    const target = makeTarget();
    service.consumeInto(asTarget(target));

    expect(dialogMock.open).toHaveBeenCalledWith(ErrorDialogComponent, expect.any(Object));
    expect(target.setQuery).not.toHaveBeenCalled();
  });

  it('builds the missing-handoff popup in English', () => {
    TestBed.inject(I18nService).set('en');
    service.consumeInto(asTarget(makeTarget()));

    expect(dialogMock.open).toHaveBeenCalledWith(
      ErrorDialogComponent,
      expect.objectContaining({
        data: {
          title: 'The query to import was not found',
          message: expect.stringContaining('The handoff from RDF Explorer expired'),
        },
      }),
    );
    TestBed.inject(I18nService).set('es');
  });

  it('applies without asking when nothing can be lost', () => {
    publish();
    const target = makeTarget();
    service.consumeInto(asTarget(target));

    expect(dialogMock.open).not.toHaveBeenCalled();
    expect(target.setQuery).toHaveBeenCalledWith('SELECT ?x WHERE { ?x ?p ?o } LIMIT 10');
    expect(target.setBackend).toHaveBeenCalledWith('custom');
    expect(TestBed.inject(DashboardLayoutService).preset()).toBe('triple-v-inv');
    expect(TestBed.inject(DashboardLayoutService).visibleSlots()).toEqual([
      'graph',
      'map',
      'timeline',
    ]);
    expect(TestBed.inject(DashboardViewStateService).graphState()).toEqual({ layout: 'dagre' });
    expect(selectionMock.setQueryResult).toHaveBeenCalledWith(null);
    expect(TestBed.inject(DashboardViewStateService).mapViewportFit()).toBe(1);
    // The handoff is consumed and is not pending on the next entry.
    expect(handoff.peek()).toBeNull();
  });

  it('uses the localized snackbar action in English', () => {
    TestBed.inject(I18nService).set('en');
    publish();
    service.consumeInto(asTarget(makeTarget()));

    expect(snackMock.open).toHaveBeenCalledWith(
      'Query imported from RDF Explorer. Press Run to execute it.',
      'OK',
      { duration: 6000 },
    );
    TestBed.inject(I18nService).set('es');
  });

  it('reuses the staged dashboard loader before auto-running the imported query', () => {
    vi.useFakeTimers();
    setAutoRunHandoff(true);
    publish();
    const target = makeTarget();

    service.consumeInto(asTarget(target));

    expect(persistenceMock.beginQueryLoad).toHaveBeenCalledOnce();
    expect(target.execute).not.toHaveBeenCalled();
    vi.advanceTimersByTime(300);
    expect(target.execute).toHaveBeenCalledWith({
      showLoadProgress: true,
    });
    vi.useRealTimers();
  });

  it('detaches the open dashboard so Save does not overwrite it', () => {
    persistenceMock.currentDashboardId.set('esc-e01');
    persistenceMock.currentDashboardName.set('E01');
    publish(true);

    service.consumeInto(asTarget(makeTarget()));

    expect(persistenceMock.clearCurrent).toHaveBeenCalled();
  });

  it('does not ask again when Explorer already confirmed', () => {
    persistenceMock.currentDashboardId.set('esc-e01');
    persistenceMock.currentDashboardName.set('E01');
    publish(true);

    const target = makeTarget();
    service.consumeInto(asTarget(target));

    expect(dialogMock.open).not.toHaveBeenCalled();
    expect(target.setQuery).toHaveBeenCalled();
  });

  it('asks before replacing an open dashboard and honors replace', () => {
    persistenceMock.currentDashboardId.set('esc-e01');
    persistenceMock.currentDashboardName.set('E01 · Berisso');
    publish();
    dialogResult = 'replace';

    const target = makeTarget();
    service.consumeInto(asTarget(target));

    expect(dialogMock.open).toHaveBeenCalledWith(
      OverwriteDashboardDialogComponent,
      expect.objectContaining({
        data: { dashboardName: 'E01 · Berisso' },
      }),
    );
    expect(target.setQuery).toHaveBeenCalled();
  });

  it('asks before replacing a previously imported query once it was executed', () => {
    queryState.query.set('SELECT ?x WHERE { ?x ?p ?o } LIMIT 10');
    publish();
    dialogResult = 'replace';

    const target = makeTarget();
    service.consumeInto(asTarget(target));

    expect(dialogMock.open).toHaveBeenCalledWith(
      OverwriteDashboardDialogComponent,
      expect.any(Object),
    );
    expect(target.setQuery).toHaveBeenCalled();
  });

  it('also asks for an unsaved query without a dashboard', () => {
    queryState.query.set('SELECT ?viejo WHERE { ?viejo ?p ?o }');
    publish();
    dialogResult = 'cancel';

    const target = makeTarget();
    service.consumeInto(asTarget(target));

    expect(dialogMock.open).toHaveBeenCalledWith(
      OverwriteDashboardDialogComponent,
      expect.objectContaining({ data: { dashboardName: null } }),
    );
    expect(target.setQuery).not.toHaveBeenCalled();
  });

  it('leaves the dashboard intact and discards the import on cancel', () => {
    persistenceMock.currentDashboardId.set('esc-e01');
    publish();
    dialogResult = 'cancel';

    const target = makeTarget();
    service.consumeInto(asTarget(target));

    expect(target.setQuery).not.toHaveBeenCalled();
    expect(persistenceMock.clearCurrent).not.toHaveBeenCalled();
    expect(handoff.peek()).toBeNull();
    expect(snackMock.open).toHaveBeenCalledWith(
      expect.stringContaining('descartada'),
      'Aceptar',
      expect.any(Object),
    );
  });

  it('saves before applying when save and replace is chosen', () => {
    persistenceMock.currentDashboardId.set('esc-e01');
    publish();
    dialogResult = 'save-first';
    saveFlowMock.saveInteractive.mockReturnValue(of({ id: 'esc-e01', name: 'E01' }));

    const target = makeTarget();
    service.consumeInto(asTarget(target));

    expect(saveFlowMock.saveInteractive).toHaveBeenCalled();
    expect(target.setQuery).toHaveBeenCalled();
  });

  it('does not import anything when saving is canceled', () => {
    persistenceMock.currentDashboardId.set('esc-e01');
    publish();
    dialogResult = 'save-first';
    saveFlowMock.saveInteractive.mockReturnValue(of(null));

    const target = makeTarget();
    service.consumeInto(asTarget(target));

    expect(target.setQuery).not.toHaveBeenCalled();
    expect(persistenceMock.clearCurrent).not.toHaveBeenCalled();
  });
});
