import nock from 'nock';
import { Test, TestingModule } from '@nestjs/testing';
import { HttpException } from '@nestjs/common';
import { QueryService } from './query.service';
import {
  SPARQL_ENDPOINT,
  TimeoutError,
} from '../../adapters/sparql-endpoint.interface';
import { GenericSparqlAdapter } from '../../adapters/generic-sparql.adapter';
import { QueryResult } from '../../shared/dto/query-result.dto';

const USER_QUERY =
  'PREFIX wd: <http://www.wikidata.org/entity/>\n' +
  'SELECT ?item ?price ?date WHERE { ?item wd:P31 wd:Q5 . ?item ?p ?price . ?item ?d ?date } LIMIT 50';

function emptyResult(): QueryResult {
  return {
    variables: [],
    bindings: [],
    nodes: [],
    edges: [],
    meta: {
      durationMs: 1,
      truncated: false,
      limitApplied: 100,
      backend: 'wikidata',
    },
  };
}

function aggRowResult(bindings: QueryResult['bindings']): QueryResult {
  return { ...emptyResult(), bindings };
}

/** Query SPARQL enviada al endpoint en la llamada `callIndex` (0-based). */
function sentQuery(executeMock: jest.Mock, callIndex = 0): string {
  const calls = executeMock.mock.calls as unknown as [string, unknown][];
  return calls[callIndex][0];
}

