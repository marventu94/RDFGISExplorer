import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { HttpClient, provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import {
  VirtuosoAdapter,
  FusekiAdapter,
  GenericAdapter,
  createEndpointAdapter,
  GisBackendAdapter,
  LegacyDirectAdapter,
  createRdfBackendAdapter,
  type QueryResult,
  type SparqlJsonResult,
} from './endpoint-adapter';
import type { AppSettings } from './settings.types';

const BASE_URL = '';

const FIXTURE_QUERY_1 = 'SELECT ?s ?p ?o WHERE { ?s ?p ?o } LIMIT 10';
const FIXTURE_QUERY_2 = 'SELECT ?uri ?label WHERE { ?uri rdfs:label ?label }';
const FIXTURE_QUERY_3 = 'ASK { ?s a <http://example.org/Person> }';

function makeQueryResult(overrides: Partial<QueryResult> = {}): QueryResult {
  return {
    variables: ['s', 'p', 'o'],
    bindings: [
      {
        s: { type: 'uri', value: 'http://example.org/S1' },
        p: { type: 'uri', value: 'http://example.org/P1' },
        o: { type: 'literal', value: 'hello', lang: 'en' },
      },
    ],
    nodes: [],
    edges: [],
    meta: {
      durationMs: 42,
      truncated: false,
      limitApplied: 10,
      backend: 'wikidata',
    },
    ...overrides,
  };
}

function makeSparqlJsonResult(
  rawBindings: SparqlJsonResult['results']['bindings'] = [],
  vars: string[] = ['s', 'p', 'o'],
): SparqlJsonResult {
  return {
    head: { vars },
    results: { bindings: rawBindings },
  };
}

// ---------- Old text-search adapter tests ----------

describe('VirtuosoAdapter', () => {
  it('produces bif:contains triple', () => {
    const a = new VirtuosoAdapter();
    const result = a.textSearchTriple('label', 'Einstein', 20);
    expect(result).toContain('bif:contains');
    expect(result).toContain("'Einstein'");
    expect(result).toContain('?label');
  });
});

describe('FusekiAdapter', () => {
  it('produces text:query triple with limit', () => {
    const a = new FusekiAdapter();
    const result = a.textSearchTriple('label', 'Einstein', 20);
    expect(result).toContain('text:query');
    expect(result).toContain('"Einstein"');
    expect(result).toContain('20');
  });
});

describe('GenericAdapter', () => {
  it('produces FILTER regex fragment', () => {
    const a = new GenericAdapter();
    const result = a.textSearchTriple('label', 'Einstein', 20);
    expect(result).toContain('FILTER regex');
    expect(result).toContain('?label');
    expect(result).toContain('"Einstein"');
    expect(result).toContain('"i"');
  });
});

describe('createEndpointAdapter', () => {
  it('returns VirtuosoAdapter for virtuoso', () => {
    expect(createEndpointAdapter('virtuoso')).toBeInstanceOf(VirtuosoAdapter);
  });

  it('returns FusekiAdapter for fuseki', () => {
    expect(createEndpointAdapter('fuseki')).toBeInstanceOf(FusekiAdapter);
  });

  it('returns GenericAdapter for other', () => {
    expect(createEndpointAdapter('other')).toBeInstanceOf(GenericAdapter);
  });
});

// ---------- GisBackendAdapter unit tests ----------

describe('GisBackendAdapter', () => {
  let httpClient: HttpClient;
  let httpTestingController: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    httpClient = TestBed.inject(HttpClient);
    httpTestingController = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpTestingController.verify();
  });

  it('has id gis-backend', () => {
    const adapter = new GisBackendAdapter(httpClient, BASE_URL);
    expect(adapter.id).toBe('gis-backend');
  });

  it('textSearchTriple delegates to GenericAdapter', () => {
    const adapter = new GisBackendAdapter(httpClient, BASE_URL);
    const result = adapter.textSearchTriple('label', 'test', 10);
    expect(result).toContain('FILTER regex');
  });

  it('executeQuery POSTs sparql and limit to /api/sparql/execute', async () => {
    const adapter = new GisBackendAdapter(httpClient, BASE_URL);
    const expected = makeQueryResult();

    const promise = adapter.executeQuery(FIXTURE_QUERY_1, { limit: 10 });

    const req = httpTestingController.expectOne('/api/query/execute');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ sparql: FIXTURE_QUERY_1, limit: 10 });

    req.flush(expected);
    const result = await promise;
    expect(result).toEqual(expected);
  });

  it('executeQuery uses default limit 500 when not provided', async () => {
    const adapter = new GisBackendAdapter(httpClient, BASE_URL);
    const promise = adapter.executeQuery(FIXTURE_QUERY_1);

    const req = httpTestingController.expectOne('/api/query/execute');
    expect(req.request.body).toEqual({ sparql: FIXTURE_QUERY_1, limit: 500 });

    req.flush(makeQueryResult());
    await promise;
  });

  it('getPredicates GETs /api/suggestions/predicates', async () => {
    const adapter = new GisBackendAdapter(httpClient, BASE_URL);
    const promise = adapter.getPredicates();

    const req = httpTestingController.expectOne('/api/suggestions/predicates');
    expect(req.request.method).toBe('GET');

    req.flush({ predicates: ['http://example.org/P1', 'http://example.org/P2'] });
    const result = await promise;
    expect(result).toEqual(['http://example.org/P1', 'http://example.org/P2']);
  });
});

