import { ConfigService } from '@nestjs/config';
import type { QueryResult, ResultBinding } from '@rdfgis/contracts';
import type { SparqlEndpoint } from '../../adapters/sparql-endpoint.interface';
import { DiscoveryService } from './discovery.service';

const lit = (value: string) => ({ type: 'literal' as const, value });
const uri = (value: string) => ({ type: 'uri' as const, value });
function result(bindings: ResultBinding[]): QueryResult {
  return {
    variables: [],
    bindings,
    nodes: [],
    edges: [],
    meta: {
      durationMs: 1,
      truncated: false,
      limitApplied: 61,
      backend: 'test',
    },
  };
}
describe('DiscoveryService', () => {
  let execute: jest.MockedFunction<SparqlEndpoint['execute']>;
  let searchEntities: jest.MockedFunction<SparqlEndpoint['searchEntities']>;
  let service: DiscoveryService;
  beforeEach(() => {
    execute = jest.fn();
    searchEntities = jest.fn().mockResolvedValue([]);
    service = new DiscoveryService(
      { execute, searchEntities } as unknown as SparqlEndpoint,
      new ConfigService({ DISCOVERY_SAMPLE_SIZE: 2, DISCOVERY_PATH_BUDGET: 2 }),
    );
  });
  it('preserves combined evidence and URI fallback, caching only the same normalized search', async () => {
    execute.mockResolvedValue(
      result([{ uri: uri('urn:House'), evidence: lit('observed,declared') }]),
    );
    const response = await service.catalog('class', 'House');
    expect(response.items).toHaveLength(1);
    expect(response.items[0]).toMatchObject({
      label: 'urn:House',
      evidence: ['observed', 'declared'],
    });
    await service.catalog('class', ' HOUSE ');
    expect(execute).toHaveBeenCalledTimes(1);
    await service.catalog('class', 'Address');
    expect(execute).toHaveBeenCalledTimes(2);
    expect(execute.mock.calls[1][0]).toContain('"address"');
  });
  it('coalesces identical searches into one bounded request', async () => {
    let complete!: (data: QueryResult) => void;
    execute.mockImplementation(
      () =>
        new Promise<QueryResult>((resolve) => {
          complete = resolve;
        }),
    );
    const requests = Array.from({ length: 20 }, () =>
      service.catalog('class', 'House'),
    );
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(execute).toHaveBeenCalledTimes(1);
    complete(result([{ uri: uri('urn:House'), evidence: lit('observed') }]));
    const responses = await Promise.all(requests);
    expect(
      responses.every((response) => response.items[0].uri === 'urn:House'),
    ).toBe(true);
    expect(execute.mock.calls[0][1]).toMatchObject({
      raw: true,
      maxRetries: 0,
      limit: 51,
    });
    expect(execute.mock.calls[0][0]).toContain('"house"');
    expect(execute.mock.calls[0][0]).not.toContain('5001');
  });
  it('cancels abandoned class searches without cooling down the next search', async () => {
    const controller = new AbortController();
    execute.mockImplementationOnce(
      (_query, options) =>
        new Promise((_resolve, reject) => {
          options.signal!.addEventListener(
            'abort',
            () => reject(new DOMException('cancelled', 'AbortError')),
            { once: true },
          );
        }),
    );
    const pending = service.catalog('class', 'hou', 0, controller.signal);
    const cancelled = expect(pending).rejects.toMatchObject({
      name: 'AbortError',
    });
    await new Promise<void>((resolve) => setImmediate(resolve));
    const signal = execute.mock.calls[0][1].signal!;
    controller.abort();
    await cancelled;
    expect(signal.aborted).toBe(true);
    execute.mockResolvedValue(result([]));
    await service.catalog('class', 'house');
    expect(execute).toHaveBeenCalledTimes(2);
  });
  it('backs off after an upstream failure even when the user changes category or text', async () => {
    execute.mockRejectedValue(new Error('upstream timeout'));
    await expect(service.catalog('class', 'houw')).rejects.toThrow(
      'upstream timeout',
    );
    await expect(service.catalog('class', 'house')).rejects.toMatchObject({
      status: 503,
    });
    await expect(service.catalog('resource', 'other')).rejects.toMatchObject({
      status: 503,
    });
    expect(execute).toHaveBeenCalledTimes(1);
  });
  it('resumes discovery after the cooldown and refreshes an expired catalogue page', async () => {
    const clock = jest.spyOn(Date, 'now').mockReturnValue(1000);
    try {
      service = new DiscoveryService(
        { execute } as unknown as SparqlEndpoint,
        new ConfigService({
          DISCOVERY_CATALOG_TTL_MS: 100,
          DISCOVERY_FAILURE_COOLDOWN_MS: 100,
        }),
      );
      execute
        .mockRejectedValueOnce(new Error('timeout'))
        .mockResolvedValue(result([]));
      await expect(service.catalog('class', 'House')).rejects.toThrow(
        'timeout',
      );
      clock.mockReturnValue(1101);
      await service.catalog('class', 'House');
      await service.catalog('class', 'House');
      expect(execute).toHaveBeenCalledTimes(2);
      clock.mockReturnValue(1202);
      await service.catalog('class', 'House');
      expect(execute).toHaveBeenCalledTimes(3);
    } finally {
      clock.mockRestore();
    }
  });
  it('reports the remaining pause and does not prolong it when another search is blocked', async () => {
    const clock = jest.spyOn(Date, 'now').mockReturnValue(1000);
    try {
      execute
        .mockRejectedValueOnce(new Error('timeout'))
        .mockResolvedValue(result([]));
      await expect(service.catalog('class', 'House')).rejects.toThrow(
        'timeout',
      );
      clock.mockReturnValue(30000);
      await expect(
        service.catalog('resource', 'Berisso'),
      ).rejects.toMatchObject({
        response: { error: 'DISCOVERY_COOLDOWN', retryAfterSeconds: 1 },
      });
      await expect(service.catalog('class', 'House')).rejects.toMatchObject({
        response: { error: 'DISCOVERY_COOLDOWN', retryAfterSeconds: 1 },
      });
      expect(execute).toHaveBeenCalledTimes(1);
      clock.mockReturnValue(31001);
      await service.catalog('resource', 'Berisso');
      expect(searchEntities).toHaveBeenCalledTimes(1);
      expect(execute).toHaveBeenCalledTimes(1);
    } finally {
      clock.mockRestore();
    }
  });
  it('returns 50 terms and uses only one lookahead term to offer the next page', async () => {
    const rows = Array.from({ length: 51 }, (_, i) => ({
      uri: uri(`urn:House${i}`),
      evidence: lit('observed'),
    }));
    execute.mockResolvedValue(result(rows));
    const page = await service.catalog('class', 'House');
    expect(page.items).toHaveLength(50);
    expect(page).toMatchObject({ truncated: true, nextOffset: 50 });
    execute.mockResolvedValue(result(rows.slice(0, 1)));
    expect(await service.catalog('class', 'House', 50)).toMatchObject({
      truncated: true,
      sampled: true,
      nextOffset: undefined,
    });
    expect(execute.mock.calls[1][0]).toContain('LIMIT 51 OFFSET 50');
  });
  it('uses the configured catalogue page size independently of neighborhood limits', async () => {
    service = new DiscoveryService(
      { execute } as unknown as SparqlEndpoint,
      new ConfigService({
        DISCOVERY_CATALOG_PAGE_SIZE: 2,
        DISCOVERY_RESULT_LIMIT: 60,
        DISCOVERY_CATALOG_MAX_ROWS: 5000,
      }),
    );
    execute.mockResolvedValue(
      result([
        { uri: uri('urn:A'), evidence: lit('observed') },
        { uri: uri('urn:B'), evidence: lit(',declared') },
        { uri: uri('urn:C'), evidence: lit('observed') },
      ]),
    );
    const page = await service.catalog('class', '');
    expect(page.items).toHaveLength(2);
    expect(page.items[1].evidence).toEqual(['declared']);
    expect(page.nextOffset).toBe(2);
    expect(execute.mock.calls[0][1].limit).toBe(3);
  });
  it('reuses entity search for resources, preserving text, pagination and bounded cancellation', async () => {
    searchEntities.mockResolvedValue(
      Array.from({ length: 51 }, (_, index) => ({
        uri: `urn:listing:${index}`,
        label: `Casa ${index}`,
      })),
    );
    const page = await service.catalog('resource', ' Casa ', 50);
    expect(searchEntities).toHaveBeenCalledWith(
      'Casa',
      expect.objectContaining({
        limit: 51,
        offset: 50,
        timeoutMs: 8000,
        waitForServerOnCancel: true,
      }),
    );
    expect(page).toMatchObject({
      sampled: false,
      truncated: true,
      nextOffset: 100,
    });
    expect(page.items).toHaveLength(50);
    expect(page.items[0]).toMatchObject({ label: 'Casa 0', kind: 'resource' });
    expect(searchEntities.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
    expect(execute).not.toHaveBeenCalled();
    await service.catalog('resource', 'Casa', 50);
    expect(searchEntities).toHaveBeenCalledTimes(1);
    searchEntities.mockResolvedValue([]);
    expect(await service.catalog('resource', 'Casa', 100)).toMatchObject({
      items: [],
      sampled: false,
      truncated: false,
      nextOffset: undefined,
    });
  });
  it('uses an adapter catalogue capability for every typed search, preserving pagination', async () => {
    const searchCatalog = jest.fn().mockResolvedValue({
      items: [],
      sampled: true,
      truncated: true,
      nextOffset: 50,
    });
    service = new DiscoveryService(
      { execute, searchCatalog } as unknown as SparqlEndpoint,
      new ConfigService({ DISCOVERY_CATALOG_PAGE_SIZE: 20 }),
    );
    for (const kind of ['class', 'property', 'resource'] as const) {
      expect(await service.catalog(kind, 'House', 10)).toMatchObject({
        nextOffset: 50,
      });
      expect(searchCatalog).toHaveBeenLastCalledWith(
        kind,
        'house',
        expect.objectContaining({ limit: 20, offset: 10, timeoutMs: 8000 }),
      );
    }
    expect(execute).not.toHaveBeenCalled();
  });
  it('uses configured statement sample sizes and class predicates for generic catalogues', async () => {
    service = new DiscoveryService(
      { execute } as unknown as SparqlEndpoint,
      new ConfigService({
        DISCOVERY_CATALOG_SAMPLE_SIZE: 123,
        DISCOVERY_CLASS_PREDICATE: 'urn:instanceOf',
        DISCOVERY_SUBCLASS_PREDICATE: 'urn:subclassOf',
      }),
    );
    execute.mockResolvedValue(result([]));
    const page = await service.catalog('class', 'House');
    expect(page).toMatchObject({
      sampled: true,
      truncated: true,
      nextOffset: undefined,
    });
    expect(execute.mock.calls[0][0]).toContain('LIMIT 123');
    expect(execute.mock.calls[0][0]).toContain('<urn:instanceOf>');
    expect(execute.mock.calls[0][0]).toContain('<urn:subclassOf>');
  });
  it('counts distinct sampled entities and retains one direction if another fails', async () => {
    // Mock the async port with synchronous fixture construction.
    // eslint-disable-next-line @typescript-eslint/require-await
    execute.mockImplementation(async (query: string) => {
      if (query.includes('COUNT(*)')) return result([{ total: lit('3') }]);
      if (query.includes('?neighbor ?predicate ?__d_focus'))
        throw new Error('timeout');
      return result([
        {
          predicate: uri('urn:feature'),
          kind: lit('resource'),
          entities: lit('2'),
          example: lit('b0'),
          exampleKindValue: lit('bnode'),
        },
      ]);
    });
    const response = await service.connections({ classUri: 'urn:House' });
    expect(response.sampled).toBe(true);
    expect(response.sampledEntities).toBe(2);
    expect(response.failedDirections).toEqual(['in']);
    expect(response.connections[0].examples[0].kind).toBe('bnode');
    expect(execute.mock.calls.every(([, options]) => options.raw)).toBe(true);
  });
  it('uses adapter vocabulary and returns readable Wikidata properties, types and values', async () => {
    service = new DiscoveryService(
      {
        execute,
        describeEndpoint: () => ({
          discovery: {
            classPredicate: 'urn:instanceOf',
            predicateNamespace: 'urn:direct:',
            wikidataLabels: true,
          },
        }),
      } as unknown as SparqlEndpoint,
      new ConfigService(),
    );
    execute
      .mockResolvedValueOnce(result([{ total: lit('1') }]))
      .mockResolvedValueOnce(
        result([
          {
            predicate: uri('urn:direct:author'),
            label: lit('author'),
            targetClass: uri('urn:Human'),
            targetLabel: lit('human'),
            kind: lit('resource'),
            entities: lit('1'),
            example: lit('urn:writer'),
            exampleKindValue: lit('uri'),
            exampleLabel: lit('Writer'),
          },
        ]),
      )
      .mockResolvedValueOnce(result([]));
    const response = await service.connections({ uri: 'urn:book' });
    expect(response.failedDirections).toEqual([]);
    expect(response.connections[0]).toMatchObject({
      label: 'author',
      targetLabel: 'human',
      examples: [{ kind: 'uri', value: 'urn:writer', label: 'Writer' }],
    });
    expect(execute.mock.calls[1][0]).toContain(
      '?neighbor <urn:instanceOf> ?targetClass',
    );
    expect(execute.mock.calls[1][0]).toContain('"urn:direct:"');
  });
  it('does not query relationships for an empty set', async () => {
    execute.mockResolvedValue(result([{ total: lit('0') }]));
    expect(
      (await service.connections({ classUri: 'urn:Empty' })).connections,
    ).toEqual([]);
    expect(execute).toHaveBeenCalledTimes(1);
  });
  it('validates the full path, including an incoming edge, and never invents a connection from class adjacency', async () => {
    // Mock the async port with synchronous fixture construction.
    // eslint-disable-next-line @typescript-eslint/require-await
    execute.mockImplementation(async (query: string) => {
      if (query.includes('COUNT(*)')) return result([{ total: lit('1') }]);
      if (query.includes('?__d_step0')) {
        expect(query).toContain('?__d_step0 <urn:about> ?__d_root');
        return query.includes('?__d_focus ?predicate ?neighbor')
          ? result([
              {
                predicate: uri('urn:function'),
                kind: lit('resource'),
                entities: lit('1'),
                exampleKindValue: lit('uri'),
                example: lit('urn:Sell'),
              },
            ])
          : result([]);
      }
      return query.includes('?neighbor ?predicate ?__d_focus')
        ? result([
            {
              predicate: uri('urn:about'),
              targetClass: uri('urn:Listing'),
              kind: lit('resource'),
              entities: lit('1'),
            },
          ])
        : result([]);
    });
    const response = await service.paths(
      { classUri: 'urn:House' },
      'urn:function',
      'property',
    );
    expect(response.paths).toHaveLength(1);
    expect(response.paths[0].map((s) => s.direction)).toEqual(['in', 'out']);
    expect(response.explored).toBeLessThanOrEqual(2);
    expect(response.incomplete).toBe(true);
  });
});
