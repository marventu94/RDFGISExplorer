import { Injectable, computed, inject, signal } from '@angular/core';

import {
  type LoadRun,
  type LoadStageId,
  completeStage,
  createRun,
  detailStage,
  endRun,
  failStage,
  findStage,
  isRunActive,
  startStage,
  withSubtitle,
} from '@shared/progress/load-stages';
import type { ViewType } from './dashboard-layout.service';
import { I18nService } from './i18n.service';

/** Cada cuánto se refresca el cronómetro del cartel. */
const TICK_MS = 200;

/**
 * Si alguna vista no reporta (vista sin datos que corta antes, error interno de
 * una librería), el cartel no puede quedarse colgado: se cierra igual pasado
 * este tiempo desde que se pintó la primera.
 */
const RENDER_GRACE_MS = 2500;

const VIEW_LABELS = Object.freeze({
  table: 'tabla',
  graph: 'grafo',
  map: 'mapa',
  timeline: 'línea de tiempo',
});

/**
 * Estado del cartel de carga del tablero: qué etapa del pipeline está corriendo
 * y cuánto lleva cada una.
 *
 * Lo maneja `DashboardStateService` (dueño de la hidratación); las vistas
 * y el panel de resumen solo **reportan** que terminaron lo suyo. Fuera de una
 * corrida activa todos los `report*` son no-ops, así el mismo instrumental sirve
 * cuando la query se ejecuta a mano desde el editor sin mostrar nada.
 */
@Injectable({ providedIn: 'root' })
export class DashboardLoadProgressService {
  private readonly i18n = inject(I18nService);
  private readonly _run = signal<LoadRun | null>(null);
  /** Reloj propio: las etapas vivas muestran el tiempo transcurrido. */
  private readonly _now = signal(Date.now());

  private ticker?: ReturnType<typeof setInterval>;
  private renderGraceTimer?: ReturnType<typeof setTimeout>;
  private expectedViews: readonly ViewType[] = [];
  private readonly renderedViews = new Set<ViewType>();

  readonly run = this._run.asReadonly();
  readonly now = this._now.asReadonly();
  /** El cartel se muestra mientras la corrida no esté cerrada. */
  readonly active = computed(() => isRunActive(this._run()));

  begin(title: string, stages: readonly LoadStageId[], subtitle?: string): void {
    this.clearTimers();
    this.renderedViews.clear();
    this.expectedViews = [];
    const now = Date.now();
    this._now.set(now);
    this._run.set(createRun(title, stages, now, subtitle));
    this.ticker = setInterval(() => this._now.set(Date.now()), TICK_MS);
  }

  setSubtitle(subtitle: string): void {
    this.update((run) => withSubtitle(run, subtitle));
  }

  start(id: LoadStageId, detail?: string): void {
    this.update((run) => startStage(run, id, Date.now(), detail));
  }

  detail(id: LoadStageId, detail: string): void {
    this.update((run) => detailStage(run, id, detail));
  }

  complete(id: LoadStageId, detail?: string): void {
    this.update((run) => completeStage(run, id, Date.now(), detail));
  }

  /** Marca la etapa como fallida y cierra la corrida (el error lo informa quien la maneja). */
  fail(id: LoadStageId, detail?: string): void {
    this.update((run) => endRun(failStage(run, id, Date.now(), detail), Date.now()));
    this.clearTimers();
  }

  /**
   * Falla la etapa que estaba corriendo (o la primera pendiente si el error
   * llegó entre dos etapas). Quien la llama no necesita saber en qué punto
   * del pipeline se rompió.
   */
  failActive(detail?: string): void {
    const run = this._run();
    if (!isRunActive(run)) return;
    const stage =
      run.stages.find((s) => s.status === 'active') ??
      run.stages.find((s) => s.status === 'pending');
    if (!stage) {
      this.finish();
      return;
    }
    this.fail(stage.id, detail);
  }

  /**
   * Declara qué vistas tienen que pintar antes de considerar cargado el tablero
   * (las del layout del tablero, no las 4 siempre). Arranca el margen de gracia.
   */
  expectViews(views: readonly ViewType[]): void {
    if (!this.active()) return;
    this.expectedViews = views;
    this.armRenderGrace();
    this.checkRenderDone();
  }

  /**
   * Una vista terminó de aplicar el resultado nuevo. Es también la señal de que
   * el pipeline de datos (filtros + lote visible) ya produjo su salida, así que
   * cierra "Procesando resultados".
   */
  reportViewRendered(view: ViewType): void {
    if (!this.active()) return;
    this.renderedViews.add(view);
    this.complete('process-results');
    this.start('render-views');
    this.armRenderGrace();
    this.checkRenderDone();
  }

  reportSummaryStart(scope: 'local' | 'backend'): void {
    if (!this.active()) return;
    this.start(
      'summary',
      this.i18n.text(scope === 'local' ? 'agregando en el navegador' : 'agregando en el endpoint'),
    );
  }

  reportSummaryDone(detail?: string): void {
    if (!this.active()) return;
    this.complete('summary', detail);
  }

  /** Cierra la corrida: el tablero ya es usable (lo que siga queda en segundo plano). */
  finish(): void {
    this.update((run) => endRun(run, Date.now()));
    this.clearTimers();
  }

  private checkRenderDone(): void {
    if (this.expectedViews.length === 0) return;
    if (!this.expectedViews.every((v) => this.renderedViews.has(v))) return;
    this.complete('render-views', this.renderedLabel());
    this.finish();
  }

  private armRenderGrace(): void {
    if (this.renderGraceTimer !== undefined) clearTimeout(this.renderGraceTimer);
    this.renderGraceTimer = setTimeout(() => {
      if (!this.active()) return;
      this.complete('render-views', this.renderedLabel());
      this.finish();
    }, RENDER_GRACE_MS);
  }

  private renderedLabel(): string {
    const painted = this.expectedViews.filter((v) => this.renderedViews.has(v));
    if (painted.length === 0) return this.i18n.text('sin vistas para pintar');
    return painted.map((v) => this.i18n.text(VIEW_LABELS[v])).join(', ');
  }

  private update(fn: (run: LoadRun) => LoadRun): void {
    const run = this._run();
    if (!isRunActive(run)) return;
    this._now.set(Date.now());
    this._run.set(fn(run));
  }

  private clearTimers(): void {
    if (this.ticker !== undefined) clearInterval(this.ticker);
    if (this.renderGraceTimer !== undefined) clearTimeout(this.renderGraceTimer);
    this.ticker = undefined;
    this.renderGraceTimer = undefined;
  }

  /** Solo para tests/depuración: estado de una etapa de la corrida en curso. */
  stageStatus(id: LoadStageId) {
    const run = this._run();
    return run ? findStage(run, id)?.status : undefined;
  }
}
