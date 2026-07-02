import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  provideHttpClientTesting,
  HttpTestingController,
} from '@angular/common/http/testing';
import { SettingsService } from './settings.service';
import { AppConfigService } from './services/app-config.service';
import type { AppConfig } from './services/app-config.service';

const fakeConfig: AppConfig = {
  backend: 'wikidata',
  endpointUrl: 'https://query.wikidata.org/sparql',
  hasBasicAuth: false,
  userAgent: 'test/1.0',
  timeoutMs: 30000,
  defaultLimit: 500,
  maxLimit: 2000,
  capabilities: ['sparql11'],
  supportsWikibaseLabel: true,
  defaultPrefixes: { rdf: 'http://www.w3.org/1999/02/22-rdf-syntax-ns#' },
  search: { mode: 'wikidata-api', labelProperty: 'rdfs:label' },
  labelUri: 'http://www.w3.org/2000/01/rdf-schema#label',
  describe: { exclude: [], objects: [], datatype: [], text: [], image: [], external: [] },
  classColors: {},
  defaults: {
    lang: 'en',
    resultLimit: 500,
    labelUri: 'http://www.w3.org/2000/01/rdf-schema#label',
    searchClass: {
      uri: { type: 'uri', value: 'http://www.wikidata.org/entity/Q5' },
      label: { type: 'literal', value: 'human', 'xml:lang': 'en' },
    },
    wikibaseAdapter: true,
    endpointType: 'other',
    endpointLabel: 'wikidata',
    theme: 'light',
  },
};

const storedSettings = {
  lang: 'es',
  labelUri: 'http://www.w3.org/2000/01/rdf-schema#label',
  searchClass: {
    uri: { type: 'uri', value: 'http://example.org/Class' },
    label: { type: 'literal', value: 'example', 'xml:lang': 'en' },
  },
  resultLimit: 100,
  wikibaseAdapter: false,
  endpointType: 'fuseki',
  endpointLabel: 'my fuseki',
  classColorOverrides: {},
  theme: 'dark',
};

function setup() {
  const appConfigStub = {
    config: vi.fn().mockReturnValue(fakeConfig),
    load: vi.fn(),
  } as unknown as AppConfigService;

  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      SettingsService,
      { provide: AppConfigService, useValue: appConfigStub },
    ],
  });

  return {
    service: TestBed.inject(SettingsService),
    httpMock: TestBed.inject(HttpTestingController),
  };
}

describe('SettingsService', () => {
  beforeEach(() => {
    TestBed.resetTestingModule();
  });

  it('bootstraps from app config defaults when no stored settings', () => {
    const { service, httpMock } = setup();
    const app = service.app();
    expect(app.lang).toBe('en');
    expect(app.resultLimit).toBe(500);
    expect(app.endpointType).toBe('other');
    expect(app.endpointLabel).toBe('wikidata');
    expect(app.wikibaseAdapter).toBe(true);
    expect(app.searchClass.uri.value).toBe('http://www.wikidata.org/entity/Q5');
    httpMock.verify();
  });

  it('load() fetches settings from backend and replaces local state', async () => {
    const { service, httpMock } = setup();
    const promise = service.load();
    const req = httpMock.expectOne('/api/settings');
    expect(req.request.method).toBe('GET');
    req.flush(storedSettings);
    await promise;
    expect(service.app().lang).toBe('es');
    expect(service.app().resultLimit).toBe(100);
    expect(service.app().endpointType).toBe('fuseki');
    expect(service.loaded()).toBe(true);
  });

  it('load() marks loaded even when backend fails', async () => {
    const { service, httpMock } = setup();
    const promise = service.load();
    const req = httpMock.expectOne('/api/settings');
    req.error(new ProgressEvent('error'));
    await promise;
    expect(service.loaded()).toBe(true);
    expect(service.error()).toBeTruthy();
  });

  it('update() applies locally and PUTs partial to backend', () => {
    const { service, httpMock } = setup();
    service.update('lang', 'es');
    expect(service.app().lang).toBe('es');
    const req = httpMock.expectOne('/api/settings');
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual({ lang: 'es' });
    req.flush({ ...service.app(), lang: 'es' });
  });

  it('update() rolls back local state when PUT fails', () => {
    const { service, httpMock } = setup();
    const before = service.app().resultLimit;
    service.update('resultLimit', 999);
    expect(service.app().resultLimit).toBe(999);
    const req = httpMock.expectOne('/api/settings');
    req.error(new ProgressEvent('error'));
    expect(service.app().resultLimit).toBe(before);
    expect(service.error()).toBeTruthy();
  });

  it('reset() restores defaults and PUTs full settings', () => {
    const { service, httpMock } = setup();
    service.update('lang', 'fr');
    const req = httpMock.expectOne('/api/settings');
    req.flush({ ...service.app(), lang: 'fr' });

    service.reset();
    expect(service.app().lang).toBe('en');
    const resetReq = httpMock.expectOne('/api/settings');
    expect(resetReq.request.method).toBe('PUT');
    expect(resetReq.request.body.lang).toBe('en');
    resetReq.flush(service.app());
  });
});
