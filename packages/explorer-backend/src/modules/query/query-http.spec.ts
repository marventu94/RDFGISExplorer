import { Test } from '@nestjs/testing';
import { ValidationPipe } from '@nestjs/common';
import type { TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { ExecuteQueryDto } from './dto/execute-query.dto';
import { SummaryQueryDto } from './dto/summary-query.dto';
import { QueryController } from './query.controller';
import { QueryService } from './query.service';
import { SPARQL_ENDPOINT, TimeoutError } from '../../adapters/sparql-endpoint.interface';
import { HttpExceptionFilter } from '../../common/filters/http-exception.filter';

describe('query HTTP timeout and recovery', () => {
  let module: TestingModule;
  let controller: QueryController;
  const validation = new ValidationPipe({ transform: true, whitelist: true });

  // Exercise the real pipe, controller, service and exception filter without
  // sockets: CI deliberately forbids every real network connection.
  function errorResponse(error: unknown) {
    const json = jest.fn();
    const status = jest.fn().mockReturnValue({ json });
    new HttpExceptionFilter().catch(error, {
      switchToHttp: () => ({
        getResponse: () => ({ status }),
        getRequest: () => ({ method: 'POST', url: '/api/query' }),
      }),
    } as never);
    return { status, json };
  }

  async function invoke(action: 'execute' | 'summary', body: object) {
    if (action === 'execute') {
      const dto = await validation.transform(body, { type: 'body', metatype: ExecuteQueryDto });
      return controller.execute(dto);
    }
    const dto = await validation.transform(body, { type: 'body', metatype: SummaryQueryDto });
    return controller.summary(dto);
  }
  const execute = jest.fn();
  beforeEach(async () => {
    execute.mockReset();
    module = await Test.createTestingModule({
      controllers: [QueryController],
      providers: [QueryService,
        { provide: ConfigService, useValue: { get: () => undefined } },
        { provide: SPARQL_ENDPOINT, useValue: { backendName: 'test', execute } },
      ],
    }).compile();
    controller = module.get(QueryController);
  });
  afterEach(async () => module.close());

  it.each(['execute', 'summary'] as const)('returns a structured 408 for %s and accepts a subsequent query', async (action) => {
    const query = 'SELECT ?s WHERE { ?s <urn:p> ?o }';
    const body = action === 'execute' ? { sparql: query } : { query };
    execute.mockRejectedValueOnce(new TimeoutError(180000));
    const error = await invoke(action, body).catch(error => error);
    const failed = errorResponse(error);
    expect(failed.status).toHaveBeenCalledWith(408);
    expect(failed.json).toHaveBeenCalledWith(expect.objectContaining({ error: 'TIMEOUT', timeoutMs: 180000 }));
    execute.mockResolvedValueOnce({ variables: [], bindings: [{ __agg_total: { type: 'literal', value: '0' } }], nodes: [], edges: [], meta: {} });
    await expect(invoke(action, body)).resolves.toBeDefined();
    expect(execute).toHaveBeenCalledTimes(2);
    expect(execute.mock.calls.at(-1)?.[1]).toMatchObject({ timeoutMs: 180000 });
  });

  it('rejects a client override above the global ceiling before reaching SPARQL', async () => {
    const error = await invoke('execute', { sparql: 'SELECT ?s WHERE { ?s ?p ?o }', timeoutMs: 600000 }).catch(error => error);
    const failed = errorResponse(error);
    expect(failed.status).toHaveBeenCalledWith(400);
    expect(failed.json).toHaveBeenCalledWith(expect.objectContaining({
      message: expect.arrayContaining(['timeoutMs must not be greater than 180000']),
    }));
    expect(execute).not.toHaveBeenCalled();
  });
});
