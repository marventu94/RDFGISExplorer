import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { HttpClient, provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import {
  GisBackendAdapter,
  createRdfBackendAdapter,
  type QueryResult,
} from './endpoint-adapter';

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

  it('textSearchTriple produces FILTER regex fragment', () => {
    const adapter = new GisBackendAdapter(httpClient, BASE_URL);
    const result = adapter.textSearchTriple('label', 'test', 10);
    expect(result).toContain('FILTER regex');
  });

  it('executeQuery POSTs sparql and limit to /api/query/execute', async () => {
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

describe('createRdfBackendAdapter', () => {
  it('always returns GisBackendAdapter (no direct mode anymore)', () => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    const http = TestBed.inject(HttpClient);
    const adapter = createRdfBackendAdapter(http);
    expect(adapter).toBeInstanceOf(GisBackendAdapter);
    expect(adapter.id).toBe('gis-backend');
  });
});
