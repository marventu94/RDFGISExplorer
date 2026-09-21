import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { SuggestionsService } from './suggestions.service';
import { SPARQL_ENDPOINT } from '../../adapters/sparql-endpoint.interface';

const mockPredicates = [
  'http://www.w3.org/1999/02/22-rdf-syntax-ns#type',
  'http://www.w3.org/2000/01/rdf-schema#label',
];

// The service is an HTTP layer: it validates input and delegates. Search
// resolution is tested in each adapter spec (wikidata.adapter.spec.ts,
// generic-sparql.adapter.spec.ts), where that decision belongs.
describe('SuggestionsService', () => {
  let service: SuggestionsService;
  let endpoint: {
    backendName: string;
    execute: jest.Mock;
    getPredicates: jest.Mock;
    searchEntities: jest.Mock;
  };
  let configGet: jest.Mock;

  beforeEach(async () => {
    endpoint = {
      backendName: 'wikidata',
      execute: jest.fn(),
      getPredicates: jest.fn().mockResolvedValue(mockPredicates),
      searchEntities: jest.fn().mockResolvedValue([]),
    };
    configGet = jest.fn(() => undefined);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SuggestionsService,
        { provide: SPARQL_ENDPOINT, useValue: endpoint },
        { provide: ConfigService, useValue: { get: configGet } },
      ],
    }).compile();

    service = module.get<SuggestionsService>(SuggestionsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('delegates predicates to the adapter', async () => {
    await expect(service.getPredicates()).resolves.toEqual(mockPredicates);
    expect(endpoint.getPredicates).toHaveBeenCalled();
  });

  it('delegates search to the adapter and returns its result', async () => {
    endpoint.searchEntities.mockResolvedValue([
      { uri: 'http://example.org/1', label: 'Uno' },
    ]);

    const results = await service.searchEntities('uno', 10);

    expect(endpoint.searchEntities).toHaveBeenCalledWith('uno', {
      limit: 10,
      classUri: undefined,
    });
    expect(results).toEqual([{ uri: 'http://example.org/1', label: 'Uno' }]);
  });

  it('passes classUri to the adapter when it is a valid IRI', async () => {
    await service.searchEntities('uno', 10, 'http://example.org/Class');

    expect(endpoint.searchEntities).toHaveBeenCalledWith('uno', {
      limit: 10,
      classUri: 'http://example.org/Class',
    });
  });

  it('clamps the limit with SPARQL_MAX_LIMIT', async () => {
    configGet.mockImplementation((key: string) =>
      key === 'SPARQL_MAX_LIMIT' ? '25' : undefined,
    );

    await service.searchEntities('uno', 1000);

    expect(endpoint.searchEntities).toHaveBeenCalledWith('uno', {
      limit: 25,
      classUri: undefined,
    });
  });

  it('uses a default limit when none is requested', async () => {
    await service.searchEntities('uno');

    expect(endpoint.searchEntities).toHaveBeenCalledWith('uno', {
      limit: 20,
      classUri: undefined,
    });
  });

  it('should reject invalid classUri', async () => {
    await expect(
      service.searchEntities('entity', 10, 'not a uri with spaces'),
    ).rejects.toMatchObject({
      message: expect.stringContaining('classUri is not a valid IRI'),
    });
    // It must not reach the adapter: it is rejected at the boundary.
    expect(endpoint.searchEntities).not.toHaveBeenCalled();
  });
});