// ---------- LegacyDirectAdapter unit tests ----------

describe('LegacyDirectAdapter', () => {
  const endpointUrl = 'https://query.wikidata.org/sparql';

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('has id legacy-direct', () => {
    const adapter = new LegacyDirectAdapter(endpointUrl);
    expect(adapter.id).toBe('legacy-direct');
  });

  it('textSearchTriple delegates to GenericAdapter', () => {
    const adapter = new LegacyDirectAdapter(endpointUrl);
    const result = adapter.textSearchTriple('label', 'test', 10);
    expect(result).toContain('FILTER regex');
  });

  it('executeQuery POSTs to endpoint with origin and format', async () => {
    const adapter = new LegacyDirectAdapter(endpointUrl);
    const raw = makeSparqlJsonResult([
      {
        s: { type: 'uri', value: 'http://example.org/S1' },
        p: { type: 'uri', value: 'http://example.org/P1' },
        o: { type: 'literal', value: 'hello', 'xml:lang': 'en' },
      },
    ]);

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(raw), { status: 200 }),
    );

    const result = await adapter.executeQuery(FIXTURE_QUERY_1);

    const url = fetchSpy.mock.calls[0][0] as string;
    expect(url).toContain(endpointUrl);
    expect(url).toContain('origin=*');
    expect(url).toContain('format=json');
    expect(url).toContain(encodeURIComponent(FIXTURE_QUERY_1).replace(/%20/g, '+'));

    expect(result.variables).toEqual(['s', 'p', 'o']);
    expect(result.bindings).toHaveLength(1);
    expect(result.bindings[0]!['s']).toEqual({ type: 'uri', value: 'http://example.org/S1' });
  });

  it('executeQuery throws on non-ok response', async () => {
    const adapter = new LegacyDirectAdapter(endpointUrl);
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('Error', { status: 500 }),
    );

    await expect(adapter.executeQuery(FIXTURE_QUERY_1)).rejects.toThrow('SPARQL query failed');
  });

  it('executeQuery forwards abort signal', async () => {
    const adapter = new LegacyDirectAdapter(endpointUrl);
    const abortError = new DOMException('Aborted', 'AbortError');
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(abortError);

    const controller = new AbortController();
    const promise = adapter.executeQuery(FIXTURE_QUERY_1, { signal: controller.signal });
    controller.abort();

    await expect(promise).rejects.toThrow('Aborted');
  });

  it('getPredicates returns uri values from raw bindings', async () => {
    const adapter = new LegacyDirectAdapter(endpointUrl);
    const raw = makeSparqlJsonResult([
      { p: { type: 'uri', value: 'http://example.org/P1' } },
      { p: { type: 'uri', value: 'http://example.org/P2' } },
    ], ['p']);

    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(raw), { status: 200 }),
    );

    const result = await adapter.getPredicates();
    expect(result).toEqual(['http://example.org/P1', 'http://example.org/P2']);
  });

  it('normalizeValue maps xml:lang to lang', async () => {
    const adapter = new LegacyDirectAdapter(endpointUrl);
    const raw = makeSparqlJsonResult([
      { label: { type: 'literal', value: 'hello', 'xml:lang': 'en' } },
    ], ['label']);

    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(raw), { status: 200 }),
    );

    const result = await adapter.executeQuery(FIXTURE_QUERY_1);
    expect(result.bindings[0]!['label']).toEqual({ type: 'literal', value: 'hello', lang: 'en' });
  });
});

