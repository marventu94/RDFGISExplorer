import { Injectable, OnDestroy, signal } from '@angular/core';
import {
  getLanguage,
  onLanguageChange,
  setLanguage,
  translateUiText,
  type Language,
  type UiTextKey,
} from '@rdfgis/platform-bridge';

@Injectable({ providedIn: 'root' })
export class I18nService implements OnDestroy {
  readonly language = signal<Language>(getLanguage());
  private readonly unsubscribe = onLanguageChange((language) => this.apply(language));
  constructor() {
    this.apply(this.language());
  }

  set(language: Language): void {
    setLanguage(language);
  }

  text(key: UiTextKey): string {
    return translateUiText(key, this.language());
  }

  formatNumber(value: number, options?: Intl.NumberFormatOptions): string {
    return new Intl.NumberFormat(this.locale, options).format(value);
  }

  formatDate(value: Date | string | number, options?: Intl.DateTimeFormatOptions): string {
    return new Intl.DateTimeFormat(this.locale, options).format(new Date(value));
  }

  ngOnDestroy(): void {
    this.unsubscribe();
  }

  private get locale(): 'es-AR' | 'en-US' {
    return this.language() === 'es' ? 'es-AR' : 'en-US';
  }

  private apply(language: Language): void {
    this.language.set(language);
    if (typeof document !== 'undefined') {
      document.documentElement.lang = language;
    }
  }
}
