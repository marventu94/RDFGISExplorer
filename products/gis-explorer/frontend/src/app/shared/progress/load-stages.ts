/**
 * Modelo puro del progreso de carga de un tablero (sin Angular, testeable).
 *
 * El spinner único de "Cargando tablero…" no distinguía entre esperar al
 * endpoint SPARQL (potencialmente minutos) y pintar las vistas (milisegundos). Acá
 * se modelan las etapas reales del pipeline de hidratación para que el cartel
 * diga en qué se está yendo el tiempo.
 *
 * Las funciones son reducers inmutables: devuelven un `LoadRun` nuevo, así el
 * signal que lo expone dispara change detection.
 */

export type LoadStageId =
  'fetch-dashboard' | 'execute-query' | 'process-results' | 'summary' | 'render-views';

/**
 * `background`: la etapa seguía corriendo cuando el tablero ya era usable y se
 * la dejó terminar sin bloquear (hoy solo el resumen del backend).
 */
export type LoadStageStatus = 'pending' | 'active' | 'done' | 'failed' | 'background';

export interface LoadStage {
  readonly id: LoadStageId;
  readonly label: string;
  readonly status: LoadStageStatus;
  /** Línea secundaria: qué se está haciendo o qué se obtuvo. */
  readonly detail?: string;
  readonly startedAt?: number;
  readonly endedAt?: number;
}

export interface LoadRun {
  readonly title: string;
  /** Nombre del tablero, si ya se conoce cuando arranca la corrida. */
  readonly subtitle?: string;
  readonly stages: readonly LoadStage[];
  readonly startedAt: number;
  readonly endedAt?: number;
}

export const STAGE_LABELS: Readonly<Record<LoadStageId, string>> = Object.freeze({
  'fetch-dashboard': 'Recuperando el tablero',
  'execute-query': 'Ejecutando la consulta',
  'process-results': 'Procesando resultados',
  summary: 'Calculando resumen',
  'render-views': 'Renderizando vistas',
});

export function createRun(
  title: string,
  ids: readonly LoadStageId[],
  now: number,
  subtitle?: string,
): LoadRun {
  return {
    title,
    ...(subtitle ? { subtitle } : {}),
    startedAt: now,
    stages: ids.map((id) => ({ id, label: STAGE_LABELS[id], status: 'pending' as const })),
  };
}

export function withSubtitle(run: LoadRun, subtitle: string): LoadRun {
  return { ...run, subtitle };
}

export function findStage(run: LoadRun, id: LoadStageId): LoadStage | undefined {
  return run.stages.find((s) => s.id === id);
}

function patchStage(
  run: LoadRun,
  id: LoadStageId,
  patch: (stage: LoadStage) => LoadStage,
): LoadRun {
  let touched = false;
  const stages = run.stages.map((stage) => {
    if (stage.id !== id) return stage;
    touched = true;
    return patch(stage);
  });
  return touched ? { ...run, stages } : run;
}

/** Arranca la etapa. Si ya estaba corriendo o terminada no la reinicia. */
export function startStage(run: LoadRun, id: LoadStageId, now: number, detail?: string): LoadRun {
  return patchStage(run, id, (stage) =>
    stage.status === 'pending'
      ? { ...stage, status: 'active', startedAt: now, ...(detail ? { detail } : {}) }
      : detail
        ? { ...stage, detail }
        : stage,
  );
}

/** Actualiza solo la línea secundaria de una etapa. */
export function detailStage(run: LoadRun, id: LoadStageId, detail: string): LoadRun {
  return patchStage(run, id, (stage) => ({ ...stage, detail }));
}

/**
 * Cierra la etapa como exitosa. Una etapa que nunca arrancó se cierra con
 * duración cero (p. ej. el resumen local, instantáneo).
 */
export function completeStage(
  run: LoadRun,
  id: LoadStageId,
  now: number,
  detail?: string,
): LoadRun {
  return patchStage(run, id, (stage) => {
    if (stage.status === 'done' || stage.status === 'failed') return stage;
    return {
      ...stage,
      status: 'done',
      startedAt: stage.startedAt ?? now,
      endedAt: now,
      ...(detail ? { detail } : {}),
    };
  });
}

export function failStage(run: LoadRun, id: LoadStageId, now: number, detail?: string): LoadRun {
  return patchStage(run, id, (stage) => ({
    ...stage,
    status: 'failed',
    startedAt: stage.startedAt ?? now,
    endedAt: now,
    ...(detail ? { detail } : {}),
  }));
}

/**
 * Cierra la corrida. Las etapas que seguían activas quedan marcadas como
 * `background` (siguen corriendo, pero ya no bloquean el tablero); las que
 * nunca arrancaron quedan `pending` — no se inventa que se hicieron.
 */
export function endRun(run: LoadRun, now: number): LoadRun {
  if (run.endedAt !== undefined) return run;
  return {
    ...run,
    endedAt: now,
    stages: run.stages.map((stage) =>
      stage.status === 'active' ? { ...stage, status: 'background' as const } : stage,
    ),
  };
}

export function isRunActive(run: LoadRun | null): run is LoadRun {
  return run !== null && run.endedAt === undefined;
}

/** Duración de la etapa: la final si terminó, la transcurrida si sigue viva. */
export function stageElapsedMs(stage: LoadStage, now: number): number | null {
  if (stage.startedAt === undefined) return null;
  return (stage.endedAt ?? now) - stage.startedAt;
}

export function runElapsedMs(run: LoadRun, now: number): number {
  return (run.endedAt ?? now) - run.startedAt;
}

/** Duración en castellano, con la unidad que corresponde a la magnitud. */
export function formatDuration(ms: number | null): string {
  if (ms === null || !Number.isFinite(ms) || ms < 0) return '—';
  if (ms < 1000) return `${Math.round(ms)} ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1).replace('.', ',')} s`;
  const totalSec = Math.round(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return sec === 0 ? `${min} min` : `${min} min ${sec} s`;
}
