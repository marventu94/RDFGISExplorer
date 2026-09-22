import { Component, inject } from '@angular/core';
import { explorerApiBase, type Language } from '@rdfgis/platform-bridge';
import { I18nService } from './i18n.service';

@Component({
  selector: 'app-language-selector',
  standalone: true,
  template: `
    @if (standalone) {
      <label class="language">
        <span>{{ i18n.text('Idioma') }}</span>
        <select
          [value]="i18n.language()"
          (change)="change($event)"
          [attr.aria-label]="i18n.text('Idioma')"
        >
          <option value="es">ES</option>
          <option value="en">EN</option>
        </select>
      </label>
    }
  `,
  styles: `
    .language {
      display: flex;
      align-items: center;
      gap: 0.35rem;
      padding: 0.3rem 0.45rem;
      border: 1px solid var(--mat-sys-outline-variant);
      border-radius: 5px;
      background: transparent;
      color: var(--mat-sys-on-surface);
      font-size: 0.8rem;
    }

    .language select {
      border: 0;
      background: transparent;
      color: inherit;
    }
  `,
})
export class LanguageSelectorComponent {
  readonly i18n = inject(I18nService);
  readonly standalone = explorerApiBase('gis') === '/api';

  change(event: Event): void {
    this.i18n.set((event.target as HTMLSelectElement).value as Language);
  }
}
