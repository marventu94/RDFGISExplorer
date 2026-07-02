import { describe, it, expect, beforeEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import {
  provideHttpClient,
  withInterceptorsFromDi,
} from '@angular/common/http';
import {
  provideHttpClientTesting,
  HttpTestingController,
} from '@angular/common/http/testing';
import { SettingsApiService } from './settings-api.service';
import type { AppSettings } from '../settings.types';

const fakeSettings: AppSettings = {
  lang: 'en',
  labelUri: 'rdfs:label',
  searchClass: {
    uri: { type: 'uri', value: 'http://example.org/X' },
    label: { type: 'literal', value: 'x' },
  },
  resultLimit: 50,
  wikibaseAdapter: true,
  endpointType: 'other',
  endpointLabel: 'test',
  classColorOverrides: {},
};

describe('SettingsApiService', () => {
  let service: SettingsApiService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(withInterceptorsFromDi()), provideHttpClientTesting(), SettingsApiService],
    });
    service = TestBed.inject(SettingsApiService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  it('get() GETs /api/settings', () => {
    service.get().subscribe();
    const req = httpMock.expectOne('/api/settings');
    expect(req.request.method).toBe('GET');
    req.flush(fakeSettings);
  });

  it('put() PUTs partial to /api/settings', () => {
    service.put({ lang: 'es' }).subscribe();
    const req = httpMock.expectOne('/api/settings');
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual({ lang: 'es' });
    req.flush(fakeSettings);
  });
});
