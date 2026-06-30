import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { RequestService, SparqlJsonResult } from './request.service';
import { SettingsService } from './settings.service';
import { signal } from '@angular/core';
import type { AppSettings } from './settings.types';

const DEFAULT_SETTINGS: AppSettings = {
  lang: 'en',
  labelUri: 'http://www.w3.org/2000/01/rdf-schema#label',
  endpoint: {
    url: 'https://query.wikidata.org/sparql',
    type: 'other',
    label: 'wikidata',
  },
  searchClass: {
    uri: { type: 'uri', value: 'http://dbpedia.org/ontology/Person' },
    label: { type: 'literal', value: 'person', 'xml:lang': 'en' },
  },
  resultLimit: 20,
  backendMode: 'direct',
  wikibaseAdapter: true,
};

function createMockSettings(overrides: Partial<AppSettings> = {}) {
  return {
    app: signal({ ...DEFAULT_SETTINGS, ...overrides }),
    prefixes: signal([] as any),
    describe: signal({} as any),
    update: vi.fn(),
    reset: vi.fn(),
  } as unknown as SettingsService;
}

describe('RequestService', () => {
  let service: RequestService;
  let mockSettings: SettingsService;

  beforeEach(() => {
    mockSettings = createMockSettings();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        { provide: SettingsService, useValue: mockSettings },
      ],
    });
    service = TestBed.inject(RequestService);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('labelCache', () => {
    it('is seeded from WIKIDATA_SEED', () => {
      const cache = service.labelCache();
      expect(cache.get('http://www.wikidata.org/entity/Q146')).toBe('house cat');
      expect(cache.get('http://www.wikidata.org/prop/direct/P31')).toBe('instance of');
    });

    it('getLabel returns cached value', () => {
      expect(service.getLabel('http://www.wikidata.org/entity/Q146')).toBe('house cat');
    });

    it('getLabel returns undefined for unknown URI', () => {
      expect(service.getLabel('http://example.org/unknown')).toBeUndefined();
    });

    it('setLabel adds to cache', () => {
      service.setLabel('http://example.org/foo', 'bar');
      expect(service.getLabel('http://example.org/foo')).toBe('bar');
    });
  });

  describe('execQuery in direct mode', () => {
    it('POSTs to the configured endpoint with format=json', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(JSON.stringify({
          head: { vars: ['uri', 'label'] },
          results: { bindings: [] },
        }), { status: 200 }),
      );

      await service.execQuery('SELECT * WHERE { ?s ?p ?o }');

      const url = fetchSpy.mock.calls[0][0] as string;
      expect(url).toContain('https://query.wikidata.org/sparql');
      expect(url).toContain('origin=*');
      expect(url).toContain('format=json');
      expect(url).toContain('SELECT+*+WHERE+%7B+%3Fs+%3Fp+%3Fo+%7D');
    });

    it('throws when fetch returns non-ok', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response('Internal Error', { status: 500 }),
      );

      await expect(
        service.execQuery('SELECT * WHERE { ?s ?p ?o }'),
      ).rejects.toThrow('SPARQL query failed');
    });

    it('throws on abort', async () => {
      const abortError = new DOMException('The user aborted a request.', 'AbortError');
      vi.spyOn(globalThis, 'fetch').mockRejectedValue(abortError);

      const controller = new AbortController();
      const promise = service.execQuery('SELECT * WHERE { ?s ?p ?o }', {
        signal: controller.signal,
      });

      controller.abort();

      await expect(promise).rejects.toThrow('abort');
    });
  });

  describe('label correlation', () => {
    it('correlates ?var and ?varLabel columns and seeds label cache', async () => {
      const mockResponse: SparqlJsonResult = {
        head: { vars: ['uri', 'uriLabel', 'other'] },
        results: {
          bindings: [
            {
              uri: { type: 'uri', value: 'http://example.org/Q1' },
              uriLabel: { type: 'literal', value: 'Example One' },
              other: { type: 'literal', value: 'something' },
            },
          ],
        },
      };

      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(JSON.stringify(mockResponse), { status: 200 }),
      );

      await service.execQuery('SELECT ?uri ?uriLabel ?other WHERE { ... }');

      expect(service.getLabel('http://example.org/Q1')).toBe('Example One');
    });

    it('does not correlate when types do not match', async () => {
      const mockResponse: SparqlJsonResult = {
        head: { vars: ['uri', 'uriLabel'] },
        results: {
          bindings: [
            {
              uri: { type: 'literal', value: 'not a URI' },
              uriLabel: { type: 'literal', value: 'ignored' },
            },
          ],
        },
      };

      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(JSON.stringify(mockResponse), { status: 200 }),
      );

      await service.execQuery('SELECT ?uri ?uriLabel WHERE { ... }');

      expect(service.getLabel('not a URI')).toBeUndefined();
    });

    it('handles multiple variable pairs', async () => {
      const mockResponse: SparqlJsonResult = {
        head: { vars: ['property', 'propertyLabel', 'value', 'valueLabel'] },
        results: {
          bindings: [
            {
              property: { type: 'uri', value: 'http://example.org/P1' },
              propertyLabel: { type: 'literal', value: 'Property One' },
              value: { type: 'uri', value: 'http://example.org/V1' },
              valueLabel: { type: 'literal', value: 'Value One' },
            },
          ],
        },
      };

      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(JSON.stringify(mockResponse), { status: 200 }),
      );

      await service.execQuery('SELECT ?property ?propertyLabel ?value ?valueLabel WHERE { ... }');

      expect(service.getLabel('http://example.org/P1')).toBe('Property One');
      expect(service.getLabel('http://example.org/V1')).toBe('Value One');
    });

    it('gracefully handles missing vars/head/results', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(JSON.stringify({}), { status: 200 }),
      );

      await expect(
        service.execQuery('ASK { ?s ?p ?o }'),
      ).resolves.toBeTruthy();
    });
  });
});
