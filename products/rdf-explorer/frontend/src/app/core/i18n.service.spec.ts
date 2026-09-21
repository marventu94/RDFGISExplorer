import { TestBed } from '@angular/core/testing';
import { LANGUAGE_STORAGE_KEY, setLanguage } from '@rdfgis/platform-bridge';
import { I18nService } from './i18n.service';
describe('RDF Explorer internationalization', () => {
  beforeEach(() => { localStorage.clear(); TestBed.configureTestingModule({}); });
  it('uses Spanish as fallback and translates representative Explorer copy', () => {
    const service = TestBed.inject(I18nService);
    expect(service.language()).toBe('es');
    expect(service.text('Copy URI')).toBe('Copiar URI');
  });
  it('reacts to the shared channel and persists the choice', () => {
    const service = TestBed.inject(I18nService); setLanguage('en');
    expect(service.language()).toBe('en');
    expect(localStorage.getItem(LANGUAGE_STORAGE_KEY)).toBe('en');
    expect(service.text('Guardar workspace')).toBe('Save workspace');
  });
});
