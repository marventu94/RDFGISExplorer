import { createSparqlEndpoint } from './sparql-endpoint.factory';
import { GenericSparqlAdapter } from './generic-sparql.adapter';
import { SparqlEndpoint } from './sparql-endpoint.interface';
import { WikidataAdapter } from './wikidata.adapter';

describe('createSparqlEndpoint', () => {
  const originalEnv = process.env['SPARQL_BACKEND'];

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env['SPARQL_BACKEND'];
    } else {
      process.env['SPARQL_BACKEND'] = originalEnv;
    }
  });

  it('returns WikidataAdapter when SPARQL_BACKEND is not set', () => {
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

  it('returns GenericSparqlAdapter for unknown backend value (sane default)', () => {
    process.env['SPARQL_BACKEND'] = 'something-unknown';
    const endpoint: SparqlEndpoint = createSparqlEndpoint();
    expect(endpoint).toBeInstanceOf(GenericSparqlAdapter);
    expect(endpoint.backendName).toBe('something-unknown');
  });

  it('returns GenericSparqlAdapter when SPARQL_BACKEND=generic', () => {
    process.env['SPARQL_BACKEND'] = 'generic';
    const endpoint: SparqlEndpoint = createSparqlEndpoint();
    expect(endpoint).toBeInstanceOf(GenericSparqlAdapter);
    expect(endpoint.backendName).toBe('generic');
  });

  it('returns a fresh instance each call', () => {
    process.env['SPARQL_BACKEND'] = 'generic';
    const a = createSparqlEndpoint();
    const b = createSparqlEndpoint();
    expect(a).not.toBe(b);
  });
});
