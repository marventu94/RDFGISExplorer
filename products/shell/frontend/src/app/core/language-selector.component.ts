import { Component, inject } from '@angular/core';
import { I18nService } from './i18n.service';
import type { Language } from '@rdfgis/platform-bridge';

@Component({
  selector: 'app-language-selector', standalone: true,
  template: `<label class="language"><span>{{ i18n.text('Idioma') }}</span><select [value]="i18n.language()" (change)="change($event)" [attr.aria-label]="i18n.text('Idioma')"><option value="es">ES</option><option value="en">EN</option></select></label>`,
  styles: `.language{display:flex;align-items:center;gap:.35rem;font-size:.8rem}.language select{border:1px solid currentColor;border-radius:4px;background:transparent;color:inherit;padding:.2rem .3rem}`,
})
export class LanguageSelectorComponent {
  readonly i18n = inject(I18nService);
  change(event: Event): void { this.i18n.set((event.target as HTMLSelectElement).value as Language); }
}
