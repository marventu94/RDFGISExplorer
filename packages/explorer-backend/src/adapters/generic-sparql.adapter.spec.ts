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

  describe('raw mode (export)', () => {
    it('sends the query verbatim and returns only bindings (no graph)', async () => {
      const bodies: string[] = [];
      nock(WIKIDATA_BASE)
        .post(WIKIDATA_PATH)
        .reply(200, function (_uri, requestBody) {
          const raw =
            typeof requestBody === 'string'
              ? requestBody
              : new URLSearchParams(
                  requestBody as Record<string, string>,
                ).toString();
          bodies.push(raw);
          return FIXTURE;
        });

      // Query with unprojected intermediates: in normal mode the adapter would
      // rewrite it by adding them to SELECT and would build the graph.
      const query =
        'SELECT ?city WHERE { ?city <http://www.wikidata.org/prop/direct/P17> ?country }';
      const result = await adapter.execute(query, {
        timeoutMs: 10_000,
        limit: 50,
        raw: true,
      });

      expect(bodies).toHaveLength(1);
      const sent = new URLSearchParams(bodies[0]).get('query');
      expect(sent).toBe(query);
      expect(result.bindings.length).toBeGreaterThan(0);
      expect(result.nodes).toEqual([]);
      expect(result.edges).toEqual([]);
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

    it('normalizes WKT Point with explicit CRS (GeoSPARQL 1.1)', async () => {
      const fixtureWithCrs = {
        head: { vars: ['loc'] },
        results: {
          bindings: [
            {
              loc: {
                type: 'literal',
                datatype: 'http://www.opengis.net/ont/geosparql#wktLiteral',
                value:
                  '<http://www.opengis.net/def/crs/EPSG/0/4326> Point(-57.9807688 -37.8601683)',
              },
            },
          ],
        },
      };
      mockWikidata(fixtureWithCrs);
      const result = await adapter.execute(
        'SELECT * WHERE { ?s ?p ?o }',
        defaultOpts,
      );
      expect(result.bindings[0]['loc']).toEqual({
        type: 'coordinate',
        value: { lat: -37.8601683, lng: -57.9807688 },
        raw: '<http://www.opengis.net/def/crs/EPSG/0/4326> Point(-57.9807688 -37.8601683)',
      });
    });

    it('degrades invalid WKT (e.g. POINT(None None)) to plain literal instead of throwing', async () => {
      const fixtureInvalidWkt = {
        head: { vars: ['loc'] },
        results: {
          bindings: [
            {
              loc: {
                type: 'literal',
                datatype: 'http://www.opengis.net/ont/geosparql#wktLiteral',
                value:
                  '<http://www.opengis.net/def/crs/EPSG/0/4326> POINT(None None)',
              },
            },
          ],
        },
      };
      mockWikidata(fixtureInvalidWkt);
      const result = await adapter.execute(
        'SELECT * WHERE { ?s ?p ?o }',
        defaultOpts,
      );
      expect(result.bindings[0]['loc']).toEqual({
        type: 'literal',
        value: '<http://www.opengis.net/def/crs/EPSG/0/4326> POINT(None None)',
        datatype: 'http://www.opengis.net/ont/geosparql#wktLiteral',
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

    const P31 = 'http://www.wikidata.org/prop/direct/P31';
    const Q123 = 'http://www.wikidata.org/entity/Q123';
    const Q1486 = 'http://www.wikidata.org/entity/Q1486';

    function personCityFixture(rows = 1): object {
      const row = {
        person: { type: 'uri', value: Q123 },
        city: { type: 'uri', value: Q1486 },
      };
      return {
        head: { vars: ['person', 'city'] },
        results: { bindings: Array.from({ length: rows }, () => row) },
      };
    }

    it('creates the edge with the predicate and direction declared by the query', async () => {
      mockWikidata(personCityFixture());
      const result = await adapter.execute(
        `SELECT ?person ?city WHERE { ?person <${P31}> ?city }`,
        defaultOpts,
      );
      expect(result.edges).toHaveLength(1);
      expect(result.edges[0]).toMatchObject({
        source: Q123,
        target: Q1486,
        predicate: P31,
        predicateLabel: 'P31',
      });
    });

    it('honors an inverse path by reversing the edge', async () => {
      mockWikidata(personCityFixture());
      const result = await adapter.execute(
        `SELECT ?person ?city WHERE { ?person ^<${P31}> ?city }`,
        defaultOpts,
      );
      expect(result.edges).toHaveLength(1);
      expect(result.edges[0]).toMatchObject({ source: Q1486, target: Q123 });
    });

    it('does not invent edges between variables that the query does not relate', async () => {
      mockWikidata(personCityFixture());
      // Both variables are projected, but no pattern connects them.
      const result = await adapter.execute(
        `SELECT ?person ?city WHERE { ?person <${P31}> ?otro . ?city <${P31}> ?otro2 }`,
        defaultOpts,
      );
      const entreAmbas = result.edges.filter(
        (e) =>
          (e.source === Q123 && e.target === Q1486) ||
          (e.source === Q1486 && e.target === Q123),
      );
      expect(entreAmbas).toHaveLength(0);
    });

    it('deduplicates edges with same source/predicate/target', async () => {
      mockWikidata(personCityFixture(2));
      const result = await adapter.execute(
        `SELECT ?person ?city WHERE { ?person <${P31}> ?city }`,
        defaultOpts,
      );
      expect(result.edges).toHaveLength(1);
    });

    it('resolves the predicate per row when the query uses ?s ?p ?o', async () => {
      mockWikidata({
        head: { vars: ['s', 'p', 'o'] },
        results: {
          bindings: [
            {
              s: { type: 'uri', value: Q123 },
              p: { type: 'uri', value: P31 },
              o: { type: 'uri', value: Q1486 },
            },
          ],
        },
      });
      const result = await adapter.execute(
        'SELECT * WHERE { ?s ?p ?o }',
        defaultOpts,
      );
      expect(result.edges).toHaveLength(1);
      expect(result.edges[0]).toMatchObject({
        source: Q123,
        target: Q1486,
        predicate: P31,
      });
    });

    it('draws intermediate nodes without adding them to the table', async () => {
      // The endpoint returns the intermediate because the adapter added it to SELECT.
      // nock parses the URL-encoded body into an object, so the query is in body.query.
      const scope = nock(WIKIDATA_BASE)
        .post(WIKIDATA_PATH, (body: unknown) => {
          const enviada =
            typeof body === 'string'
              ? body
              : ((body as { query?: string })?.query ?? '');
          return /\?medio/.test(enviada);
        })
        .reply(200, {
          head: { vars: ['person', 'city', 'medio'] },
          results: {
            bindings: [
              {
                person: { type: 'uri', value: Q123 },
                city: { type: 'uri', value: Q1486 },
                medio: { type: 'bnode', value: 'b0' },
              },
            ],
          },
        });

      const result = await adapter.execute(
        `SELECT ?person ?city WHERE { ?person <${P31}> ?medio . ?medio <${P31}> ?city }`,
        defaultOpts,
      );

      expect(scope.isDone()).toBe(true);
      // The table does not see the intermediate column...
      expect(result.variables).toEqual(['person', 'city']);
      expect(Object.keys(result.bindings[0])).toEqual(['person', 'city']);
      // ...but the graph does contain the node, chained through two edges.
      expect(result.nodes.map((n) => n.uri)).toContain('_:b0');
      expect(result.edges).toHaveLength(2);
      expect(result.edges.map((e) => `${e.source}->${e.target}`)).toEqual([
        `${Q123}->_:b0`,
        `_:b0->${Q1486}`,
      ]);
    });

    it('attaches coordinates and dates to the anchor node, not the intermediate', async () => {
      nock(WIKIDATA_BASE)
        .post(WIKIDATA_PATH)
        .reply(200, {
          head: { vars: ['person', 'city', 'medio'] },
          results: {
            bindings: [
              {
                person: { type: 'uri', value: Q123 },
                city: { type: 'uri', value: Q1486 },
                medio: { type: 'bnode', value: 'b0' },
              },
            ],
          },
        });

      const result = await adapter.execute(
        `SELECT ?person ?city WHERE { ?person <${P31}> ?medio . ?medio <${P31}> ?city }`,
        defaultOpts,
      );

      const intermedio = result.nodes.find((n) => n.uri === '_:b0');
      expect(intermedio?.attributes).toEqual({});
      expect(intermedio?.coordinate).toBeUndefined();
    });
  });

  describe('node classification and multi-entity attribution', () => {
    const Q_PERSONA = 'http://example.org/persona/1';
    const Q_CIUDAD = 'http://example.org/ciudad/1';
    const XSD_DT = 'http://www.w3.org/2001/XMLSchema#date';

    it('stores the source variable in queryVariable and has no type field', async () => {
      mockWikidata({
        head: { vars: ['persona'] },
        results: {
          bindings: [{ persona: { type: 'uri', value: Q_PERSONA } }],
        },
      });
      const result = await adapter.execute(
        'SELECT ?persona WHERE { ?persona <http://example.org/p> "lit" }',
        defaultOpts,
      );
      const node = result.nodes.find((n) => n.uri === Q_PERSONA);
      expect(node).toBeDefined();
      expect(node!.queryVariable).toBe('persona');
      expect(node).not.toHaveProperty('type');
    });

    it('?x a <Class> stores the URI in classes and uses rdf-type as classification.source', async () => {
      mockWikidata({
        head: { vars: ['persona'] },
        results: {
          bindings: [{ persona: { type: 'uri', value: Q_PERSONA } }],
        },
      });
      const result = await adapter.execute(
        'SELECT ?persona WHERE { ?persona a <http://schema.org/Person> }',
        defaultOpts,
      );
      const node = result.nodes.find((n) => n.uri === Q_PERSONA);
      expect(node!.classes).toEqual(['http://schema.org/Person']);
      expect(node!.classification).toEqual({
        source: 'rdf-type',
        inferred: false,
      });
    });

    it('uses query-variable as classification.source for an entity without a class assertion', async () => {
      mockWikidata({
        head: { vars: ['persona'] },
        results: {
          bindings: [{ persona: { type: 'uri', value: Q_PERSONA } }],
        },
      });
      const result = await adapter.execute(
        'SELECT ?persona WHERE { ?persona <http://example.org/p> "lit" }',
        defaultOpts,
      );
      const node = result.nodes.find((n) => n.uri === Q_PERSONA);
      expect(node!.classes).toBeUndefined();
      expect(node!.classification).toEqual({
        source: 'query-variable',
        inferred: false,
      });
    });

    it('records both classes when two `a` assertions target the same variable', async () => {
      mockWikidata({
        head: { vars: ['persona'] },
        results: {
          bindings: [{ persona: { type: 'uri', value: Q_PERSONA } }],
        },
      });
      const result = await adapter.execute(
        `SELECT ?persona WHERE {
          ?persona a <http://schema.org/Person> .
          ?persona a <http://xmlns.com/foaf/0.1/Agent> .
        }`,
        defaultOpts,
      );
      const node = result.nodes.find((n) => n.uri === Q_PERSONA);
      expect(node!.classes).toEqual([
        'http://schema.org/Person',
        'http://xmlns.com/foaf/0.1/Agent',
      ]);
      expect(node!.classification?.source).toBe('rdf-type');
    });

    it('attaches each date to its linked entity in a multi-entity row', async () => {
      mockWikidata({
        head: { vars: ['persona', 'ciudad', 'fechaNac', 'fundacion'] },
        results: {
          bindings: [
            {
              persona: { type: 'uri', value: Q_PERSONA },
              ciudad: { type: 'uri', value: Q_CIUDAD },
              fechaNac: {
                type: 'literal',
                datatype: XSD_DT,
                value: '1980-01-01',
              },
              fundacion: {
                type: 'literal',
                datatype: XSD_DT,
                value: '1536-02-02',
              },
            },
          ],
        },
      });
      const result = await adapter.execute(
        `SELECT ?persona ?ciudad ?fechaNac ?fundacion WHERE {
          ?persona <http://example.org/nacimiento> ?fechaNac .
          ?ciudad <http://example.org/fundacion> ?fundacion .
        }`,
        defaultOpts,
      );

      const persona = result.nodes.find((n) => n.uri === Q_PERSONA);
      const ciudad = result.nodes.find((n) => n.uri === Q_CIUDAD);
      expect(persona!.temporalEvents?.map((e) => e.field)).toEqual([
        'fechaNac',
      ]);
      expect(ciudad!.temporalEvents?.map((e) => e.field)).toEqual([
        'fundacion',
      ]);
      // Attributes follow the same rule.
      expect(persona!.attributes['fechaNac']).toBeDefined();
      expect(persona!.attributes['fundacion']).toBeUndefined();
      expect(ciudad!.attributes['fundacion']).toBeDefined();
      expect(ciudad!.attributes['fechaNac']).toBeUndefined();
    });

    it('attributes the date and coordinate to the blank node used as triple subject', async () => {
      mockWikidata({
        head: { vars: ['inmueble', 'wkt', 'fecha', 'f'] },
        results: {
          bindings: [
            {
              inmueble: { type: 'uri', value: 'http://example.org/inmueble/1' },
              f: { type: 'bnode', value: 'b0' },
              wkt: {
                type: 'literal',
                datatype: 'http://www.opengis.net/ont/geosparql#wktLiteral',
                value: 'Point(-58.3816 -34.6037)',
              },
              fecha: { type: 'literal', datatype: XSD_DT, value: '2020-05-01' },
            },
          ],
        },
      });
      const result = await adapter.execute(
        `SELECT ?inmueble ?wkt ?fecha WHERE {
          ?inmueble <http://example.org/hasFeature> ?f .
          ?f <http://example.org/asWKT> ?wkt .
          ?f <http://example.org/fechaAlta> ?fecha .
        }`,
        defaultOpts,
      );

      const inmueble = result.nodes.find(
        (n) => n.uri === 'http://example.org/inmueble/1',
      );
      const intermedio = result.nodes.find((n) => n.uri === '_:b0');
      // The anchor retains data consumed by map/timeline, while the blank node
      // records the direct property for topology inspection.
      expect(inmueble!.coordinate).toEqual({ lat: -34.6037, lng: -58.3816 });
      expect(inmueble!.temporalEvents?.map((e) => e.field)).toEqual(['fecha']);
      expect(inmueble!.attributes['wkt']).toBeDefined();
      expect(inmueble!.attributes['fecha']).toBeDefined();
      expect(intermedio!.attributes).toEqual({});
      expect(intermedio!.directAttributes?.['wkt']).toBeDefined();
      expect(intermedio!.directAttributes?.['fecha']).toBeDefined();
    });

    it('does not prefix an already prefixed bnode label twice', async () => {
      mockWikidata({
        head: { vars: ['x'] },
        results: {
          bindings: [{ x: { type: 'bnode', value: '_:b0' } }],
        },
      });
      const result = await adapter.execute(
        'SELECT ?x WHERE { ?x <http://example.org/p> "lit" }',
        defaultOpts,
      );
      expect(result.nodes.map((n) => n.uri)).toContain('_:b0');
      expect(result.nodes.map((n) => n.uri)).not.toContain('_:_:b0');
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
        .matchHeader('User-Agent', /rdf-gis-explorer\/0\.1/)
        .reply(200, FIXTURE);

      await adapter.execute('SELECT * WHERE { ?s ?p ?o }', defaultOpts);
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('SPARQL_USER'),
      );
      warnSpy.mockRestore();
    });
  });
});

describe('GenericSparqlAdapter.searchEntities', () => {
  let adapter: GenericSparqlAdapter;

  beforeEach(() => {
    adapter = new GenericSparqlAdapter('custom');
    process.env['SPARQL_USER'] = 'test-agent/1.0';
    process.env['SPARQL_ENDPOINT_URL'] =
      'http://localhost:7200/repositories/test';
  });

  afterEach(() => {
    nock.cleanAll();
    delete process.env['SPARQL_USER'];
    delete process.env['SPARQL_ENDPOINT_URL'];
    delete process.env['SPARQL_ENTITY_SEARCH_QUERY'];
  });

  function captureQuery(): { get: () => string; scope: nock.Scope } {
    let sent = '';
    const scope = nock('http://localhost:7200')
      .post('/repositories/test', (body: unknown) => {
        sent =
          typeof body === 'string'
            ? (new URLSearchParams(body).get('query') ?? '')
            : ((body as Record<string, string>)['query'] ?? '');
        return true;
      })
      .reply(200, { head: { vars: [] }, results: { bindings: [] } });
    return { get: () => sent, scope };
  }

  it('searches labels by regex and maps the results', async () => {
    nock('http://localhost:7200')
      .post('/repositories/test')
      .reply(200, {
        head: { vars: ['uri', 'label'] },
        results: {
          bindings: [
            {
              uri: { type: 'uri', value: 'http://example.org/entity/1' },
              label: { type: 'literal', value: 'Entity One' },
            },
          ],
        },
      });

    const results = await adapter.searchEntities('entity', { limit: 10 });

    expect(results).toHaveLength(1);
    expect(results[0].uri).toBe('http://example.org/entity/1');
    expect(results[0].label).toBe('Entity One');
  });

  it('injects the class filter when requested', async () => {
    const captured = captureQuery();

    await adapter.searchEntities('entity', {
      limit: 10,
      classUri: 'http://example.org/Class',
    });

    expect(captured.get()).toContain('?uri a <http://example.org/Class>');
  });

  it('escapes injection attempts in the keyword', async () => {
    const captured = captureQuery();

    // Malicious keyword: closes the literal, injects a pattern, and uses replace's $&.
    await adapter.searchEntities('x\\" } UNION { ?s ?p ?o } #$&', {
      limit: 10,
    });

    const sentQuery = captured.get();
    // The literal remains closed: backslash and quote are escaped.
    expect(sentQuery).toContain('x\\\\\\" } UNION');
    // No unescaped quote remains to terminate the string.
    expect(sentQuery).not.toContain('x\\" }');
    // $& was not expanded as a replacement pattern, which would duplicate the query.
    expect(sentQuery).toContain('#$&');
  });

  it('honors a custom template and does NOT inject the class filter', async () => {
    process.env['SPARQL_ENTITY_SEARCH_QUERY'] =
      'SELECT ?uri ?label WHERE { ?uri ?p "$keyword" } LIMIT $limit';
    const captured = captureQuery();

    await adapter.searchEntities('algo', {
      limit: 7,
      classUri: 'http://example.org/Class',
    });

    const sentQuery = captured.get();
    expect(sentQuery).toContain('"algo"');
    expect(sentQuery).toContain('LIMIT 7');
    expect(sentQuery).not.toContain('http://example.org/Class');
  });
});
