import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  provideHttpClientTesting,
  HttpTestingController,
} from '@angular/common/http/testing';
import { RequestService, SparqlJsonResult } from './request.service';
import { AppConfigService } from './services/app-config.service';
import { signal } from '@angular/core';

const fakeConfig = {
  backend: 'test',
  endpointUrl: 'http://localhost/sparql',
  hasBasicAuth: false,
  userAgent: 'test',
  timeoutMs: 30000,
  defaultLimit: 20,
  maxLimit: 1000,
  capabilities: [],
  supportsWikibaseLabel: false,
  defaultPrefixes: {},
  search: { mode: 'sparql' as const, labelProperty: 'rdfs:label' },
  labelUri: 'http://www.w3.org/2000/01/rdf-schema#label',
  describe: { exclude: [], objects: [], datatype: [], text: [], image: [], external: [] },
  classColors: {},
  defaults: {
    lang: 'en',
    resultLimit: 20,
    labelUri: 'http://www.w3.org/2000/01/rdf-schema#label',
    searchClass: {
      uri: { type: 'uri' as const, value: 'http://www.w3.org/2002/07/owl#Thing' },
      label: { type: 'literal' as const, value: 'thing' },
    },
    endpointType: 'other' as const,
  },
};

function createMockAppConfig() {
  return {
    config: signal(fakeConfig),
    queryContext: signal({ lang: 'en', labelUri: 'rdfs:label', endpointType: 'other' as const, supportsWikibaseLabel: false }),
    load: vi.fn(),
  } as unknown as AppConfigService;
}

describe('RequestService', () => {
  let service: RequestService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: AppConfigService, useValue: createMockAppConfig() },
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

  describe('prefetchLabels', () => {
    const emptyLabelResponse = {
      variables: ['uri', 'uriLabel'],
      bindings: [],
      nodes: [],
      edges: [],
      meta: { durationMs: 0, truncated: false, limitApplied: 0, backend: 'wikidata' },
    };

    it('builds generic OPTIONAL label query for non-Wikidata endpoints', async () => {
      const promise = service.prefetchLabels(['http://example.org/Q1'], {
        labelUri: 'http://www.w3.org/2000/01/rdf-schema#label',
        lang: 'en',
        supportsWikibaseLabel: false,
      });

      const req = httpMock.expectOne('/api/query/execute');
      const body = req.request.body;
      expect(body.sparql).toContain('VALUES ?uri { <http://example.org/Q1> }');
      expect(body.sparql).toContain('OPTIONAL { ?uri <http://www.w3.org/2000/01/rdf-schema#label> ?uriLabel');
      expect(body.sparql).toContain('FILTER(lang(?uriLabel) = "en" || lang(?uriLabel) = "")');

      req.flush(emptyLabelResponse);
      await promise;
    });

    it('builds Wikidata SERVICE label query', async () => {
      const promise = service.prefetchLabels(['http://example.org/Q1'], {
        labelUri: 'http://www.w3.org/2000/01/rdf-schema#label',
        lang: 'en',
        supportsWikibaseLabel: true,
      });

      const req = httpMock.expectOne('/api/query/execute');
      const body = req.request.body;
      expect(body.sparql).toContain('PREFIX wikibase:');
      expect(body.sparql).toContain('SERVICE wikibase:label');
      expect(body.sparql).toContain('bd:serviceParam wikibase:language "en"');

      req.flush(emptyLabelResponse);
      await promise;
    });

    it('normalizes Wikidata direct-claim property URIs for label lookup', async () => {
      const promise = service.prefetchLabels(
        ['http://www.wikidata.org/prop/direct/P31'],
        {
          labelUri: 'http://www.w3.org/2000/01/rdf-schema#label',
          lang: 'en',
          supportsWikibaseLabel: true,
        },
      );

      const req = httpMock.expectOne('/api/query/execute');
      const body = req.request.body;
      expect(body.sparql).toContain(
        'VALUES ?uri { <http://www.wikidata.org/entity/P31> }',
      );

      req.flush({
        variables: ['uri', 'uriLabel'],
        bindings: [
          {
            uri: { type: 'uri', value: 'http://www.wikidata.org/entity/P31' },
            uriLabel: { type: 'literal', value: 'instance of' },
          },
        ],
        nodes: [],
        edges: [],
        meta: { durationMs: 0, truncated: false, limitApplied: 0, backend: 'wikidata' },
      });

      await promise;
      expect(
        service.getLabel('http://www.wikidata.org/prop/direct/P31'),
      ).toBe('instance of');
    });

    it('partitions URIs into configurable batches', async () => {
      const execSpy = vi
        .spyOn(service, 'execQuery')
        .mockResolvedValue({ results: { bindings: [] } } as unknown as SparqlJsonResult);

      const uris = ['http://example.org/Q1', 'http://example.org/Q2'];
      await service.prefetchLabels(uris, {
        labelUri: 'http://www.w3.org/2000/01/rdf-schema#label',
        lang: 'en',
        supportsWikibaseLabel: false,
      }, 1);

      expect(execSpy).toHaveBeenCalledTimes(2);
      const calls = execSpy.mock.calls as [string, ...unknown[]][];
      expect(calls[0][0]).toContain('<http://example.org/Q1>');
      expect(calls[1][0]).toContain('<http://example.org/Q2>');
    });

    it('correlates returned labels into cache', async () => {
      const mockResponse = {
        variables: ['uri', 'uriLabel'],
        bindings: [
          {
            uri: { type: 'uri', value: 'http://example.org/Q1' },
            uriLabel: { type: 'literal', value: 'Prefetched Label' },
          },
        ],
        nodes: [],
        edges: [],
        meta: { durationMs: 0, truncated: false, limitApplied: 0, backend: 'wikidata' },
      };

      const promise = service.prefetchLabels(['http://example.org/Q1'], {
        labelUri: 'http://www.w3.org/2000/01/rdf-schema#label',
        lang: 'en',
        supportsWikibaseLabel: false,
      });

      const req = httpMock.expectOne('/api/query/execute');
      req.flush(mockResponse);
      await promise;
      expect(service.getLabel('http://example.org/Q1')).toBe('Prefetched Label');
    });
  });
});