describe('QueryService.summarize', () => {
  let service: QueryService;
  let executeMock: jest.Mock;

  beforeEach(async () => {
    executeMock = jest.fn();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        QueryService,
        {
          provide: SPARQL_ENDPOINT,
          useValue: {
            backendName: 'wikidata',
            execute: executeMock,
            getPredicates: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<QueryService>(QueryService);
  });

  it('wraps the user query as subquery with PREFIX hoisted outside', async () => {
    executeMock.mockResolvedValue(
      aggRowResult([{ __agg_total: { type: 'literal', value: '42' } }]),
    );

    await service.summarize({ query: USER_QUERY });

    const sent = sentQuery(executeMock);
    // El PREFIX queda al nivel externo, antes del SELECT agregado...
    expect(sent).toMatch(
      /^PREFIX wd: <http:\/\/www\.wikidata\.org\/entity\/>\nSELECT/,
    );
    // ...y la subquery envuelta no contiene PREFIX (inválido en varios endpoints).
    const subqueryStart = sent.indexOf('WHERE { {');
    expect(subqueryStart).toBeGreaterThan(-1);
    expect(sent.slice(subqueryStart)).not.toContain('PREFIX');
    // El cuerpo conserva los LIMIT internos de la query del usuario.
    expect(sent.slice(subqueryStart)).toContain('LIMIT 50');
  });

  it('builds COUNT total + numeric + temporal aggregates in a single query', async () => {
    executeMock.mockResolvedValue(
      aggRowResult([
        {
          __agg_total: { type: 'literal', value: '2000' },
          __agg_count_price: { type: 'literal', value: '1800' },
          __agg_min_price: { type: 'literal', value: '10.5' },
          __agg_max_price: { type: 'literal', value: '999' },
          __agg_avg_price: { type: 'literal', value: '123.456' },
          __agg_tmin_date: {
            type: 'date',
            value: '1990-01-01T00:00:00Z',
            raw: '1990-01-01T00:00:00Z',
          },
          __agg_tmax_date: {
            type: 'date',
            value: '2024-12-31T00:00:00Z',
            raw: '2024-12-31T00:00:00Z',
          },
        },
      ]),
    );

    const summary = await service.summarize({
      query: USER_QUERY,
      numericVars: ['price'],
      temporalVars: ['date'],
    });

    const sent = sentQuery(executeMock);
    expect(sent).toContain('(COUNT(*) AS ?__agg_total)');
    expect(sent).toContain('(COUNT(?price) AS ?__agg_count_price)');
    expect(sent).toContain('(MIN(?price) AS ?__agg_min_price)');
    expect(sent).toContain('(MAX(?price) AS ?__agg_max_price)');
    expect(sent).toContain('(AVG(?price) AS ?__agg_avg_price)');
    expect(sent).toContain('(MIN(?date) AS ?__agg_tmin_date)');
    expect(sent).toContain('(MAX(?date) AS ?__agg_tmax_date)');

    expect(summary.totalRows).toBe(2000);
    expect(summary.numeric).toEqual([
      { variable: 'price', count: 1800, min: 10.5, max: 999, avg: 123.456 },
    ]);
    expect(summary.temporal).toEqual([
      {
        variable: 'date',
        min: '1990-01-01T00:00:00Z',
        max: '2024-12-31T00:00:00Z',
      },
    ]);
    expect(summary.failed).toEqual({
      total: false,
      numeric: [],
      temporal: [],
      categorical: [],
    });
    expect(summary.meta.backend).toBe('wikidata');
  });

  it('builds one GROUP BY top-values query per categorical variable', async () => {
    executeMock.mockResolvedValueOnce(
      aggRowResult([{ __agg_total: { type: 'literal', value: '3' } }]),
    );
    executeMock.mockResolvedValueOnce(
      aggRowResult([
        {
          city: { type: 'uri', value: 'http://www.wikidata.org/entity/Q1486' },
          __agg_c: { type: 'literal', value: '10' },
        },
        {
          city: { type: 'uri', value: 'http://www.wikidata.org/entity/Q649' },
          __agg_c: { type: 'literal', value: '5' },
        },
      ]),
    );

    const summary = await service.summarize({
      query: USER_QUERY,
      categoricalVars: ['city'],
    });

    const sent = sentQuery(executeMock, 1);
    expect(sent).toContain('SELECT ?city (COUNT(*) AS ?__agg_c)');
    expect(sent).toContain('GROUP BY ?city');
    expect(sent).toContain('ORDER BY DESC(?__agg_c)');
    expect(sent).toContain('LIMIT 12');

    expect(summary.categorical).toEqual([
      {
        variable: 'city',
        values: [
          { value: 'http://www.wikidata.org/entity/Q1486', count: 10 },
          { value: 'http://www.wikidata.org/entity/Q649', count: 5 },
        ],
      },
    ]);
  });

  it('honors SUMMARY_TOP_CATEGORICAL_LIMIT from env', async () => {
    process.env['SUMMARY_TOP_CATEGORICAL_LIMIT'] = '7';
    try {
      executeMock.mockResolvedValueOnce(
        aggRowResult([{ __agg_total: { type: 'literal', value: '3' } }]),
      );
      executeMock.mockResolvedValueOnce(aggRowResult([]));

      await service.summarize({ query: USER_QUERY, categoricalVars: ['city'] });

      expect(sentQuery(executeMock, 1)).toContain('LIMIT 7');
    } finally {
      delete process.env['SUMMARY_TOP_CATEGORICAL_LIMIT'];
    }
  });

  it.each(['ASK', 'CONSTRUCT', 'DESCRIBE'])(
    'rejects %s queries with 400',
    async (type) => {
      const queries: Record<string, string> = {
        ASK: 'ASK { ?s ?p ?o }',
        CONSTRUCT: 'CONSTRUCT { ?s ?p ?o } WHERE { ?s ?p ?o }',
        DESCRIBE: 'DESCRIBE <http://example.org/x>',
      };
      try {
        await service.summarize({ query: queries[type] });
        fail('Expected HttpException');
      } catch (e) {
        expect(e).toBeInstanceOf(HttpException);
        const httpEx = e as HttpException;
        expect(httpEx.getStatus()).toBe(400);
        expect((httpEx.getResponse() as Record<string, unknown>).error).toBe(
          'INVALID_QUERY_TYPE',
        );
      }
      expect(executeMock).not.toHaveBeenCalled();
    },
  );

  it('rejects invalid SPARQL with 400 INVALID_SPARQL', async () => {
    try {
      await service.summarize({ query: 'NOT VALID SPARQL' });
      fail('Expected HttpException');
    } catch (e) {
      const httpEx = e as HttpException;
      expect(httpEx.getStatus()).toBe(400);
      expect((httpEx.getResponse() as Record<string, unknown>).error).toBe(
        'INVALID_SPARQL',
      );
    }
  });

  it('degrades partially: main aggregate failure marks total+numeric+temporal, categoricals still run', async () => {
    executeMock.mockRejectedValueOnce(new TimeoutError(30000));
    executeMock.mockResolvedValueOnce(
      aggRowResult([
        {
          city: { type: 'uri', value: 'http://x/C' },
          __agg_c: { type: 'literal', value: '7' },
        },
      ]),
    );

    const summary = await service.summarize({
      query: USER_QUERY,
      numericVars: ['price'],
      temporalVars: ['date'],
      categoricalVars: ['city'],
    });

    expect(summary.totalRows).toBeNull();
    expect(summary.numeric).toEqual([]);
    expect(summary.temporal).toEqual([]);
    expect(summary.failed.total).toBe(true);
    expect(summary.failed.numeric).toEqual(['price']);
    expect(summary.failed.temporal).toEqual(['date']);
    // La sección categórica se ejecutó igual (nunca 500 por una sección).
    expect(summary.categorical).toEqual([
      { variable: 'city', values: [{ value: 'http://x/C', count: 7 }] },
    ]);
    expect(summary.failed.categorical).toEqual([]);
  });

  it('degrades partially: one failing categorical is marked, the rest survive', async () => {
    executeMock.mockResolvedValueOnce(
      aggRowResult([{ __agg_total: { type: 'literal', value: '9' } }]),
    );
    executeMock.mockRejectedValueOnce(new Error('endpoint exploded'));
    executeMock.mockResolvedValueOnce(
      aggRowResult([
        {
          kind: { type: 'literal', value: 'house' },
          __agg_c: { type: 'literal', value: '2' },
        },
      ]),
    );

    const summary = await service.summarize({
      query: USER_QUERY,
      categoricalVars: ['city', 'kind'],
    });

    expect(summary.totalRows).toBe(9);
    expect(summary.failed.categorical).toEqual(['city']);
    expect(summary.categorical).toEqual([
      { variable: 'kind', values: [{ value: 'house', count: 2 }] },
    ]);
  });

  it('does not collide with user variables named like aggregation aliases', async () => {
    executeMock.mockResolvedValue(
      aggRowResult([{ __agg_total: { type: 'literal', value: '5' } }]),
    );

    const summary = await service.summarize({
      query: 'SELECT ?__agg_total WHERE { ?s ?p ?__agg_total }',
      // El nombre reservado se descarta como variable a agregar.
      numericVars: ['__agg_total'],
    });

    const sent = sentQuery(executeMock);
    expect(sent).toContain('(COUNT(*) AS ?__agg_total)');
    // No se generaron agregados sobre la variable del usuario (sanitize).
    expect(sent).not.toContain('AVG(?__agg_total)');
    expect(summary.totalRows).toBe(5);
    expect(summary.numeric).toEqual([]);
  });

  it('drops unsafe variable names instead of interpolating them', async () => {
    executeMock.mockResolvedValue(
      aggRowResult([{ __agg_total: { type: 'literal', value: '1' } }]),
    );

    await service.summarize({
      query: USER_QUERY,
      numericVars: ['x; DROP TABLE', 'ok_var'],
    });

    const sent = sentQuery(executeMock);
    expect(sent).not.toContain('DROP TABLE');
    expect(sent).toContain('(AVG(?ok_var) AS ?__agg_avg_ok_var)');
  });

  it('honors the requested timeoutMs', async () => {
    executeMock.mockResolvedValue(
      aggRowResult([{ __agg_total: { type: 'literal', value: '1' } }]),
    );

    await service.summarize({ query: USER_QUERY, timeoutMs: 5000 });

    expect(executeMock).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ timeoutMs: 5000 }),
    );
  });
});