// ---------- Parity tests ----------

describe('Adapter parity', () => {
  let httpClient: HttpClient;
  let httpTestingController: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    httpClient = TestBed.inject(HttpClient);
    httpTestingController = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpTestingController.verify();
    vi.restoreAllMocks();
  });

  const queries = [
    { name: 'simple SELECT', query: FIXTURE_QUERY_1 },
    { name: 'label SELECT', query: FIXTURE_QUERY_2 },
    { name: 'ASK query', query: FIXTURE_QUERY_3 },
  ];

  for (const { name, query } of queries) {
    it(`returns equivalent QueryResult for ${name}`, async () => {
      const gisAdapter = new GisBackendAdapter(httpClient, BASE_URL);
      const legacyAdapter = new LegacyDirectAdapter('https://query.wikidata.org/sparql');

      const expected: QueryResult = {
        variables: ['x'],
        bindings: [{ x: { type: 'uri', value: 'http://example.org/X1' } }],
        nodes: [],
        edges: [],
        meta: {
          durationMs: 0,
          truncated: false,
          limitApplied: 0,
          backend: 'wikidata',
        },
      };

      // Mock GisBackendAdapter HTTP
      const gisPromise = gisAdapter.executeQuery(query);
      const gisReq = httpTestingController.expectOne('/api/query/execute');
      gisReq.flush(expected);
      const gisResult = await gisPromise;

      // Mock LegacyDirectAdapter fetch
      const raw: SparqlJsonResult = {
        head: { vars: ['x'] },
        results: {
          bindings: [
            { x: { type: 'uri', value: 'http://example.org/X1' } },
          ],
        },
      };
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(JSON.stringify(raw), { status: 200 }),
      );
      const legacyResult = await legacyAdapter.executeQuery(query);

      expect(gisResult.variables).toEqual(legacyResult.variables);
      expect(gisResult.bindings).toEqual(legacyResult.bindings);
      expect(gisResult.meta.limitApplied).toBe(legacyResult.meta.limitApplied);
    });
  }
});

// ---------- Factory tests ----------

describe('createRdfBackendAdapter', () => {
  it('returns GisBackendAdapter for app-backend mode', () => {
    const settings: AppSettings = {
      lang: 'en',
      labelUri: 'http://www.w3.org/2000/01/rdf-schema#label',
      endpoint: { url: 'https://query.wikidata.org/sparql', type: 'other', label: 'wikidata' },
      searchClass: { uri: { type: 'uri', value: 'http://dbpedia.org/ontology/Person' }, label: { type: 'literal', value: 'person', 'xml:lang': 'en' } },
      resultLimit: 20,
      backendMode: 'app-backend',
      wikibaseAdapter: true,
    };
    const adapter = createRdfBackendAdapter(settings, null as any);
    expect(adapter).toBeInstanceOf(GisBackendAdapter);
  });

  it('returns LegacyDirectAdapter for direct mode', () => {
    const settings: AppSettings = {
      lang: 'en',
      labelUri: 'http://www.w3.org/2000/01/rdf-schema#label',
      endpoint: { url: 'https://query.wikidata.org/sparql', type: 'other', label: 'wikidata' },
      searchClass: { uri: { type: 'uri', value: 'http://dbpedia.org/ontology/Person' }, label: { type: 'literal', value: 'person', 'xml:lang': 'en' } },
      resultLimit: 20,
      backendMode: 'direct',
      wikibaseAdapter: true,
    };
    const adapter = createRdfBackendAdapter(settings, null as any);
    expect(adapter).toBeInstanceOf(LegacyDirectAdapter);
  });
});
