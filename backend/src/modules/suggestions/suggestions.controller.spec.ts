import { Test, TestingModule } from '@nestjs/testing';
import { SuggestionsController } from './suggestions.controller';
import { SuggestionsService } from './suggestions.service';

const mockPredicates = [
  'http://www.w3.org/1999/02/22-rdf-syntax-ns#type',
  'http://www.w3.org/2000/01/rdf-schema#label',
];

describe('SuggestionsController', () => {
  let controller: SuggestionsController;
  let getPredicatesMock: jest.Mock;

  beforeEach(async () => {
    getPredicatesMock = jest.fn().mockResolvedValue(mockPredicates);
    const module: TestingModule = await Test.createTestingModule({
      controllers: [SuggestionsController],
      providers: [
        {
          provide: SuggestionsService,
          useValue: {
            getPredicates: getPredicatesMock,
          },
        },
      ],
    }).compile();

    controller = module.get<SuggestionsController>(SuggestionsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should return { predicates } wrapping service result', async () => {
    const result = await controller.getPredicates();
    expect(result).toEqual({ predicates: mockPredicates });
    expect(getPredicatesMock).toHaveBeenCalled();
  });
});
