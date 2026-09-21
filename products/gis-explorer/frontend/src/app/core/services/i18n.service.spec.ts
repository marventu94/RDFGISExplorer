import { TestBed } from '@angular/core/testing';
import { LANGUAGE_STORAGE_KEY, setLanguage } from '@rdfgis/platform-bridge';
import { I18nService } from './i18n.service';
describe('GIS Explorer internationalization', () => {
  beforeEach(() => { localStorage.clear(); TestBed.configureTestingModule({}); });
  it('uses Spanish as fallback and translates representative GIS copy', () => {
    const service = TestBed.inject(I18nService);
    expect(service.language()).toBe('es');
    expect(service.text('Export Excel')).toBe('Exportar Excel');
  });
  it('reacts to the shared channel, persists, and localizes formats', () => {
    const service = TestBed.inject(I18nService); setLanguage('en');
    expect(service.language()).toBe('en');
    expect(localStorage.getItem(LANGUAGE_STORAGE_KEY)).toBe('en');
    expect(service.formatNumber(1234.5)).toContain('1,234.5');
    expect(service.text('Tablero sin guardar')).toBe('Unsaved dashboard');
  });
});
