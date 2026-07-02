import { Component, signal, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { getAutoRunHandoff, setAutoRunHandoff } from '../../core/handoff-settings';
import { ThemeService, type Theme } from '../../core/theme.service';

@Component({
  selector: 'app-settings-page',
  standalone: true,
  imports: [RouterLink, FormsModule],
  template: `
    <div class="settings-page">
      <a routerLink="/" class="settings-page__back">← Volver al inicio</a>
      <h1 class="settings-page__title">Configuración</h1>

      <section class="settings-section">
        <h2 class="settings-section__title">Apariencia</h2>
        <div class="settings-theme-row" role="radiogroup" aria-label="Tema de la interfaz">
          <button
            type="button"
            class="settings-theme-card"
            [class.settings-theme-card--active]="theme.theme() === 'light'"
            [attr.aria-pressed]="theme.theme() === 'light'"
            (click)="theme.setTheme('light')"
          >
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <circle cx="12" cy="12" r="4" />
              <path d="M12 2v2" />
              <path d="M12 20v2" />
              <path d="m4.93 4.93 1.41 1.41" />
              <path d="m17.66 17.66 1.41 1.41" />
              <path d="M2 12h2" />
              <path d="M20 12h2" />
              <path d="m6.34 17.66-1.41 1.41" />
              <path d="m19.07 4.93-1.41 1.41" />
            </svg>
            <span>Claro</span>
          </button>
          <button
            type="button"
            class="settings-theme-card"
            [class.settings-theme-card--active]="theme.theme() === 'dark'"
            [attr.aria-pressed]="theme.theme() === 'dark'"
            (click)="theme.setTheme('dark')"
          >
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
            </svg>
            <span>Oscuro</span>
          </button>
        </div>
      </section>

      <section class="settings-section">
        <h2 class="settings-section__title">Handoff</h2>
        <label class="settings-row">
          <input
            type="checkbox"
            [ngModel]="autoRunHandoff()"
            (ngModelChange)="onAutoRunChange($event)"
          />
          <span>Ejecutar query automáticamente al recibir handoff desde Explorer</span>
        </label>
      </section>

      <section class="settings-section">
        <h2 class="settings-section__title">Backend</h2>
        <label class="settings-row">
          <span>URL base del backend API</span>
          <input
            type="url"
            class="settings-input"
            [ngModel]="backendUrl()"
            (ngModelChange)="onBackendUrlChange($event)"
            placeholder="http://localhost:3000"
          />
        </label>
      </section>
    </div>
  `,
  styles: `
    .settings-page {
      max-width: 640px;
      margin: 0 auto;
      padding: 2rem 1.5rem;
    }
    .settings-page__back {
      display: inline-block;
      margin-bottom: 1rem;
      color: var(--color-accent);
      text-decoration: none;
      font-size: 0.9rem;
    }
    .settings-page__back:hover {
      text-decoration: underline;
    }
    .settings-page__title {
      font-size: 1.5rem;
      font-weight: 600;
      margin: 0 0 1.5rem;
      color: var(--color-text);
    }
    .settings-section {
      background: var(--color-bg-elevated);
      border: 1px solid var(--color-border);
      border-radius: 8px;
      padding: 1.25rem;
      margin-bottom: 1rem;
    }
    .settings-section__title {
      font-size: 1rem;
      font-weight: 600;
      margin: 0 0 0.75rem;
      color: var(--color-text);
    }
    .settings-theme-row {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 0.75rem;
    }
    .settings-theme-card {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 0.5rem;
      padding: 1rem;
      border: 1px solid var(--color-border);
      border-radius: 8px;
      background: var(--color-bg);
      color: var(--color-text);
      cursor: pointer;
      transition: border-color 0.15s, background-color 0.15s;
    }
    .settings-theme-card:hover {
      border-color: var(--color-accent);
    }
    .settings-theme-card--active {
      border-color: var(--color-accent);
      background: var(--color-accent-soft);
      color: var(--color-accent);
    }
    .settings-row {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      font-size: 0.9rem;
      color: var(--color-text-muted);
      flex-wrap: wrap;
    }
    .settings-row input[type="checkbox"] {
      width: 18px;
      height: 18px;
      cursor: pointer;
    }
    .settings-input {
      flex: 1 1 100%;
      margin-top: 0.5rem;
      padding: 0.5rem 0.75rem;
      border: 1px solid var(--color-border);
      border-radius: 6px;
      font-size: 0.9rem;
      background: var(--color-bg);
      color: var(--color-text);
      min-width: 0;
    }
  `,
})
export class SettingsPageComponent {
  protected readonly theme = inject(ThemeService);

  readonly autoRunHandoff = signal(getAutoRunHandoff());
  readonly backendUrl = signal(localStorage.getItem('platform.settings.backendUrl') ?? 'http://localhost:3000');

  onAutoRunChange(value: boolean): void {
    this.autoRunHandoff.set(value);
    setAutoRunHandoff(value);
  }

  onBackendUrlChange(value: string): void {
    this.backendUrl.set(value);
    localStorage.setItem('platform.settings.backendUrl', value);
  }
}
