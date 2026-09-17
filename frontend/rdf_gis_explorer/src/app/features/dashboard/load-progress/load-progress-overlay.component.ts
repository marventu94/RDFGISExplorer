import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

import { DashboardLoadProgressService } from '@core/services/dashboard-load-progress.service';
import {
  type LoadStage,
  formatDuration,
  runElapsedMs,
  stageElapsedMs,
} from '@shared/progress/load-stages';

/** A partir de acá se avisa que la espera larga es esperable, no un cuelgue. */
const SLOW_HINT_MS = 8000;

/**
 * Cartel de carga del tablero: reemplaza el spinner mudo de "Cargando tablero…"
 * por la lista de etapas del pipeline con su duración real, para que se vea si
 * el tiempo se va en el endpoint SPARQL o en el navegador.
 *
 * Solo pinta lo que le pasa `DashboardLoadProgressService`; no conoce el flujo
 * de hidratación.
 */
@Component({
  selector: 'app-load-progress-overlay',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatIconModule, MatProgressSpinnerModule],
  template: `
    @if (visibleRun(); as run) {
      <div class="loader" role="status" aria-live="polite">
        <div class="card">
          <header class="card-header">
            <div class="titles">
              <h2>{{ run.title }}</h2>
              @if (run.subtitle) {
                <p class="subtitle">{{ run.subtitle }}</p>
              }
            </div>
            <span class="total" [attr.aria-label]="'Tiempo total ' + totalElapsed()">
              {{ totalElapsed() }}
            </span>
          </header>

          <ol class="stages">
            @for (stage of run.stages; track stage.id) {
              <li class="stage" [class]="'stage stage--' + stage.status">
                <span class="stage-icon">
                  @switch (stage.status) {
                    @case ('active') {
                      <mat-spinner diameter="16" />
                    }
                    @case ('done') {
                      <mat-icon>check_circle</mat-icon>
                    }
                    @case ('failed') {
                      <mat-icon>error</mat-icon>
                    }
                    @case ('background') {
                      <mat-icon>hourglass_top</mat-icon>
                    }
                    @default {
                      <mat-icon>radio_button_unchecked</mat-icon>
                    }
                  }
                </span>
                <span class="stage-body">
                  <span class="stage-label">{{ stage.label }}</span>
                  @if (stage.detail) {
                    <span class="stage-detail">{{ stage.detail }}</span>
                  }
                  @if (stage.status === 'background') {
                    <span class="stage-detail">sigue en segundo plano</span>
                  }
                </span>
                <span class="stage-time">{{ elapsed(stage) }}</span>
              </li>
            }
          </ol>

          @if (showSlowHint()) {
            <p class="hint">
              Las consultas sobre grafos grandes pueden tardar varios minutos: el tablero
              se arma recién cuando el endpoint contesta.
            </p>
          }
        </div>
      </div>
    }
  `,
  styles: [
    `
      .loader {
        position: fixed;
        inset: 0;
        z-index: 9999;
        display: flex;
        align-items: center;
        justify-content: center;
        background: rgba(255, 255, 255, 0.9);
        backdrop-filter: blur(4px);
      }

      .card {
        min-width: 380px;
        max-width: 520px;
        padding: 24px;
        border-radius: 12px;
        background: var(--mat-sys-surface, #fff);
        color: var(--mat-sys-on-surface);
        box-shadow: 0 8px 28px rgba(0, 0, 0, 0.18);
      }

      .card-header {
        display: flex;
        align-items: flex-start;
        gap: 16px;
        margin-bottom: 16px;
      }

      .titles {
        flex: 1;
        min-width: 0;
      }

      h2 {
        margin: 0;
        font-size: 16px;
        font-weight: 500;
      }

      .subtitle {
        margin: 2px 0 0;
        font-size: 13px;
        color: var(--mat-sys-on-surface-variant);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .total {
        font-variant-numeric: tabular-nums;
        font-size: 13px;
        color: var(--mat-sys-on-surface-variant);
        padding-top: 2px;
      }

      .stages {
        list-style: none;
        margin: 0;
        padding: 0;
        display: flex;
        flex-direction: column;
        gap: 10px;
      }

      .stage {
        display: flex;
        align-items: flex-start;
        gap: 10px;
      }

      .stage-icon {
        width: 18px;
        height: 18px;
        display: flex;
        align-items: center;
        justify-content: center;
        flex: none;
      }

      .stage-icon .mat-icon {
        font-size: 18px;
        width: 18px;
        height: 18px;
      }

      .stage-body {
        flex: 1;
        min-width: 0;
        display: flex;
        flex-direction: column;
      }

      .stage-label {
        font-size: 14px;
        line-height: 18px;
      }

      .stage-detail {
        font-size: 12px;
        line-height: 16px;
        color: var(--mat-sys-on-surface-variant);
      }

      .stage-time {
        font-size: 12px;
        line-height: 18px;
        font-variant-numeric: tabular-nums;
        color: var(--mat-sys-on-surface-variant);
        flex: none;
      }

      /* Pendiente: apagada, para que la etapa viva sea la que se lee primero. */
      .stage--pending .stage-label,
      .stage--pending .stage-icon {
        opacity: 0.45;
      }

      .stage--active .stage-label {
        font-weight: 500;
      }

      .stage--done .stage-icon {
        color: var(--mat-sys-primary, #1976d2);
      }

      .stage--failed .stage-icon,
      .stage--failed .stage-label {
        color: var(--mat-sys-error, #b3261e);
      }

      .hint {
        margin: 16px 0 0;
        font-size: 12px;
        line-height: 16px;
        color: var(--mat-sys-on-surface-variant);
      }
    `,
  ],
})
export class LoadProgressOverlayComponent {
  protected readonly progress = inject(DashboardLoadProgressService);

  /** La corrida solo se muestra mientras esté abierta; al cerrarse el cartel se va. */
  protected readonly visibleRun = computed(() =>
    this.progress.active() ? this.progress.run() : null,
  );

  protected readonly totalElapsed = computed(() => {
    const run = this.progress.run();
    return run ? formatDuration(runElapsedMs(run, this.progress.now())) : '';
  });

  protected readonly showSlowHint = computed(() => {
    const run = this.progress.run();
    return !!run && runElapsedMs(run, this.progress.now()) >= SLOW_HINT_MS;
  });

  protected elapsed(stage: LoadStage): string {
    const ms = stageElapsedMs(stage, this.progress.now());
    return ms === null ? '' : formatDuration(ms);
  }
}
