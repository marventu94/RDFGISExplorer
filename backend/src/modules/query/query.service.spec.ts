import { Test, TestingModule } from '@nestjs/testing';
import { HttpException } from '@nestjs/common';
import { QueryService } from './query.service';
import {
  SPARQL_ENDPOINT,
  TimeoutError,
  UpstreamError,
  NotImplementedError,
} from '../../adapters/sparql-endpoint.interface';
import { QueryResult } from '../../shared/dto/query-result.dto';

const mockQueryResult: QueryResult = {
  variables: ['x'],
  bindings: [],
  nodes: [],
  edges: [],
  meta: {
    durationMs: 100,
    truncated: false,
    limitApplied: 500,
    backend: 'wikidata',
  },
};

const mockSparqlEndpoint = {
  backendName: 'wikidata' as const,
  execute: jest.fn().mockResolvedValue(mockQueryResult),
  getPredicates: jest.fn().mockResolvedValue([]),
};

describe('QueryService', () => {
  let service: QueryService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        QueryService,
        {
          provide: SPARQL_ENDPOINT,
          useValue: mockSparqlEndpoint,
        },
      ],
    }).compile();

    service = module.get<QueryService>(QueryService);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should execute valid SPARQL and return QueryResult', async () => {
    const result = await service.execute(
      'SELECT ?x WHERE { ?s ?p ?o } LIMIT 10',
      500,
    );
    expect(result).toEqual(mockQueryResult);
    expect(mockSparqlEndpoint.execute).toHaveBeenCalledWith(
      'SELECT ?x WHERE { ?s ?p ?o } LIMIT 10',
      expect.objectContaining({ limit: 500, timeoutMs: 30000 }),
    );
  });

  it('should apply default limit of 500 when not provided', async () => {
    await service.execute('SELECT ?x WHERE { ?s ?p ?o } LIMIT 10');
    expect(mockSparqlEndpoint.execute).toHaveBeenCalledWith(
      'SELECT ?x WHERE { ?s ?p ?o } LIMIT 10',
      expect.objectContaining({ limit: 500 }),
    );
  });

  it('should throw 400 INVALID_SPARQL for invalid SPARQL syntax', async () => {
    try {
      await service.execute('NOT VALID SPARQL');
      fail('Expected HttpException');
    } catch (e) {
      expect(e).toBeInstanceOf(HttpException);
      const httpEx = e as HttpException;
      expect(httpEx.getStatus()).toBe(400);
      const body = httpEx.getResponse() as Record<string, unknown>;
      expect(body.error).toBe('INVALID_SPARQL');
    }
  });

  it('should throw 413 LIMIT_EXCEEDED when limit > 2000', async () => {
    try {
      await service.execute('SELECT ?x WHERE { ?s ?p ?o } LIMIT 10', 3000);
      fail('Expected HttpException');
    } catch (e) {
      expect(e).toBeInstanceOf(HttpException);
      const httpEx = e as HttpException;
      expect(httpEx.getStatus()).toBe(413);
      const body = httpEx.getResponse() as Record<string, unknown>;
      expect(body.error).toBe('LIMIT_EXCEEDED');
    }
  });

  it('should throw 408 TIMEOUT on TimeoutError', async () => {
    mockSparqlEndpoint.execute.mockRejectedValueOnce(new TimeoutError(10000));
    try {
      await service.execute('SELECT ?x WHERE { ?s ?p ?o } LIMIT 10', 500);
      fail('Expected HttpException');
    } catch (e) {
      expect(e).toBeInstanceOf(HttpException);
      const httpEx = e as HttpException;
      expect(httpEx.getStatus()).toBe(408);
      const body = httpEx.getResponse() as Record<string, unknown>;
      expect(body.error).toBe('TIMEOUT');
    }
  });

  it('should throw 502 UPSTREAM_ERROR on UpstreamError', async () => {
    mockSparqlEndpoint.execute.mockRejectedValueOnce(
      new UpstreamError(503, 'Service unavailable'),
    );
    try {
      await service.execute('SELECT ?x WHERE { ?s ?p ?o } LIMIT 10', 500);
      fail('Expected HttpException');
    } catch (e) {
      expect(e).toBeInstanceOf(HttpException);
      const httpEx = e as HttpException;
      expect(httpEx.getStatus()).toBe(502);
      const body = httpEx.getResponse() as Record<string, unknown>;
      expect(body.error).toBe('UPSTREAM_ERROR');
    }
  });

  it('should throw 503 NOT_IMPLEMENTED on NotImplementedError', async () => {
    mockSparqlEndpoint.execute.mockRejectedValueOnce(
      new NotImplementedError('MillenniumDB'),
    );
    try {
      await service.execute('SELECT ?x WHERE { ?s ?p ?o } LIMIT 10', 500);
      fail('Expected HttpException');
    } catch (e) {
      expect(e).toBeInstanceOf(HttpException);
      const httpEx = e as HttpException;
      expect(httpEx.getStatus()).toBe(503);
      const body = httpEx.getResponse() as Record<string, unknown>;
      expect(body.error).toBe('NOT_IMPLEMENTED');
    }
  });
});
