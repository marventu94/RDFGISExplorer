import { TestBed } from '@angular/core/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { beforeEach, describe, expect, it } from 'vitest';

import { LoadProgressOverlayComponent } from './load-progress-overlay.component';
import { DashboardLoadProgressService } from '@core/services/dashboard-load-progress.service';
import type { LoadStageId } from '@shared/progress/load-stages';
import { I18nService } from '@core/services/i18n.service';

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
    progress.begin('Cargando tablero', STAGES, 'WWII battles');

    const el = render();
    const labels = Array.from(el.querySelectorAll('.stage-label')).map((n) => n.textContent?.trim());

    expect(el.querySelector('h2')?.textContent).toContain('Cargando tablero');
    expect(el.querySelector('.subtitle')?.textContent).toContain('WWII battles');
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
    // The next stage has not started, so it appears inactive without a duration.
    expect(el.querySelector('.stage--pending .stage-time')?.textContent?.trim()).toBe('');
  });

  it('renders the complete loading flow in English without translating dashboard names', () => {
    TestBed.inject(I18nService).set('en');
    progress.begin('Cargando tablero', STAGES, 'Batallas de usuario');
    progress.complete('fetch-dashboard', 'layout and filters restored · 2 views');
    progress.start('execute-query', 'waiting for the SPARQL endpoint response');

    const el = render();
    const text = el.textContent ?? '';
    expect(text).toContain('Loading dashboard');
    expect(text).toContain('Retrieving dashboard');
    expect(text).toContain('Running query');
    expect(text).toContain('Processing results');
    expect(text).toContain('Calculating summary');
    expect(text).toContain('Rendering views');
    expect(text).toContain('Batallas de usuario');
    expect(text).not.toContain('Cargando tablero');
    expect(el.querySelector('.total')?.getAttribute('aria-label')).toMatch(/^Total time /);
    TestBed.inject(I18nService).set('es');
  });

  it('hides itself when the run closes', () => {
    progress.begin('Cargando tablero', STAGES);
    progress.finish();

    expect(render().querySelector('.loader')).toBeNull();
  });
});
