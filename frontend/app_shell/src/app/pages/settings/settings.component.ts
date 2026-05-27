import { Component, signal, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { getAutoRunHandoff, setAutoRunHandoff } from '../../core/handoff-settings';

@Component({
  selector: 'app-settings-page',
  standalone: true,
  imports: [RouterLink, FormsModule],
  template: `
    <div class="settings-page">
      <a routerLink="/" class="settings-page__back">← Volver al inicio</a>
      <h1 class="settings-page__title">Configuración</h1>

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
      color: #1a73e8;
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
      color: #333;
    }
    .settings-section {
      background: #fff;
      border: 1px solid #e0e0e0;
      border-radius: 8px;
      padding: 1.25rem;
      margin-bottom: 1rem;
    }
    .settings-section__title {
      font-size: 1rem;
      font-weight: 600;
      margin: 0 0 0.75rem;
      color: #444;
    }
    .settings-row {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      font-size: 0.9rem;
      color: #555;
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
      border: 1px solid #ccc;
      border-radius: 6px;
      font-size: 0.9rem;
      min-width: 0;
    }
  `,
})
export class SettingsPageComponent {
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
