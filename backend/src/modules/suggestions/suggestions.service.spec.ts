import { Test, TestingModule } from '@nestjs/testing';
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

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SuggestionsService,
        {
          provide: SPARQL_ENDPOINT,
          useValue: mockSparqlEndpoint,
        },
      ],
    }).compile();

    service = module.get<SuggestionsService>(SuggestionsService);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should return predicates from the endpoint', async () => {
    const predicates = await service.getPredicates();
    expect(predicates).toEqual(mockPredicates);
    expect(mockSparqlEndpoint.getPredicates).toHaveBeenCalled();
  });
});
