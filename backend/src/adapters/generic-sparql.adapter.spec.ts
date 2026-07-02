import nock from 'nock';
import { GenericSparqlAdapter } from './generic-sparql.adapter';
import { TimeoutError, UpstreamError } from './sparql-endpoint.interface';
import * as fs from 'fs';
import * as path from 'path';

function readFixture(name: string): object {
  const raw = fs.readFileSync(
    path.resolve(__dirname, '../../test/fixtures', name),
    'utf-8',
  );
  return JSON.parse(raw) as object;
}

const FIXTURE: object = readFixture('wikidata-cities.json');

const WIKIDATA_BASE = 'https://query.wikidata.org';
const WIKIDATA_PATH = '/sparql';

function mockWikidata(response: object, status = 200): nock.Scope {
  return nock(WIKIDATA_BASE)
    .post(WIKIDATA_PATH)
    .matchHeader(
      'User-Agent',
      (val: unknown) => typeof val === 'string' && val.length > 0,
    )
    .reply(status, response);
}

describe('GenericSparqlAdapter', () => {
  let adapter: GenericSparqlAdapter;

  const defaultOpts = { timeoutMs: 10_000, limit: 50 };

  beforeEach(() => {
    adapter = new GenericSparqlAdapter();
    process.env['SPARQL_USER'] = 'test-agent/1.0';
  });

  afterEach(() => {
    nock.cleanAll();
    delete process.env['SPARQL_USER'];
    delete process.env['SPARQL_BACKEND'];
  });

  describe('execute', () => {
    it('returns >0 bindings for a valid query', async () => {
      mockWikidata(FIXTURE);
      const result = await adapter.execute(
        'SELECT * WHERE { ?s ?p ?o } LIMIT 3',
        defaultOpts,
      );
      expect(result.bindings.length).toBeGreaterThan(0);
      expect(result.variables).toContain('city');
    });

    it('sends User-Agent header', async () => {
      const scope = nock(WIKIDATA_BASE)
        .post(WIKIDATA_PATH)
        .matchHeader('User-Agent', 'test-agent/1.0')
        .reply(200, FIXTURE);

      await adapter.execute('SELECT * WHERE { ?s ?p ?o }', defaultOpts);
      expect(scope.isDone()).toBe(true);
    });

    it('assigns backend meta field', async () => {
      mockWikidata(FIXTURE);
      const result = await adapter.execute(
        'SELECT * WHERE { ?s ?p ?o }',
        defaultOpts,
      );
      expect(result.meta.backend).toBe('wikidata');
      expect(result.meta.limitApplied).toBe(50);
      expect(typeof result.meta.durationMs).toBe('number');
    });

    it('detects truncation when bindings count reaches limit', async () => {
      mockWikidata(FIXTURE);
      const result = await adapter.execute(
        'SELECT * WHERE { ?s ?p ?o } LIMIT 3',
        {
          timeoutMs: 10_000,
          limit: 1,
        },
      );
      expect(result.meta.truncated).toBe(true);
      expect(result.bindings.length).toBe(1);
    });

    it('does not truncate when bindings < limit', async () => {
      mockWikidata(FIXTURE);
      const result = await adapter.execute(
        'SELECT * WHERE { ?s ?p ?o } LIMIT 3',
        {
          timeoutMs: 10_000,
          limit: 100,
        },
      );
      expect(result.meta.truncated).toBe(false);
    });

    it('handles empty response (no bindings)', async () => {
      mockWikidata({ head: { vars: ['x', 'y'] }, results: { bindings: [] } });
      const result = await adapter.execute(
        'SELECT * WHERE { ?s ?p ?o }',
        defaultOpts,
      );
      expect(result.bindings).toHaveLength(0);
      expect(result.nodes).toHaveLength(0);
      expect(result.edges).toHaveLength(0);
      expect(result.meta.truncated).toBe(false);
    });

    it('handles missing head.vars gracefully', async () => {
      mockWikidata({ results: { bindings: [] } });
      const result = await adapter.execute(
        'SELECT * WHERE { ?s ?p ?o }',
        defaultOpts,
      );
      expect(result.variables).toEqual([]);
    });

    it('handles missing results.bindings gracefully', async () => {
      mockWikidata({ head: { vars: ['x'] } });
      const result = await adapter.execute(
        'SELECT * WHERE { ?s ?p ?o }',
        defaultOpts,
      );
      expect(result.bindings).toEqual([]);
    });
  });

  describe('normalization of binding types', () => {
    it('normalizes URIs correctly', async () => {
      mockWikidata(FIXTURE);
      const result = await adapter.execute(
        'SELECT * WHERE { ?s ?p ?o } LIMIT 3',
        defaultOpts,
      );
      const first = result.bindings[0];
      expect(first['city']).toEqual({
        type: 'uri',
        value: 'http://www.wikidata.org/entity/Q1486',
      });
    });

    it('normalizes literal with language tag', async () => {
      mockWikidata(FIXTURE);
      const result = await adapter.execute(
        'SELECT * WHERE { ?s ?p ?o } LIMIT 3',
        defaultOpts,
      );
      const first = result.bindings[0];
      expect(first['cityLabel']).toEqual({
        type: 'literal',
        value: 'Buenos Aires',
        lang: 'es',
      });
    });

    it('normalizes WKT Point(lng lat) to { lat, lng } with correct order', async () => {
      mockWikidata(FIXTURE);
      const result = await adapter.execute(
        'SELECT * WHERE { ?s ?p ?o } LIMIT 3',
        defaultOpts,
      );
      const first = result.bindings[0];
      expect(first['coord']).toEqual({
        type: 'coordinate',
        value: { lat: -34.6037, lng: -58.3816 },
        raw: 'Point(-58.3816 -34.6037)',
      });
    });

    it('normalizes WKT without datatype (starts with Point)', async () => {
      const fixtureNoDt = {
        head: { vars: ['loc'] },
        results: {
          bindings: [{ loc: { type: 'literal', value: 'Point(10.5 -20.3)' } }],
        },
      };
      mockWikidata(fixtureNoDt);
      const result = await adapter.execute(
        'SELECT * WHERE { ?s ?p ?o }',
        defaultOpts,
      );
      expect(result.bindings[0]['loc']).toEqual({
        type: 'coordinate',
        value: { lat: -20.3, lng: 10.5 },
        raw: 'Point(10.5 -20.3)',
      });
    });

    it('normalizes xsd:date to date type with ISO 8601 value', async () => {
      mockWikidata(FIXTURE);
      const result = await adapter.execute(
        'SELECT * WHERE { ?s ?p ?o } LIMIT 3',
        defaultOpts,
      );
      const first = result.bindings[0];
      expect(first['incep']).toEqual({
        type: 'date',
        value: '1536-02-02',
        raw: '1536-02-02',
      });
    });

    it('normalizes xsd:dateTime to date type with ISO 8601 value', async () => {
      mockWikidata(FIXTURE);
      const result = await adapter.execute(
        'SELECT * WHERE { ?s ?p ?o } LIMIT 3',
        defaultOpts,
      );
      const second = result.bindings[1];
      expect(second['incep']).toEqual({
        type: 'date',
        value: '1573-07-06T00:00:00Z',
        raw: '1573-07-06T00:00:00Z',
      });
    });

    it('preserves datatype on plain literal (non-date, non-wkt)', async () => {
      mockWikidata(FIXTURE);
      const result = await adapter.execute(
        'SELECT * WHERE { ?s ?p ?o } LIMIT 3',
        defaultOpts,
      );
      const first = result.bindings[0];
      expect(first['population']).toEqual({
        type: 'literal',
        value: '3075646',
        datatype: 'http://www.w3.org/2001/XMLSchema#decimal',
      });
    });

    it('returns literal without datatype when none present', async () => {
      const fixture = {
        head: { vars: ['val'] },
        results: {
          bindings: [{ val: { type: 'literal', value: 'hello' } }],
        },
      };
      mockWikidata(fixture);
      const result = await adapter.execute(
        'SELECT * WHERE { ?s ?p ?o }',
        defaultOpts,
      );
      expect(result.bindings[0]['val']).toEqual({
        type: 'literal',
        value: 'hello',
      });
    });
  });

  describe('node and edge derivation', () => {
    it('builds NormalizedNode from URI bindings', async () => {
      mockWikidata(FIXTURE);
      const result = await adapter.execute(
        'SELECT * WHERE { ?s ?p ?o } LIMIT 3',
        defaultOpts,
      );
      expect(result.nodes.length).toBeGreaterThan(0);
      const ba = result.nodes.find(
        (n) => n.uri === 'http://www.wikidata.org/entity/Q1486',
      );
      expect(ba).toBeDefined();
      expect(ba!.label).toBe('Buenos Aires');
      expect(ba!.coordinate).toEqual({ lat: -34.6037, lng: -58.3816 });
    });

    it('uses uri fragment as label fallback', async () => {
      const fixture = {
        head: { vars: ['city'] },
        results: {
          bindings: [
            {
              city: {
                type: 'uri',
                value: 'http://www.wikidata.org/entity/Q1486',
              },
            },
          ],
        },
      };
      mockWikidata(fixture);
      const result = await adapter.execute(
        'SELECT * WHERE { ?s ?p ?o }',
        defaultOpts,
      );
      expect(result.nodes[0].label).toBe('Q1486');
    });

    it('merges attributes across rows for same entity', async () => {
      mockWikidata(FIXTURE);
      const result = await adapter.execute(
        'SELECT * WHERE { ?s ?p ?o } LIMIT 3',
        defaultOpts,
      );
      const ba = result.nodes.find(
        (n) => n.uri === 'http://www.wikidata.org/entity/Q1486',
      );
      expect(ba).toBeDefined();
      expect(ba!.attributes['population']).toBeDefined();
      expect(ba!.attributes['cityLabel']).toBeDefined();
      expect(ba!.attributes['incep']).toBeDefined();
    });

    it('merges coordinate from later rows onto existing node', async () => {
      const fixture = {
        head: { vars: ['city', 'coord'] },
        results: {
          bindings: [
            {
              city: {
                type: 'uri',
                value: 'http://www.wikidata.org/entity/Q1486',
              },
            },
            {
              city: {
                type: 'uri',
                value: 'http://www.wikidata.org/entity/Q1486',
              },
              coord: {
                datatype: 'http://www.opengis.net/ont/geosparql#wktLiteral',
                type: 'literal',
                value: 'Point(-58.3816 -34.6037)',
              },
            },
          ],
        },
      };
      mockWikidata(fixture);
      const result = await adapter.execute(
        'SELECT * WHERE { ?s ?p ?o }',
        defaultOpts,
      );
      expect(result.nodes).toHaveLength(1);
      expect(result.nodes[0].coordinate).toEqual({
        lat: -34.6037,
        lng: -58.3816,
      });
    });

    it('creates edges between URI pairs in same row', async () => {
      const fixture = {
        head: { vars: ['person', 'city'] },
        results: {
          bindings: [
            {
              person: {
                type: 'uri',
                value: 'http://www.wikidata.org/entity/Q123',
              },
              city: {
                type: 'uri',
                value: 'http://www.wikidata.org/entity/Q1486',
              },
            },
          ],
        },
      };
      mockWikidata(fixture);
      const result = await adapter.execute(
        'SELECT * WHERE { ?s ?p ?o }',
        defaultOpts,
      );
      expect(result.edges.length).toBe(1);
      expect(result.edges[0].source).toBe(
        'http://www.wikidata.org/entity/Q123',
      );
      expect(result.edges[0].target).toBe(
        'http://www.wikidata.org/entity/Q1486',
      );
    });

    it('deduplicates edges with same source/predicate/target', async () => {
      const fixture = {
        head: { vars: ['person', 'city'] },
        results: {
          bindings: [
            {
              person: {
                type: 'uri',
                value: 'http://www.wikidata.org/entity/Q123',
              },
              city: {
                type: 'uri',
                value: 'http://www.wikidata.org/entity/Q1486',
              },
            },
            {
              person: {
                type: 'uri',
                value: 'http://www.wikidata.org/entity/Q123',
              },
              city: {
                type: 'uri',
                value: 'http://www.wikidata.org/entity/Q1486',
              },
            },
          ],
        },
      };
      mockWikidata(fixture);
      const result = await adapter.execute(
        'SELECT * WHERE { ?s ?p ?o }',
        defaultOpts,
      );
      expect(result.edges).toHaveLength(1);
    });
  });

  describe('error handling', () => {
    it('throws TimeoutError when request exceeds timeout', async () => {
      nock(WIKIDATA_BASE)
        .post(WIKIDATA_PATH)
        .delayConnection(500)
        .reply(200, FIXTURE);

      await expect(
        adapter.execute('SELECT * WHERE { ?s ?p ?o }', {
          timeoutMs: 100,
          limit: 50,
        }),
      ).rejects.toThrow(TimeoutError);
    });

    it('throws UpstreamError on 5xx', async () => {
      nock(WIKIDATA_BASE)
        .post(WIKIDATA_PATH)
        .matchHeader('User-Agent', /./)
        .reply(502, 'Bad Gateway');

      await expect(
        adapter.execute('SELECT * WHERE { ?s ?p ?o }', defaultOpts),
      ).rejects.toThrow(UpstreamError);
    });

    it('throws UpstreamError on 4xx (non-429)', async () => {
      nock(WIKIDATA_BASE)
        .post(WIKIDATA_PATH)
        .matchHeader('User-Agent', /./)
        .reply(400, 'Bad Request');

      await expect(
        adapter.execute('SELECT * WHERE { ?s ?p ?o }', defaultOpts),
      ).rejects.toThrow(UpstreamError);
    });

    it('retries on 429 and eventually succeeds', async () => {
      nock(WIKIDATA_BASE)
        .post(WIKIDATA_PATH)
        .times(2)
        .reply(429, 'Rate limited');

      nock(WIKIDATA_BASE)
        .post(WIKIDATA_PATH)
        .matchHeader('User-Agent', /./)
        .reply(200, FIXTURE);

      const result = await adapter.execute(
        'SELECT * WHERE { ?s ?p ?o }',
        defaultOpts,
      );
      expect(result.bindings.length).toBeGreaterThan(0);
    });

    it('throws after exhausting 429 retries', async () => {
      nock(WIKIDATA_BASE)
        .post(WIKIDATA_PATH)
        .times(4)
        .reply(429, 'Rate limited');

      await expect(
        adapter.execute('SELECT * WHERE { ?s ?p ?o }', defaultOpts),
      ).rejects.toThrow('Retries exhausted');
    }, 10_000);

    it('uses default timeout when opts.timeoutMs is 0', async () => {
      nock(WIKIDATA_BASE)
        .post(WIKIDATA_PATH)
        .matchHeader('User-Agent', /./)
        .reply(200, FIXTURE);

      const result = await adapter.execute('SELECT * WHERE { ?s ?p ?o }', {
        timeoutMs: 0,
        limit: 50,
      });
      expect(result.bindings.length).toBeGreaterThan(0);
    });
  });

  describe('getPredicates', () => {
    it('returns list of predicate URIs', async () => {
      const predFixture = {
        head: { vars: ['p'] },
        results: {
          bindings: [
            {
              p: {
                type: 'uri',
                value: 'http://www.wikidata.org/prop/direct/P31',
              },
            },
            {
              p: {
                type: 'uri',
                value: 'http://www.wikidata.org/prop/direct/P17',
              },
            },
          ],
        },
      };
      nock(WIKIDATA_BASE)
        .post(WIKIDATA_PATH)
        .matchHeader('User-Agent', /./)
        .reply(200, predFixture);

      const predicates = await adapter.getPredicates();
      expect(predicates).toContain('http://www.wikidata.org/prop/direct/P31');
      expect(predicates).toContain('http://www.wikidata.org/prop/direct/P17');
    });

    it('caches results and does not call HTTP again within TTL', async () => {
      const predFixture = {
        head: { vars: ['p'] },
        results: {
          bindings: [
            {
              p: {
                type: 'uri',
                value: 'http://www.wikidata.org/prop/direct/P31',
              },
            },
          ],
        },
      };

      const scope = nock(WIKIDATA_BASE)
        .post(WIKIDATA_PATH)
        .matchHeader('User-Agent', /./)
        .reply(200, predFixture);

      await adapter.getPredicates();
      const predicates = await adapter.getPredicates();

      expect(scope.pendingMocks()).toHaveLength(0);
      expect(predicates).toHaveLength(1);
    });
  });

  describe('User-Agent resolution', () => {
    it('uses default when SPARQL_USER is not set', async () => {
      delete process.env['SPARQL_USER'];
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {
        /* noop */
      });

      nock(WIKIDATA_BASE)
        .post(WIKIDATA_PATH)
        .matchHeader('User-Agent', 'rdf-gis-explorer/0.1')
        .reply(200, FIXTURE);

      await adapter.execute('SELECT * WHERE { ?s ?p ?o }', defaultOpts);
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('SPARQL_USER'),
      );
      warnSpy.mockRestore();
    });
  });
});
