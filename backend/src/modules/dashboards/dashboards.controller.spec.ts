import { Test, TestingModule } from '@nestjs/testing';
import { DashboardsController } from './dashboards.controller';
import { DashboardsService } from './dashboards.service';
import { Dashboard } from './dto/dashboard.dto';

const mockDashboard: Dashboard = {
  id: 'uuid-1',
  kind: 'gis',
  name: 'Test Dashboard',
  payload: { q: 'SELECT *' },
  createdAt: '2025-01-01T00:00:00.000Z',
  updatedAt: '2025-01-02T00:00:00.000Z',
};

describe('DashboardsController', () => {
  let controller: DashboardsController;
  let service: {
    findAll: jest.Mock;
    findRecent: jest.Mock;
    findOne: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
    remove: jest.Mock;
  };

  beforeEach(async () => {
    service = {
      findAll: jest.fn().mockReturnValue([mockDashboard]),
      findRecent: jest.fn().mockReturnValue([mockDashboard]),
      findOne: jest.fn().mockReturnValue(mockDashboard),
      create: jest.fn().mockReturnValue(mockDashboard),
      update: jest.fn().mockReturnValue(mockDashboard),
      remove: jest.fn().mockReturnValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [DashboardsController],
      providers: [
        {
          provide: DashboardsService,
          useValue: service,
        },
      ],
    }).compile();

    controller = module.get<DashboardsController>(DashboardsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('GET /dashboards', () => {
    it('should return all dashboards', () => {
      const result = controller.findAll();
      expect(result).toEqual([mockDashboard]);
      expect(service.findAll).toHaveBeenCalled();
    });
  });

  describe('GET /dashboards/recent', () => {
    it('should return recent dashboards with default limit', () => {
      const result = controller.findRecent(10);
      expect(result).toEqual([mockDashboard]);
      expect(service.findRecent).toHaveBeenCalledWith(10);
    });

    it('should clamp limit to 50 when too high', () => {
      controller.findRecent(100);
      expect(service.findRecent).toHaveBeenCalledWith(50);
    });

    it('should clamp limit to 1 when too low', () => {
      controller.findRecent(0);
      expect(service.findRecent).toHaveBeenCalledWith(1);
    });
  });

  describe('GET /dashboards/:id', () => {
    it('should return a dashboard by id', () => {
      const result = controller.findOne('uuid-1');
      expect(result).toEqual(mockDashboard);
      expect(service.findOne).toHaveBeenCalledWith('uuid-1');
    });
  });

  describe('POST /dashboards', () => {
    it('should create a dashboard', () => {
      const dto = {
        kind: 'gis' as const,
        name: 'New Dashboard',
        payload: { q: 'SELECT *' },
      };
      const result = controller.create(dto);
      expect(result).toEqual(mockDashboard);
      expect(service.create).toHaveBeenCalledWith(dto);
    });
  });

  describe('PUT /dashboards/:id', () => {
    it('should update a dashboard', () => {
      const dto = { name: 'Updated Name' };
      const result = controller.update('uuid-1', dto);
      expect(result).toEqual(mockDashboard);
      expect(service.update).toHaveBeenCalledWith('uuid-1', dto);
    });
  });

  describe('DELETE /dashboards/:id', () => {
    it('should remove a dashboard', () => {
      controller.remove('uuid-1');
      expect(service.remove).toHaveBeenCalledWith('uuid-1');
    });
  });
});
