import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DashboardLoadProgressService } from './dashboard-load-progress.service';
import type { LoadStageId } from '@shared/progress/load-stages';

const STAGES: readonly LoadStageId[] = [
  'fetch-dashboard',
  'execute-query',
  'process-results',
  'summary',
  'render-views',
];

describe('DashboardLoadProgressService', () => {
  let service: DashboardLoadProgressService;

  beforeEach(() => {
    vi.useFakeTimers();
    TestBed.configureTestingModule({});
    service = TestBed.inject(DashboardLoadProgressService);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('starts inactive: nothing to show until a dashboard is loaded', () => {
    expect(service.active()).toBe(false);
    expect(service.run()).toBeNull();
  });

  it('ignores reports made outside a run (query ejecutada a mano)', () => {
    service.reportViewRendered('map');
    service.reportSummaryStart('local');

    expect(service.run()).toBeNull();
  });

  it('opens a run with every stage pending', () => {
    service.begin('Loading dashboard', STAGES, 'WWII battles');

    expect(service.active()).toBe(true);
    expect(service.run()?.subtitle).toBe('WWII battles');
    expect(service.stageStatus('execute-query')).toBe('pending');
  });

  it('closes "procesando resultados" and opens "renderizando vistas" with the first view', () => {
    service.begin('t', STAGES);
    service.start('process-results');
    service.expectViews(['map', 'table']);

    service.reportViewRendered('map');

    expect(service.stageStatus('process-results')).toBe('done');
    expect(service.stageStatus('render-views')).toBe('active');
    expect(service.active()).toBe(true);
  });

  it('ends the run when every expected view has painted', () => {
    service.begin('t', STAGES);
    service.expectViews(['map', 'table']);

    service.reportViewRendered('map');
    service.reportViewRendered('table');

    expect(service.stageStatus('render-views')).toBe('done');
    expect(service.run()?.stages.find((s) => s.id === 'render-views')?.detail).toBe('mapa, tabla');
    expect(service.active()).toBe(false);
  });

  it('does not wait for views that are not in the layout', () => {
    service.begin('t', STAGES);
    service.expectViews(['table']);

    service.reportViewRendered('table');

    expect(service.active()).toBe(false);
  });

  it('closes the poster anyway if a view never reports', () => {
    service.begin('t', STAGES);
    service.expectViews(['map', 'graph']);
    service.reportViewRendered('map');

    expect(service.active()).toBe(true);
    vi.advanceTimersByTime(3000);

    expect(service.active()).toBe(false);
    expect(service.stageStatus('render-views')).toBe('done');
  });

  it('leaves the backend summary running in background when the board is already usable', () => {
    service.begin('t', STAGES);
    service.expectViews(['table']);
    service.reportSummaryStart('backend');

    service.reportViewRendered('table');

    expect(service.active()).toBe(false);
    expect(service.stageStatus('summary')).toBe('background');
  });

  it('marks the summary done when it resolves before the views', () => {
    service.begin('t', STAGES);
    service.expectViews(['table']);
    service.reportSummaryStart('local');
    service.reportSummaryDone('120 rows · in the browser');

    expect(service.stageStatus('summary')).toBe('done');
  });

  it('fails the stage that was running and closes the run', () => {
    service.begin('t', STAGES);
    service.start('execute-query');

    service.failActive('backend no disponible');

    expect(service.stageStatus('execute-query')).toBe('failed');
    expect(service.active()).toBe(false);
  });

  it('fails the next pending stage when nothing was running', () => {
    service.begin('t', STAGES);

    service.failActive('dashboard could not be loaded');

    expect(service.stageStatus('fetch-dashboard')).toBe('failed');
    expect(service.active()).toBe(false);
  });

  it('drops the timers of the previous run when a new one begins', () => {
    service.begin('t', STAGES);
    service.expectViews(['map']);
    service.begin('t2', STAGES);
    service.expectViews(['table']);

    // The previous run's report does not count toward the new run.
    service.reportViewRendered('map');
    expect(service.active()).toBe(true);

    service.reportViewRendered('table');
    expect(service.active()).toBe(false);
  });
});
