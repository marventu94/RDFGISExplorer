import { Test, TestingModule } from '@nestjs/testing';
import { QueryController } from './query.controller';
import { QueryService } from './query.service';
import { QueryResult } from '../../shared/dto/query-result.dto';
import { QuerySummary } from '../../shared/dto/query-summary.dto';

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

const mockSummary: QuerySummary = {
  totalRows: 42,
  numeric: [],
  temporal: [],
  categorical: [],
  failed: { total: false, numeric: [], temporal: [], categorical: [] },
  meta: { durationMs: 10, backend: 'wikidata' },
};

describe('QueryController', () => {
  let controller: QueryController;
  let executeMock: jest.Mock;
  let summarizeMock: jest.Mock;

  beforeEach(async () => {
    executeMock = jest.fn().mockResolvedValue(mockQueryResult);
    summarizeMock = jest.fn().mockResolvedValue(mockSummary);
    const module: TestingModule = await Test.createTestingModule({
      controllers: [QueryController],
      providers: [
        {
          provide: QueryService,
          useValue: {
            execute: executeMock,
            summarize: summarizeMock,
          },
        },
      ],
    }).compile();

    controller = module.get<QueryController>(QueryController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should call queryService.execute with DTO values', async () => {
    const dto = { sparql: 'SELECT ?x WHERE { ?s ?p ?o } LIMIT 10', limit: 500 };
    const result = await controller.execute(dto);
    expect(result).toEqual(mockQueryResult);
    expect(executeMock).toHaveBeenCalledWith(dto.sparql, dto.limit, undefined);
  });

  it('should pass the raw flag through to queryService.execute', async () => {
    const dto = {
      sparql: 'SELECT ?x WHERE { ?s ?p ?o } LIMIT 10',
      limit: 500,
      raw: true,
    };
    await controller.execute(dto);
    expect(executeMock).toHaveBeenCalledWith(dto.sparql, dto.limit, true);
  });

  it('should call queryService.summarize with the DTO', async () => {
    const dto = {
      query: 'SELECT ?x WHERE { ?s ?p ?o }',
      numericVars: ['x'],
      categoricalVars: [],
      temporalVars: [],
    };
    const result = await controller.summary(dto);
    expect(result).toEqual(mockSummary);
    expect(summarizeMock).toHaveBeenCalledWith(dto);
  });
});
