import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import request from 'supertest';
import { QueryController } from './query.controller';
import { QueryService } from './query.service';
import { SPARQL_ENDPOINT, TimeoutError } from '../../adapters/sparql-endpoint.interface';
import { HttpExceptionFilter } from '../../common/filters/http-exception.filter';

describe('query HTTP timeout and recovery', () => {
  let app: INestApplication;
  const execute = jest.fn();
  beforeEach(async () => {
    execute.mockReset();
    const module = await Test.createTestingModule({
      controllers: [QueryController],
      providers: [QueryService,
        { provide: ConfigService, useValue: { get: () => undefined } },
        { provide: SPARQL_ENDPOINT, useValue: { backendName: 'test', execute } },
      ],
    }).compile();
    app = module.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));
    app.useGlobalFilters(new HttpExceptionFilter());
    app.setGlobalPrefix('api');
    await app.init();
  });
  afterEach(async () => app.close());

  it.each(['execute', 'summary'])('returns a structured 408 for %s and accepts a subsequent query', async (action) => {
    const query = 'SELECT ?s WHERE { ?s <urn:p> ?o }';
    const body = action === 'execute' ? { sparql: query } : { query };
    execute.mockRejectedValueOnce(new TimeoutError(180000));
    const failed = await request(app.getHttpServer()).post(`/api/query/${action}`).send(body).expect(408);
    expect(failed.body).toMatchObject({ error: 'TIMEOUT', timeoutMs: 180000 });
    execute.mockResolvedValueOnce({ variables: [], bindings: [{ __agg_total: { type: 'literal', value: '0' } }], nodes: [], edges: [], meta: {} });
    await request(app.getHttpServer()).post(`/api/query/${action}`).send(body).expect(201);
    expect(execute.mock.calls.at(-1)?.[1]).toMatchObject({ timeoutMs: 180000 });
  });

  it('rejects a client override above the global ceiling before reaching SPARQL', async () => {
    await request(app.getHttpServer()).post('/api/query/execute').send({ sparql: 'SELECT ?s WHERE { ?s ?p ?o }', timeoutMs: 600000 }).expect(400);
    expect(execute).not.toHaveBeenCalled();
  });
});
