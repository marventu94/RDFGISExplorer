import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  provideHttpClientTesting,
  HttpTestingController,
} from '@angular/common/http/testing';
import { RequestService, SparqlJsonResult } from './request.service';
import { SettingsService } from './settings.service';
import { signal } from '@angular/core';
import type { AppSettings } from './settings.types';

const DEFAULT_SETTINGS: AppSettings = {
  lang: 'en',
  labelUri: 'http://www.w3.org/2000/01/rdf-schema#label',
  searchClass: {
    uri: { type: 'uri', value: 'http://www.wikidata.org/entity/Q5' },
    label: { type: 'literal', value: 'human', 'xml:lang': 'en' },
  },
  resultLimit: 20,
  wikibaseAdapter: true,
  endpointType: 'other',
  endpointLabel: 'wikidata',
  classColorOverrides: {},
  theme: 'light',
};

function createMockSettings(overrides: Partial<AppSettings> = {}) {
  return {
    app: signal({ ...DEFAULT_SETTINGS, ...overrides }),
    loaded: signal(true),
    error: signal(null),
    update: vi.fn(),
    reset: vi.fn(),
    load: vi.fn(),
    initFromConfig: vi.fn(),
  } as unknown as SettingsService;
}

describe('RequestService', () => {
  let service: RequestService;
  let mockSettings: SettingsService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.resetTestingModule();
    mockSettings = createMockSettings();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: SettingsService, useValue: mockSettings },
      ],
    });
    service = TestBed.inject(RequestService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  describe('labelCache', () => {
    it('starts empty (no WIKIDATA_SEED anymore)', () => {
      expect(service.labelCache().size).toBe(0);
    });

    it('getLabel returns cached value', () => {
      service.setLabel('http://example.org/foo', 'bar');
      expect(service.getLabel('http://example.org/foo')).toBe('bar');
    });

    it('getLabel returns undefined for unknown URI', () => {
      expect(service.getLabel('http://example.org/unknown')).toBeUndefined();
    });

    it('setLabel adds to cache', () => {
      service.setLabel('http://example.org/foo', 'bar');
      expect(service.getLabel('http://example.org/foo')).toBe('bar');
    });
  });

  describe('execQuery', () => {
    it('POSTs to /api/query/execute via the backend', async () => {
      const promise = service.execQuery('SELECT * WHERE { ?s ?p ?o }');
      const req = httpMock.expectOne('/api/query/execute');
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({
        sparql: 'SELECT * WHERE { ?s ?p ?o }',
        limit: 500,
      });
      req.flush({
        variables: [],
        bindings: [],
        nodes: [],
        edges: [],
        meta: { durationMs: 0, truncated: false, limitApplied: 0, backend: 'wikidata' },
      });
      await promise;
    });

    it('forwards abort signal', async () => {
      const controller = new AbortController();
      const promise = service.execQuery('SELECT * WHERE { ?s ?p ?o }', {
        signal: controller.signal,
      });
      const req = httpMock.expectOne('/api/query/execute');
      controller.abort();
      req.error(new ProgressEvent('abort'));
      await expect(promise).rejects.toBeTruthy();
    });
  });

  describe('label correlation', () => {
    it('correlates ?var and ?varLabel columns and seeds label cache', async () => {
      const mockResponse = {
        variables: ['uri', 'uriLabel', 'other'],
        bindings: [
          {
            uri: { type: 'uri', value: 'http://example.org/Q1' },
            uriLabel: { type: 'literal', value: 'Example One' },
            other: { type: 'literal', value: 'something' },
          },
        ],
        nodes: [],
        edges: [],
        meta: { durationMs: 0, truncated: false, limitApplied: 0, backend: 'wikidata' },
      };

      const promise = service.execQuery('SELECT ?uri ?uriLabel ?other WHERE { ... }');
      const req = httpMock.expectOne('/api/query/execute');
      req.flush(mockResponse);
      await promise;
      expect(service.getLabel('http://example.org/Q1')).toBe('Example One');
    });

    it('does not correlate when types do not match', async () => {
      const mockResponse = {
        variables: ['uri', 'uriLabel'],
        bindings: [
          {
            uri: { type: 'literal', value: 'not a URI' },
            uriLabel: { type: 'literal', value: 'ignored' },
          },
        ],
        nodes: [],
        edges: [],
        meta: { durationMs: 0, truncated: false, limitApplied: 0, backend: 'wikidata' },
      };

      const promise = service.execQuery('SELECT ?uri ?uriLabel WHERE { ... }');
      const req = httpMock.expectOne('/api/query/execute');
      req.flush(mockResponse);
      await promise;
      expect(service.getLabel('not a URI')).toBeUndefined();
    });

    it('handles multiple variable pairs', async () => {
      const mockResponse = {
        variables: ['property', 'propertyLabel', 'value', 'valueLabel'],
        bindings: [
          {
            property: { type: 'uri', value: 'http://example.org/P1' },
            propertyLabel: { type: 'literal', value: 'Property One' },
            value: { type: 'uri', value: 'http://example.org/V1' },
            valueLabel: { type: 'literal', value: 'Value One' },
          },
        ],
        nodes: [],
        edges: [],
        meta: { durationMs: 0, truncated: false, limitApplied: 0, backend: 'wikidata' },
      };

      const promise = service.execQuery('SELECT ?property ?propertyLabel ?value ?valueLabel WHERE { ... }');
      const req = httpMock.expectOne('/api/query/execute');
      req.flush(mockResponse);
      await promise;
      expect(service.getLabel('http://example.org/P1')).toBe('Property One');
      expect(service.getLabel('http://example.org/V1')).toBe('Value One');
    });
  });
});
