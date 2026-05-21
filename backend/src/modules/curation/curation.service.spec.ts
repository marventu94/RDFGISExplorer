import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { CurationService } from './curation.service';
import { DATABASE_CONNECTION } from '../../db/database.module';
import { CreateCurationDto } from '../../shared/dto/curation.dto';

function createMockDb() {
  const mockStatement = {
    run: jest.fn(),
    get: jest.fn(),
    all: jest.fn(),
  };

  return {
    prepare: jest.fn().mockReturnValue(mockStatement),
    exec: jest.fn(),
  };
}

describe('CurationService', () => {
  let service: CurationService;
  let mockDb: ReturnType<typeof createMockDb>;

  beforeEach(async () => {
    mockDb = createMockDb();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CurationService,
        {
          provide: DATABASE_CONNECTION,
          useValue: mockDb,
        },
      ],
    }).compile();

    service = module.get<CurationService>(CurationService);
    jest.clearAllMocks();
  });

  describe('create', () => {
    it('should create a curation record and return it', () => {
      const now = '2025-01-01 00:00:00';

      mockDb.prepare.mockReturnValue({
        get: jest.fn().mockReturnValueOnce(undefined).mockReturnValueOnce({
          id: 1,
          node_uri: 'http://example.org/Q1',
          field_name: 'label',
          raw_value: 'Foo',
          script_value: null,
          manual_value: 'Bar',
          status: 'corrected',
          author: 'test@test.com',
          created_at: now,
          updated_at: now,
        }),
        run: jest.fn().mockReturnValue({ lastInsertRowid: 1 }),
        all: jest.fn(),
      });

      const dto: CreateCurationDto = {
        nodeUri: 'http://example.org/Q1',
        fieldName: 'label',
        rawValue: 'Foo',
        manualValue: 'Bar',
        status: 'corrected',
      };
      const record = service.create(dto, 'test@test.com');

      expect(record.id).toBe(1);
      expect(record.nodeUri).toBe('http://example.org/Q1');
      expect(record.fieldName).toBe('label');
      expect(record.rawValue).toBe('Foo');
      expect(record.manualValue).toBe('Bar');
      expect(record.status).toBe('corrected');
      expect(record.author).toBe('test@test.com');
    });

    it('should throw ConflictException on duplicate (nodeUri, fieldName)', () => {
      mockDb.prepare.mockReturnValue({
        get: jest.fn().mockReturnValue({ id: 1 }),
        run: jest.fn(),
        all: jest.fn(),
      });

      const dto: CreateCurationDto = {
        nodeUri: 'http://example.org/Q1',
        fieldName: 'label',
        rawValue: 'Foo',
        status: 'validated',
      };
      expect(() => service.create(dto, 'test@test.com')).toThrow(
        ConflictException,
      );
    });
  });

  describe('getForNode', () => {
    it('should return records and duplicates for a node', () => {
      const mockRecords = [
        {
          id: 1,
          node_uri: 'http://example.org/Q3',
          field_name: 'label',
          raw_value: 'Baz',
          script_value: null,
          manual_value: null,
          status: 'validated',
          author: 'x@y.com',
          created_at: '2025-01-01',
          updated_at: '2025-01-01',
        },
      ];
      const mockDuplicates: unknown[] = [];

      mockDb.prepare.mockReturnValue({
        get: jest.fn(),
        run: jest.fn(),
        all: jest
          .fn()
          .mockReturnValueOnce(mockRecords)
          .mockReturnValueOnce(mockDuplicates),
      });

      const result = service.getForNode('http://example.org/Q3');
      expect(result.records).toHaveLength(1);
      expect(result.records[0].fieldName).toBe('label');
      expect(result.duplicates).toHaveLength(0);
    });

    it('should return empty arrays for unknown node', () => {
      mockDb.prepare.mockReturnValue({
        get: jest.fn(),
        run: jest.fn(),
        all: jest.fn().mockReturnValue([]),
      });

      const result = service.getForNode('http://example.org/unknown');
      expect(result.records).toHaveLength(0);
      expect(result.duplicates).toHaveLength(0);
    });
  });

  describe('update', () => {
    it('should update manualValue and status of a record', () => {
      const existing = {
        id: 1,
        node_uri: 'http://example.org/Q4',
        field_name: 'label',
        raw_value: 'Old',
        script_value: null,
        manual_value: null,
        status: 'validated',
        author: 'author@test.com',
        created_at: '2025-01-01',
        updated_at: '2025-01-01',
      };
      const updated = {
        ...existing,
        manual_value: 'New Value',
        status: 'corrected',
        updated_at: '2025-01-02',
      };

      mockDb.prepare.mockReturnValue({
        get: jest
          .fn()
          .mockReturnValueOnce(existing)
          .mockReturnValueOnce(updated),
        run: jest.fn(),
        all: jest.fn(),
      });

      const result = service.update(1, {
        manualValue: 'New Value',
        status: 'corrected',
      });

      expect(result.manualValue).toBe('New Value');
      expect(result.status).toBe('corrected');
    });

    it('should throw NotFoundException for non-existent id', () => {
      mockDb.prepare.mockReturnValue({
        get: jest.fn().mockReturnValue(undefined),
        run: jest.fn(),
        all: jest.fn(),
      });

      expect(() => service.update(9999, { manualValue: 'X' })).toThrow(
        NotFoundException,
      );
    });
  });

  describe('getDuplicates', () => {
    it('should return duplicates for a nodeUri', () => {
      const mockDups = [
        {
          id: 1,
          node_uri_a: 'http://example.org/Q1',
          node_uri_b: 'http://example.org/Q2',
          score: 0.95,
          decision: 'pending',
          decided_by: null,
          decided_at: null,
        },
      ];
      mockDb.prepare.mockReturnValue({
        get: jest.fn(),
        run: jest.fn(),
        all: jest.fn().mockReturnValue(mockDups),
      });

      const duplicates = service.getDuplicates('http://example.org/Q1');
      expect(duplicates).toHaveLength(1);
      expect(duplicates[0].score).toBe(0.95);
    });

    it('should return empty array for unknown node', () => {
      mockDb.prepare.mockReturnValue({
        get: jest.fn(),
        run: jest.fn(),
        all: jest.fn().mockReturnValue([]),
      });

      const duplicates = service.getDuplicates('http://example.org/unknown');
      expect(duplicates).toHaveLength(0);
    });
  });

  describe('decideDuplicate', () => {
    it('should update decision on a duplicate candidate', () => {
      const existing = {
        id: 1,
        node_uri_a: 'http://example.org/Q1',
        node_uri_b: 'http://example.org/Q2',
        score: 0.95,
        decision: 'pending',
        decided_by: null,
        decided_at: null,
      };
      const updated = {
        ...existing,
        decision: 'confirmed',
        decided_by: 'martin@bago.com.ar',
        decided_at: '2025-01-01',
      };

      mockDb.prepare.mockReturnValue({
        get: jest
          .fn()
          .mockReturnValueOnce(existing)
          .mockReturnValueOnce(updated),
        run: jest.fn(),
        all: jest.fn(),
      });

      const result = service.decideDuplicate(
        1,
        'confirmed',
        'martin@bago.com.ar',
      );
      expect(result.decision).toBe('confirmed');
      expect(result.decidedBy).toBe('martin@bago.com.ar');
    });

    it('should throw NotFoundException for non-existent duplicate', () => {
      mockDb.prepare.mockReturnValue({
        get: jest.fn().mockReturnValue(undefined),
        run: jest.fn(),
        all: jest.fn(),
      });

      expect(() =>
        service.decideDuplicate(9999, 'confirmed', 'x@y.com'),
      ).toThrow(NotFoundException);
    });
  });
});
