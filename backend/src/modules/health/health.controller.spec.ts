import { Test, TestingModule } from '@nestjs/testing';
import { HealthController } from './health.controller';
import { DATABASE_CONNECTION } from '../../db/database.module';
import { SPARQL_ENDPOINT } from '../../adapters/sparql-endpoint.interface';
import { QueryResult } from '../../shared/dto/query-result.dto';

const mockQueryResult: QueryResult = {
  variables: ['s'],
  bindings: [],
  nodes: [],
  edges: [],
  meta: {
    durationMs: 10,
    truncated: false,
    limitApplied: 1,
    backend: 'wikidata',
  },
};

const mockSparqlEndpoint = {
  backendName: 'wikidata' as const,
  execute: jest.fn().mockResolvedValue(mockQueryResult),
  getPredicates: jest.fn(),
};

const mockDb = {
  open: true,
};

describe('HealthController', () => {
  let controller: HealthController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        {
          provide: SPARQL_ENDPOINT,
          useValue: mockSparqlEndpoint,
        },
        {
          provide: DATABASE_CONNECTION,
          useValue: mockDb,
        },
      ],
    }).compile();

    controller = module.get<HealthController>(HealthController);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('GET /health should return status ok', () => {
    const result = controller.getHealth();
    expect(result).toMatchObject({
      status: 'ok',
      backend: 'wikidata',
      dbConnected: true,
    });
    expect(result.uptime).toBeGreaterThanOrEqual(0);
  });

  it('GET /health/sparql should return ok with latency', async () => {
    const result = await controller.getSparqlHealth();
    expect(result.status).toBe('ok');
    expect(result.backend).toBe('wikidata');
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
    expect(mockSparqlEndpoint.execute).toHaveBeenCalledWith(
      'SELECT ?s WHERE { ?s ?p ?o } LIMIT 1',
      expect.objectContaining({ limit: 1 }),
    );
  });

  it('GET /health/sparql should handle errors', async () => {
    mockSparqlEndpoint.execute.mockRejectedValueOnce(
      new Error('Upstream down'),
    );
    const result = await controller.getSparqlHealth();
    expect(result.status).toBe('error');
    expect(result.message).toBe('Upstream down');
  });
});
