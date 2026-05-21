import { createSparqlEndpoint } from './sparql-endpoint.factory';
import { WikidataAdapter } from './wikidata.adapter';
import { MillenniumDBAdapter } from './millenniumdb.adapter';
import { SparqlEndpoint } from './sparql-endpoint.interface';

describe('createSparqlEndpoint', () => {
  const originalEnv = process.env['SPARQL_BACKEND'];

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env['SPARQL_BACKEND'];
    } else {
      process.env['SPARQL_BACKEND'] = originalEnv;
    }
  });

  it('returns WikidataAdapter when SPARQL_BACKEND is not set (default)', () => {
    delete process.env['SPARQL_BACKEND'];
    const endpoint: SparqlEndpoint = createSparqlEndpoint();
    expect(endpoint).toBeInstanceOf(WikidataAdapter);
    expect(endpoint.backendName).toBe('wikidata');
  });

  it('returns WikidataAdapter when SPARQL_BACKEND=wikidata', () => {
    process.env['SPARQL_BACKEND'] = 'wikidata';
    const endpoint: SparqlEndpoint = createSparqlEndpoint();
    expect(endpoint).toBeInstanceOf(WikidataAdapter);
    expect(endpoint.backendName).toBe('wikidata');
  });

  it('returns WikidataAdapter for unknown backend value (sane default)', () => {
    process.env['SPARQL_BACKEND'] = 'something-unknown';
    const endpoint: SparqlEndpoint = createSparqlEndpoint();
    expect(endpoint).toBeInstanceOf(WikidataAdapter);
    expect(endpoint.backendName).toBe('wikidata');
  });

  it('returns MillenniumDBAdapter when SPARQL_BACKEND=millenniumdb', () => {
    process.env['SPARQL_BACKEND'] = 'millenniumdb';
    const endpoint: SparqlEndpoint = createSparqlEndpoint();
    expect(endpoint).toBeInstanceOf(MillenniumDBAdapter);
    expect(endpoint.backendName).toBe('millenniumdb');
  });

  it('returns a fresh instance each call', () => {
    process.env['SPARQL_BACKEND'] = 'wikidata';
    const a = createSparqlEndpoint();
    const b = createSparqlEndpoint();
    expect(a).not.toBe(b);
  });
});
