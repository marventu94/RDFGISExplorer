import { TestBed } from '@angular/core/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { beforeEach, describe, expect, it } from 'vitest';

import { LoadProgressOverlayComponent } from './load-progress-overlay.component';
import { DashboardLoadProgressService } from '@core/services/dashboard-load-progress.service';
import type { LoadStageId } from '@shared/progress/load-stages';

const STAGES: readonly LoadStageId[] = [
  'fetch-dashboard',
  'execute-query',
  'process-results',
  'summary',
  'render-views',
];

describe('LoadProgressOverlayComponent', () => {
  let progress: DashboardLoadProgressService;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [LoadProgressOverlayComponent, NoopAnimationsModule],
    }).compileComponents();
    progress = TestBed.inject(DashboardLoadProgressService);
  });

  function render(): HTMLElement {
    const fixture = TestBed.createComponent(LoadProgressOverlayComponent);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('shows nothing while no dashboard is loading', () => {
    expect(render().querySelector('.loader')).toBeNull();
  });

  it('lists every stage with the dashboard name', () => {
    progress.begin('Cargando tablero', STAGES, 'Batallas WWII');

    const el = render();
    const labels = Array.from(el.querySelectorAll('.stage-label')).map((n) => n.textContent?.trim());

    expect(el.querySelector('h2')?.textContent).toContain('Cargando tablero');
    expect(el.querySelector('.subtitle')?.textContent).toContain('Batallas WWII');
    expect(labels).toEqual([
      'Recuperando el tablero',
      'Ejecutando la consulta',
      'Procesando resultados',
      'Calculando resumen',
      'Renderizando vistas',
    ]);
  });

  it('marks the running stage and shows its detail', () => {
    progress.begin('Cargando tablero', STAGES);
    progress.complete('fetch-dashboard', 'layout y filtros restaurados · 2 vistas');
    progress.start('execute-query', 'esperando la respuesta del endpoint SPARQL');

    const el = render();

    expect(el.querySelector('.stage--done .stage-label')?.textContent?.trim()).toBe(
      'Recuperando el tablero',
    );
    expect(el.querySelector('.stage--active .stage-label')?.textContent?.trim()).toBe(
      'Ejecutando la consulta',
    );
    expect(el.querySelector('.stage--active .stage-detail')?.textContent).toContain(
      'endpoint SPARQL',
    );
    // La que sigue todavía no arrancó: se muestra apagada y sin tiempo.
    expect(el.querySelector('.stage--pending .stage-time')?.textContent?.trim()).toBe('');
  });

  it('hides itself when the run closes', () => {
    progress.begin('Cargando tablero', STAGES);
    progress.finish();

    expect(render().querySelector('.loader')).toBeNull();
  });
});
