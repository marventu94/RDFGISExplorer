import { Component, DestroyRef, inject, signal } from '@angular/core';
import { applyTheme, getTheme, onThemeChange, setTheme, type Theme } from '@rdfgis/platform-bridge';
import { I18nService } from './i18n.service';

@Component({
  selector: 'app-theme-toggle',
  standalone: true,
  template: `<button type="button" class="theme-toggle" (click)="toggle()"
    [attr.aria-label]="label()"
    [attr.title]="title()">
    <span aria-hidden="true">{{ theme() === 'dark' ? '☀' : '☾' }}</span>
  </button>`,
  styles: `.theme-toggle{display:grid;place-items:center;width:2rem;height:2rem;padding:0;border:1px solid var(--color-border-strong);border-radius:6px;background:transparent;color:var(--color-text);font-size:1.1rem;cursor:pointer}.theme-toggle:hover{background:var(--color-bg-hover)}.theme-toggle:focus-visible{outline:2px solid var(--color-accent);outline-offset:2px}`,
})
export class ThemeToggleComponent {
  private readonly i18n = inject(I18nService);
  readonly theme = signal<Theme>(getTheme());

  constructor() {
    applyTheme(this.theme());
    const stop = onThemeChange((theme) => this.theme.set(theme));
    inject(DestroyRef).onDestroy(stop);
  }

  toggle(): void {
    setTheme(this.theme() === 'dark' ? 'light' : 'dark');
  }

  label(): string {
    return this.i18n.text(this.theme() === 'dark' ? 'Activar tema claro' : 'Activar tema oscuro');
  }

  title(): string {
    return this.i18n.text(this.theme() === 'dark' ? 'Tema claro' : 'Tema oscuro');
  }
}