describe('QueryService.summarize through GenericSparqlAdapter (nock)', () => {
  const BASE = 'http://sparql.test';
  let service: QueryService;

  beforeEach(async () => {
    process.env['SPARQL_ENDPOINT_URL'] = `${BASE}/sparql`;
    process.env['SPARQL_USER'] = 'summary-test/1.0';
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        QueryService,
        {
          provide: SPARQL_ENDPOINT,
          useValue: new GenericSparqlAdapter('wikidata'),
        },
      ],
    }).compile();
    service = module.get<QueryService>(QueryService);
  });

  afterEach(() => {
    nock.cleanAll();
    delete process.env['SPARQL_ENDPOINT_URL'];
    delete process.env['SPARQL_USER'];
  });

  it('sends the wrapped query upstream and maps the JSON result into a summary', async () => {
    const bodies: string[] = [];
    nock(BASE)
      .post('/sparql')
      .reply(200, function (_uri, requestBody) {
        const raw =
          typeof requestBody === 'string'
            ? requestBody
            : new URLSearchParams(
                requestBody as Record<string, string>,
              ).toString();
        bodies.push(raw);
        return {
          head: { vars: ['__agg_total', '__agg_avg_price'] },
          results: {
            bindings: [
              {
                __agg_total: {
                  type: 'literal',
                  datatype: 'http://www.w3.org/2001/XMLSchema#integer',
                  value: '321',
                },
                __agg_avg_price: {
                  type: 'literal',
                  datatype: 'http://www.w3.org/2001/XMLSchema#decimal',
                  value: '55.5',
                },
              },
            ],
          },
        };
      });

    const summary = await service.summarize({
      query: USER_QUERY,
      numericVars: ['price'],
    });

    expect(bodies).toHaveLength(1);
    const sentQuery = new URLSearchParams(bodies[0]).get('query') ?? '';
    expect(sentQuery).toContain('PREFIX wd: <http://www.wikidata.org/entity/>');
    expect(sentQuery).toContain('(COUNT(*) AS ?__agg_total)');
    expect(sentQuery).toContain('WHERE { {');
    expect(summary.totalRows).toBe(321);
    expect(summary.numeric).toEqual([
      { variable: 'price', count: 0, min: null, max: null, avg: 55.5 },
    ]);
  });
});
