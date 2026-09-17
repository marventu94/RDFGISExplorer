import { describe, expect, it } from 'vitest';

import {
  type LoadStageId,
  completeStage,
  createRun,
  detailStage,
  endRun,
  failStage,
  findStage,
  formatDuration,
  isRunActive,
  runElapsedMs,
  stageElapsedMs,
  startStage,
} from './load-stages';

const STAGES: readonly LoadStageId[] = [
  'fetch-dashboard',
  'execute-query',
  'process-results',
  'summary',
  'render-views',
];

describe('load-stages', () => {
  it('creates every stage pending, in the given order', () => {
    const run = createRun('Cargando tablero', STAGES, 1000);

    expect(run.stages.map((s) => s.id)).toEqual([...STAGES]);
    expect(run.stages.every((s) => s.status === 'pending')).toBe(true);
    expect(run.stages.every((s) => s.startedAt === undefined)).toBe(true);
    expect(isRunActive(run)).toBe(true);
  });

  it('marks a stage active with its start time and closes it with its duration', () => {
    let run = createRun('t', STAGES, 1000);
    run = startStage(run, 'execute-query', 1200, 'esperando al endpoint');
    expect(findStage(run, 'execute-query')?.status).toBe('active');
    expect(stageElapsedMs(findStage(run, 'execute-query')!, 1700)).toBe(500);

    run = completeStage(run, 'execute-query', 2200, '10 filas');
    const stage = findStage(run, 'execute-query')!;
    expect(stage.status).toBe('done');
    expect(stage.detail).toBe('10 filas');
    // Ya cerrada: el reloj no la sigue corriendo.
    expect(stageElapsedMs(stage, 9999)).toBe(1000);
  });

  it('does not restart a stage that is already running', () => {
    let run = createRun('t', STAGES, 0);
    run = startStage(run, 'render-views', 100);
    run = startStage(run, 'render-views', 500);

    expect(findStage(run, 'render-views')?.startedAt).toBe(100);
  });

  it('keeps the detail of an already closed stage', () => {
    let run = createRun('t', STAGES, 0);
    run = startStage(run, 'process-results', 10, '5 nodos');
    run = completeStage(run, 'process-results', 20);
    run = completeStage(run, 'process-results', 99, 'otro detalle');

    const stage = findStage(run, 'process-results')!;
    expect(stage.endedAt).toBe(20);
    expect(stage.detail).toBe('5 nodos');
  });

  it('closes a stage that never started with zero duration', () => {
    let run = createRun('t', STAGES, 0);
    run = completeStage(run, 'summary', 500, 'instantáneo');

    const stage = findStage(run, 'summary')!;
    expect(stage.status).toBe('done');
    expect(stageElapsedMs(stage, 900)).toBe(0);
  });

  it('updates the detail of a running stage', () => {
    let run = createRun('t', STAGES, 0);
    run = startStage(run, 'execute-query', 10);
    run = detailStage(run, 'execute-query', 'reintentando');

    expect(findStage(run, 'execute-query')?.detail).toBe('reintentando');
    expect(findStage(run, 'execute-query')?.status).toBe('active');
  });

  it('leaves the running stages in background and the pending ones untouched when the run ends', () => {
    let run = createRun('t', STAGES, 0);
    run = completeStage(run, 'fetch-dashboard', 10);
    run = startStage(run, 'summary', 20);
    run = endRun(run, 100);

    expect(findStage(run, 'fetch-dashboard')?.status).toBe('done');
    expect(findStage(run, 'summary')?.status).toBe('background');
    expect(findStage(run, 'render-views')?.status).toBe('pending');
    expect(isRunActive(run)).toBe(false);
    expect(runElapsedMs(run, 9999)).toBe(100);
  });

  it('does not reopen a run that already ended', () => {
    let run = createRun('t', STAGES, 0);
    run = endRun(run, 50);
    run = endRun(run, 80);

    expect(run.endedAt).toBe(50);
  });

  it('records the failed stage with its cause', () => {
    let run = createRun('t', STAGES, 0);
    run = startStage(run, 'execute-query', 10);
    run = failStage(run, 'execute-query', 60, 'backend no disponible');

    const stage = findStage(run, 'execute-query')!;
    expect(stage.status).toBe('failed');
    expect(stage.detail).toBe('backend no disponible');
    expect(stageElapsedMs(stage, 999)).toBe(50);
  });

  it('never overwrites a failure with a later completion', () => {
    let run = createRun('t', STAGES, 0);
    run = failStage(run, 'execute-query', 10, 'timeout');
    run = completeStage(run, 'execute-query', 20, 'ok');

    expect(findStage(run, 'execute-query')?.status).toBe('failed');
  });

  it('returns null elapsed for a stage that has not started', () => {
    const run = createRun('t', STAGES, 0);
    expect(stageElapsedMs(findStage(run, 'summary')!, 100)).toBeNull();
  });

  describe('formatDuration', () => {
    it.each([
      [0, '0 ms'],
      [350, '350 ms'],
      [999, '999 ms'],
      [1000, '1,0 s'],
      [12_340, '12,3 s'],
      [59_900, '59,9 s'],
      [60_000, '1 min'],
      [61_000, '1 min 1 s'],
      [125_000, '2 min 5 s'],
    ])('formats %i ms as %s', (ms, expected) => {
      expect(formatDuration(ms)).toBe(expected);
    });

    it('falls back to a dash for unknown durations', () => {
      expect(formatDuration(null)).toBe('—');
      expect(formatDuration(-1)).toBe('—');
      expect(formatDuration(Number.NaN)).toBe('—');
    });
  });
});
