import { Component, DestroyRef, inject, signal } from '@angular/core';
import { applyTheme, explorerApiBase, getTheme, onThemeChange, setTheme, type Theme } from '@rdfgis/platform-bridge';
import { I18nService } from './i18n.service';

@Component({
  selector: 'app-theme-toggle',
  standalone: true,
  template: `@if (standalone) {<button type="button" class="theme-toggle" (click)="toggle()"
    [attr.aria-label]="label()"
    [attr.title]="title()"><span aria-hidden="true">{{ theme() === 'dark' ? '☀' : '☾' }}</span></button>}`,
  styles: `.theme-toggle{display:grid;place-items:center;width:2rem;height:2rem;padding:0;border:1px solid var(--explorer-input-border);border-radius:5px;background:var(--explorer-input-bg);color:var(--explorer-text);font-size:1.1rem;cursor:pointer}.theme-toggle:hover{background:var(--explorer-toolbar-btn-hover-bg)}.theme-toggle:focus-visible{outline:2px solid var(--explorer-link);outline-offset:2px}`,
})
export class ThemeToggleComponent {
  private readonly i18n = inject(I18nService);
  readonly standalone = explorerApiBase('rdf') === '/api';
  readonly theme = signal<Theme>(getTheme());
  constructor() {
    applyTheme(this.theme());
    const stop = onThemeChange((theme) => this.theme.set(theme));
    inject(DestroyRef).onDestroy(stop);
  }
  toggle(): void { setTheme(this.theme() === 'dark' ? 'light' : 'dark'); }
  label(): string { return this.i18n.text(this.theme() === 'dark' ? 'Activar tema claro' : 'Activar tema oscuro'); }
  title(): string { return this.i18n.text(this.theme() === 'dark' ? 'Tema claro' : 'Tema oscuro'); }
}
