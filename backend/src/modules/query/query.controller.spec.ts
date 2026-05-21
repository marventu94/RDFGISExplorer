import { Test, TestingModule } from '@nestjs/testing';
import { QueryController } from './query.controller';
import { QueryService } from './query.service';
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

describe('QueryController', () => {
  let controller: QueryController;
  let executeMock: jest.Mock;

  beforeEach(async () => {
    executeMock = jest.fn().mockResolvedValue(mockQueryResult);
    const module: TestingModule = await Test.createTestingModule({
      controllers: [QueryController],
      providers: [
        {
          provide: QueryService,
          useValue: {
            execute: executeMock,
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
    expect(executeMock).toHaveBeenCalledWith(dto.sparql, dto.limit);
  });
});
