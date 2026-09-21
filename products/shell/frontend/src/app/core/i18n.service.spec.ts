import { TestBed } from '@angular/core/testing';
import { LANGUAGE_STORAGE_KEY, setLanguage } from '@rdfgis/platform-bridge';
import { I18nService } from './i18n.service';
import { LanguageSelectorComponent } from './language-selector.component';

describe('shell internationalization', () => {
  beforeEach(() => { localStorage.clear(); TestBed.configureTestingModule({}); });
  it('defaults to Spanish and translates shell copy', () => {
    const service = TestBed.inject(I18nService);
    expect(service.language()).toBe('es');
    expect(service.text('Recent dashboards')).toBe('Tableros recientes');
  });
  it('persists and propagates a runtime selection', () => {
    const service = TestBed.inject(I18nService);
    setLanguage('en');
    expect(service.language()).toBe('en');
    expect(localStorage.getItem(LANGUAGE_STORAGE_KEY)).toBe('en');
  });
  it('offers a working selector', () => {
    const fixture = TestBed.createComponent(LanguageSelectorComponent);
    fixture.detectChanges();
    const select = fixture.nativeElement.querySelector('select') as HTMLSelectElement;
    select.value = 'en'; select.dispatchEvent(new Event('change')); fixture.detectChanges();
    expect(TestBed.inject(I18nService).language()).toBe('en');
  });
});
