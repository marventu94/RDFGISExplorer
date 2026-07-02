import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import nock from 'nock';
import { SuggestionsService } from './suggestions.service';
import { SPARQL_ENDPOINT } from '../../adapters/sparql-endpoint.interface';

const mockPredicates = [
  'http://www.w3.org/1999/02/22-rdf-syntax-ns#type',
  'http://www.w3.org/2000/01/rdf-schema#label',
];

const mockSparqlEndpoint = {
  backendName: 'wikidata' as const,
  execute: jest.fn(),
  getPredicates: jest.fn().mockResolvedValue(mockPredicates),
};

describe('SuggestionsService', () => {
  let service: SuggestionsService;
  let configGet: jest.Mock;

  beforeEach(async () => {
    configGet = jest.fn((key: string) => {
      const values: Record<string, string> = {
        SPARQL_BACKEND: 'wikidata',
      };
      return values[key];
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SuggestionsService,
        {
          provide: SPARQL_ENDPOINT,
          useValue: mockSparqlEndpoint,
        },
        {
          provide: ConfigService,
          useValue: { get: configGet },
        },
      ],
    }).compile();

    service = module.get<SuggestionsService>(SuggestionsService);
    jest.clearAllMocks();
    nock.cleanAll();
  });

  afterEach(() => {
    nock.cleanAll();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should return predicates from the endpoint', async () => {
    const predicates = await service.getPredicates();
    expect(predicates).toEqual(mockPredicates);
    expect(mockSparqlEndpoint.getPredicates).toHaveBeenCalled();
  });

  it('should search entities via Wikidata API when backend is wikidata', async () => {
    nock('https://www.wikidata.org')
      .get('/w/api.php')
      .query(true)
      .reply(200, {
        search: [
          {
            concepturi: 'http://www.wikidata.org/entity/Q1486',
            label: 'Buenos Aires',
            description: 'Capital city',
          },
        ],
      });

    const results = await service.searchEntities('buenos aires', 10);
    expect(results).toHaveLength(1);
    expect(results[0].uri).toBe('http://www.wikidata.org/entity/Q1486');
    expect(results[0].label).toBe('Buenos Aires');
  });

  it('should search entities via SPARQL when backend is not wikidata', async () => {
    configGet.mockImplementation((key: string) => {
      const values: Record<string, string> = {
        SPARQL_BACKEND: 'graphdb',
        SPARQL_ENDPOINT_URL: 'http://localhost:7200/repositories/test',
      };
      return values[key];
    });

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

    const results = await service.searchEntities('entity', 10);
    expect(results).toHaveLength(1);
    expect(results[0].uri).toBe('http://example.org/entity/1');
    expect(results[0].label).toBe('Entity One');
  });

  it('should inject class filter into SPARQL when classUri provided (generic backend)', async () => {
    configGet.mockImplementation((key: string) => {
      const values: Record<string, string> = {
        SPARQL_BACKEND: 'graphdb',
        SPARQL_ENDPOINT_URL: 'http://localhost:7200/repositories/test',
      };
      return values[key];
    });

    let capturedQuery: string | null = null;
    nock('http://localhost:7200')
      .post('/repositories/test')
      .reply(200, function (_uri, body) {
        const raw = typeof body === 'string' ? body : String(body);
        const params = new URLSearchParams(raw);
        capturedQuery = params.get('query') ?? '';
        return {
          head: { vars: ['uri', 'label'] },
          results: { bindings: [] },
        };
      });

    await service.searchEntities('entity', 10, 'http://example.org/Class');
    expect(capturedQuery).toContain('?uri a <http://example.org/Class>');
  });

  it('should post-filter wikidata results by P31 when classUri provided', async () => {
    configGet.mockImplementation((key: string) => {
      const values: Record<string, string> = {
        SPARQL_BACKEND: 'wikidata',
        SPARQL_ENDPOINT_URL: 'https://query.wikidata.org/sparql',
      };
      return values[key];
    });

    nock('https://www.wikidata.org')
      .get('/w/api.php')
      .query(true)
      .reply(200, {
        search: [
          {
            concepturi: 'http://www.wikidata.org/entity/Q5',
            label: 'human',
          },
          {
            concepturi: 'http://www.wikidata.org/entity/Q515',
            label: 'city',
          },
        ],
      });

    nock('https://query.wikidata.org')
      .post('/sparql')
      .reply(200, {
        results: {
          bindings: [
            { uri: { type: 'uri', value: 'http://www.wikidata.org/entity/Q5' } },
          ],
        },
      });

    const results = await service.searchEntities(
      'human',
      10,
      'http://www.wikidata.org/entity/Q5',
    );
    expect(results).toHaveLength(1);
    expect(results[0].uri).toBe('http://www.wikidata.org/entity/Q5');
  });

  it('should reject invalid classUri', async () => {
    await expect(
      service.searchEntities('entity', 10, 'not a uri with spaces'),
    ).rejects.toMatchObject({
      message: expect.stringContaining('classUri is not a valid IRI'),
    });
  });
});
