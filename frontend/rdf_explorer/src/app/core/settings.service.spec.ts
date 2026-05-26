import { describe, it, expect, beforeEach } from 'vitest';
import { SettingsService } from './settings.service';

function clearStorage() {
  localStorage.removeItem('rdfexplorer.settings.v1');
}

describe('SettingsService', () => {
  beforeEach(() => {
    clearStorage();
  });

  it('initializes with default app settings', () => {
    const service = new SettingsService();
    const app = service.app();
    expect(app.lang).toBe('en');
    expect(app.endpoint.url).toBe('https://query.wikidata.org/sparql');
    expect(app.resultLimit).toBe(20);
  });

  it('initializes with all legacy prefixes', () => {
    const service = new SettingsService();
    expect(service.prefixes().length).toBe(34);
  });

  it('initializes with describe config', () => {
    const service = new SettingsService();
    expect(service.describe().objects).toEqual(['http://www.wikidata.org/prop/direct/P31']);
    expect(service.describe().exclude.length).toBeGreaterThan(0);
  });

  it('update persists to localStorage', () => {
    const s1 = new SettingsService();
    s1.update('lang', 'fr');
    expect(s1.app().lang).toBe('fr');

    const raw = localStorage.getItem('rdfexplorer.settings.v1');
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw!);
    expect(parsed.lang).toBe('fr');
  });

  it('hydrates from localStorage on construction', () => {
    const s1 = new SettingsService();
    s1.update('resultLimit', 50);

    const s2 = new SettingsService();
    expect(s2.app().resultLimit).toBe(50);
    expect(s2.app().lang).toBe('en');
  });

  it('reset restores defaults and clears localStorage', () => {
    const s1 = new SettingsService();
    s1.update('lang', 'fr');
    s1.reset();
    expect(s1.app().lang).toBe('en');
    expect(localStorage.getItem('rdfexplorer.settings.v1')).toBeNull();
  });
});
