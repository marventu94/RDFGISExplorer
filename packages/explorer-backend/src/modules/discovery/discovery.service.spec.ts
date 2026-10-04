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
  let execute: jest.Mock;
  let service: DiscoveryService;
  beforeEach(() => {
    execute = jest.fn();
    service = new DiscoveryService(
      { execute } as unknown as SparqlEndpoint,
      new ConfigService({ DISCOVERY_SAMPLE_SIZE: 2, DISCOVERY_PATH_BUDGET: 2 }),
    );
  });
  it('deduplicates observed and declared classes, preserves URI fallback, and caches per search', async () => {
    execute.mockResolvedValue(
      result([
        { uri: uri('urn:House'), evidence: lit('observed') },
        { uri: uri('urn:House'), evidence: lit('declared') },
      ]),
    );
    const response = await service.catalog('class', 'House');
    expect(response.items).toHaveLength(1);
    expect(response.items[0].evidence).toEqual(['observed', 'declared']);
    await service.catalog('class', 'House');
    expect(execute).toHaveBeenCalledTimes(1);
    await service.catalog('class', 'Address');
    expect(execute).toHaveBeenCalledTimes(2);
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
