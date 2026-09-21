import { Pipe, PipeTransform, inject } from '@angular/core';
import type { UiTextKey } from '@rdfgis/platform-bridge';
import { I18nService } from './i18n.service';

@Pipe({ name: 'translate', standalone: true, pure: false })
export class TranslatePipe implements PipeTransform {
  private readonly i18n = inject(I18nService);

  transform(key: UiTextKey): string {
    return this.i18n.text(key);
  }
}
