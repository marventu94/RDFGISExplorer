import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { DashboardsService } from './dashboards.service';
import { DASHBOARDS_DB } from './dashboards.db-token';
import { CreateDashboardDto } from './dto/create-dashboard.dto';
import { UpdateDashboardDto } from './dto/update-dashboard.dto';

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

describe('DashboardsService', () => {
  let service: DashboardsService;
  let mockDb: ReturnType<typeof createMockDb>;

  beforeEach(async () => {
    mockDb = createMockDb();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DashboardsService,
        {
          provide: DASHBOARDS_DB,
          useValue: mockDb,
        },
      ],
    }).compile();

    service = module.get<DashboardsService>(DashboardsService);
    jest.clearAllMocks();
  });

  describe('findAll', () => {
    it('should return all dashboards ordered by updated_at desc', () => {
      const rows = [
        {
          id: 'uuid-1',
          kind: 'gis',
          name: 'GIS 1',
          payload: '{"q":"SELECT *"}',
          created_at: '2025-01-01T00:00:00.000Z',
          updated_at: '2025-01-02T00:00:00.000Z',
        },
        {
          id: 'uuid-2',
          kind: 'explorer',
          name: 'Explorer 1',
          payload: '{"nodes":[]}',
          created_at: '2025-01-01T00:00:00.000Z',
          updated_at: '2025-01-01T00:00:00.000Z',
        },
      ];

      mockDb.prepare.mockReturnValue({
        get: jest.fn(),
        run: jest.fn(),
        all: jest.fn().mockReturnValue(rows),
      });

      const result = service.findAll();
      expect(result).toHaveLength(2);
      expect(result[0].name).toBe('GIS 1');
      expect(result[1].kind).toBe('explorer');
    });

    it('should return empty array when no dashboards exist', () => {
      mockDb.prepare.mockReturnValue({
        get: jest.fn(),
        run: jest.fn(),
        all: jest.fn().mockReturnValue([]),
      });

      const result = service.findAll();
      expect(result).toHaveLength(0);
    });
  });

  describe('findRecent', () => {
    it('should return recent dashboards with given limit', () => {
      const rows = [
        {
          id: 'uuid-1',
          kind: 'gis',
          name: 'GIS 1',
          payload: '{}',
          created_at: '2025-01-01T00:00:00.000Z',
          updated_at: '2025-01-02T00:00:00.000Z',
        },
      ];

      mockDb.prepare.mockReturnValue({
        get: jest.fn(),
        run: jest.fn(),
        all: jest.fn().mockReturnValue(rows),
      });

      const result = service.findRecent(5);
      expect(result).toHaveLength(1);
      expect(mockDb.prepare).toHaveBeenCalledWith(
        'SELECT * FROM dashboards ORDER BY updated_at DESC LIMIT ?',
      );
    });
  });

  describe('findOne', () => {
    it('should return a dashboard by id', () => {
      const row = {
        id: 'uuid-1',
        kind: 'gis',
        name: 'GIS 1',
        payload: '{"q":"SELECT *"}',
        created_at: '2025-01-01T00:00:00.000Z',
        updated_at: '2025-01-02T00:00:00.000Z',
      };

      mockDb.prepare.mockReturnValue({
        get: jest.fn().mockReturnValue(row),
        run: jest.fn(),
        all: jest.fn(),
      });

      const result = service.findOne('uuid-1');
      expect(result.id).toBe('uuid-1');
      expect(result.payload).toEqual({ q: 'SELECT *' });
    });

    it('should throw NotFoundException for non-existent id', () => {
      mockDb.prepare.mockReturnValue({
        get: jest.fn().mockReturnValue(undefined),
        run: jest.fn(),
        all: jest.fn(),
      });

      expect(() => service.findOne('non-existent')).toThrow(NotFoundException);
    });
  });

  describe('create', () => {
    it('should create a dashboard and return it', () => {
      const row = {
        id: 'uuid-1',
        kind: 'gis',
        name: 'New Dashboard',
        payload: '{"q":"SELECT *"}',
        created_at: '2025-01-01T00:00:00.000Z',
        updated_at: '2025-01-01T00:00:00.000Z',
      };

      mockDb.prepare.mockReturnValue({
        get: jest.fn().mockReturnValue(row),
        run: jest.fn().mockReturnValue({ lastInsertRowid: 1 }),
        all: jest.fn(),
      });

      const dto: CreateDashboardDto = {
        kind: 'gis',
        name: 'New Dashboard',
        payload: { q: 'SELECT *' },
      };

      const result = service.create(dto);
      expect(result.name).toBe('New Dashboard');
      expect(result.kind).toBe('gis');
    });
  });

  describe('update', () => {
    it('should update name and payload', () => {
      const existing = {
        id: 'uuid-1',
        kind: 'gis',
        name: 'Old Name',
        payload: '{"old":true}',
        created_at: '2025-01-01T00:00:00.000Z',
        updated_at: '2025-01-01T00:00:00.000Z',
      };
      const updated = {
        ...existing,
        name: 'New Name',
        payload: '{"new":true}',
        updated_at: '2025-01-02T00:00:00.000Z',
      };

      mockDb.prepare.mockReturnValue({
        get: jest.fn().mockReturnValueOnce(existing).mockReturnValueOnce(updated),
        run: jest.fn(),
        all: jest.fn(),
      });

      const dto: UpdateDashboardDto = { name: 'New Name', payload: { new: true } };
      const result = service.update('uuid-1', dto);
      expect(result.name).toBe('New Name');
      expect(result.payload).toEqual({ new: true });
    });

    it('should update only name when payload is omitted', () => {
      const existing = {
        id: 'uuid-1',
        kind: 'gis',
        name: 'Old Name',
        payload: '{"old":true}',
        created_at: '2025-01-01T00:00:00.000Z',
        updated_at: '2025-01-01T00:00:00.000Z',
      };
      const updated = {
        ...existing,
        name: 'New Name',
        updated_at: '2025-01-02T00:00:00.000Z',
      };

      mockDb.prepare.mockReturnValue({
        get: jest.fn().mockReturnValueOnce(existing).mockReturnValueOnce(updated),
        run: jest.fn(),
        all: jest.fn(),
      });

      const dto: UpdateDashboardDto = { name: 'New Name' };
      const result = service.update('uuid-1', dto);
      expect(result.name).toBe('New Name');
      expect(result.payload).toEqual({ old: true });
    });

    it('should throw NotFoundException for non-existent id', () => {
      mockDb.prepare.mockReturnValue({
        get: jest.fn().mockReturnValue(undefined),
        run: jest.fn(),
        all: jest.fn(),
      });

      expect(() => service.update('non-existent', { name: 'X' })).toThrow(
        NotFoundException,
      );
    });
  });

  describe('remove', () => {
    it('should delete a dashboard', () => {
      mockDb.prepare.mockReturnValue({
        get: jest.fn(),
        run: jest.fn().mockReturnValue({ changes: 1 }),
        all: jest.fn(),
      });

      service.remove('uuid-1');
      expect(mockDb.prepare).toHaveBeenCalledWith(
        'DELETE FROM dashboards WHERE id = ?',
      );
    });

    it('should throw NotFoundException for non-existent id', () => {
      mockDb.prepare.mockReturnValue({
        get: jest.fn(),
        run: jest.fn().mockReturnValue({ changes: 0 }),
        all: jest.fn(),
      });

      expect(() => service.remove('non-existent')).toThrow(NotFoundException);
    });
  });
});
