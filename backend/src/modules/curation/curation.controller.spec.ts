import { Test, TestingModule } from '@nestjs/testing';
import { CurationController } from './curation.controller';
import { CurationService } from './curation.service';
import {
  CurationRecord,
  DuplicateCandidate,
} from '../../shared/dto/curation.dto';

const mockRecord: CurationRecord = {
  id: 1,
  nodeUri: 'http://example.org/Q1',
  fieldName: 'label',
  rawValue: 'Raw',
  scriptValue: null,
  manualValue: 'Manual',
  status: 'corrected',
  author: 'test@test.com',
  createdAt: '2025-01-01 00:00:00',
  updatedAt: '2025-01-01 00:00:00',
};

const mockDuplicate: DuplicateCandidate = {
  id: 1,
  nodeUriA: 'http://example.org/Q1',
  nodeUriB: 'http://example.org/Q2',
  score: 0.95,
  decision: 'pending',
};

describe('CurationController', () => {
  let controller: CurationController;
  let service: {
    getForNode: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
    getDuplicates: jest.Mock;
    decideDuplicate: jest.Mock;
  };

  beforeEach(async () => {
    service = {
      getForNode: jest.fn().mockReturnValue({
        records: [mockRecord],
        duplicates: [mockDuplicate],
      }),
      create: jest.fn().mockReturnValue(mockRecord),
      update: jest.fn().mockReturnValue(mockRecord),
      getDuplicates: jest.fn().mockReturnValue([mockDuplicate]),
      decideDuplicate: jest.fn().mockReturnValue({
        ...mockDuplicate,
        decision: 'confirmed',
        decidedBy: 'martin@bago.com.ar',
        decidedAt: '2025-01-01 00:00:00',
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [CurationController],
      providers: [
        {
          provide: CurationService,
          useValue: service,
        },
      ],
    }).compile();

    controller = module.get<CurationController>(CurationController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('GET /curation/:nodeUri', () => {
    it('should return records and duplicates for a node', () => {
      const result = controller.getForNode('http://example.org/Q1');
      expect(result).toEqual({
        records: [mockRecord],
        duplicates: [mockDuplicate],
      });
      expect(service.getForNode).toHaveBeenCalledWith('http://example.org/Q1');
    });
  });

  describe('POST /curation', () => {
    it('should create a curation record', () => {
      const dto = {
        nodeUri: 'http://example.org/Q1',
        fieldName: 'label',
        rawValue: 'Raw',
        manualValue: 'Manual',
        status: 'corrected' as const,
      };
      const result = controller.create(dto, 'test@test.com');
      expect(result).toEqual(mockRecord);
      expect(service.create).toHaveBeenCalledWith(dto, 'test@test.com');
    });

    it('should use default author when X-Author header is missing', () => {
      const dto = {
        nodeUri: 'http://example.org/Q1',
        fieldName: 'label',
        rawValue: 'Raw',
        status: 'validated' as const,
      };
      controller.create(dto);
      expect(service.create).toHaveBeenCalledWith(dto, 'martin@bago.com.ar');
    });
  });

  describe('PATCH /curation/:id', () => {
    it('should update a curation record', () => {
      const dto = { manualValue: 'New', status: 'corrected' as const };
      const result = controller.update('1', dto);
      expect(result).toEqual(mockRecord);
      expect(service.update).toHaveBeenCalledWith(1, dto);
    });
  });

  describe('GET /curation/duplicates/:nodeUri', () => {
    it('should return duplicates for a node', () => {
      const result = controller.getDuplicates('http://example.org/Q1');
      expect(result).toEqual([mockDuplicate]);
      expect(service.getDuplicates).toHaveBeenCalledWith(
        'http://example.org/Q1',
      );
    });
  });

  describe('POST /curation/duplicates/:id/decision', () => {
    it('should update a duplicate decision', () => {
      const dto = { decision: 'confirmed' as const };
      const result = controller.decideDuplicate('1', dto, 'martin@bago.com.ar');
      expect(result.decision).toBe('confirmed');
      expect(service.decideDuplicate).toHaveBeenCalledWith(
        1,
        'confirmed',
        'martin@bago.com.ar',
      );
    });

    it('should use default author when X-Author header is missing', () => {
      const dto = { decision: 'rejected' as const };
      controller.decideDuplicate('1', dto);
      expect(service.decideDuplicate).toHaveBeenCalledWith(
        1,
        'rejected',
        'martin@bago.com.ar',
      );
    });
  });
});
