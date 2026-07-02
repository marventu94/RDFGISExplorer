import { Test, TestingModule } from '@nestjs/testing';
import { SettingsService } from './settings.service';
import { SETTINGS_DB } from './settings.db-token';
import { AppConfigService } from '../app-config/app-config.service';
import type { SettingsDefaultsDto } from '../app-config/dto/app-config.dto';

function createMockDb() {
  const statement = {
    run: jest.fn(),
    get: jest.fn(),
    all: jest.fn(),
  };
  return {
    prepare: jest.fn().mockReturnValue(statement),
    exec: jest.fn(),
  };
}

const fakeDefaults: SettingsDefaultsDto = {
  lang: 'en',
  resultLimit: 500,
  labelUri: 'http://www.w3.org/2000/01/rdf-schema#label',
  searchClass: {
    uri: { type: 'uri', value: 'http://www.wikidata.org/entity/Q5' },
    label: { type: 'literal', value: 'human', 'xml:lang': 'en' },
  },
  wikibaseAdapter: true,
  endpointType: 'other',
  endpointLabel: 'wikidata',
};

describe('SettingsService', () => {
  let service: SettingsService;
  let mockDb: ReturnType<typeof createMockDb>;
  let appConfigMock: { getSettingsDefaults: jest.Mock };

  beforeEach(async () => {
    mockDb = createMockDb();
    appConfigMock = {
      getSettingsDefaults: jest.fn().mockReturnValue(fakeDefaults),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SettingsService,
        { provide: SETTINGS_DB, useValue: mockDb },
        { provide: AppConfigService, useValue: appConfigMock },
      ],
    }).compile();

    service = module.get<SettingsService>(SettingsService);
    jest.clearAllMocks();
  });

  describe('getSettings', () => {
    it('returns defaults when no row exists', () => {
      mockDb.prepare.mockReturnValue({
        get: jest.fn().mockReturnValue(undefined),
        run: jest.fn(),
        all: jest.fn(),
      });

      const settings = service.getSettings();
      expect(settings.lang).toBe('en');
      expect(settings.resultLimit).toBe(500);
      expect(settings.endpointType).toBe('other');
      expect(appConfigMock.getSettingsDefaults).toHaveBeenCalled();
    });

    it('returns stored settings when a row exists', () => {
      const stored = {
        lang: 'es',
        labelUri: 'rdfs:label',
        searchClass: {
          uri: { type: 'uri', value: 'x' },
          label: { type: 'literal', value: 'x' },
        },
        resultLimit: 100,
        wikibaseAdapter: false,
        endpointType: 'fuseki',
        endpointLabel: 'my fuseki',
      };
      mockDb.prepare.mockReturnValue({
        get: jest.fn().mockReturnValue({ data: JSON.stringify(stored) }),
        run: jest.fn(),
        all: jest.fn(),
      });

      const settings = service.getSettings();
      expect(settings).toEqual(stored);
    });
  });

  describe('updateSettings', () => {
    it('merges partial update and persists', async () => {
      mockDb.prepare.mockReturnValue({
        get: jest.fn().mockReturnValue(undefined),
        run: jest.fn(),
        all: jest.fn(),
      });

      const updated = await service.updateSettings({ lang: 'es' });
      expect(updated.lang).toBe('es');
      expect(updated.resultLimit).toBe(500);
      expect(mockDb.prepare).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO settings'),
      );
    });

    it('rejects invalid updates', async () => {
      mockDb.prepare.mockReturnValue({
        get: jest.fn().mockReturnValue(undefined),
        run: jest.fn(),
        all: jest.fn(),
      });

      await expect(
        service.updateSettings({ resultLimit: -5 }),
      ).rejects.toMatchObject({ code: 'INVALID_SETTINGS' });
    });

    it('rejects invalid endpoint type', async () => {
      mockDb.prepare.mockReturnValue({
        get: jest.fn().mockReturnValue(undefined),
        run: jest.fn(),
        all: jest.fn(),
      });

      await expect(
        service.updateSettings({ endpointType: 'invalid' as never }),
      ).rejects.toMatchObject({ code: 'INVALID_SETTINGS' });
    });

    it('rejects color override with malformed color', async () => {
      mockDb.prepare.mockReturnValue({
        get: jest.fn().mockReturnValue(undefined),
        run: jest.fn(),
        all: jest.fn(),
      });

      await expect(
        service.updateSettings({
          classColorOverrides: { 'http://example.org/X': 'red' },
        }),
      ).rejects.toMatchObject({ code: 'INVALID_SETTINGS' });
    });

    it('rejects color override with malformed URI', async () => {
      mockDb.prepare.mockReturnValue({
        get: jest.fn().mockReturnValue(undefined),
        run: jest.fn(),
        all: jest.fn(),
      });

      await expect(
        service.updateSettings({
          classColorOverrides: { 'not a uri': '#FF0000' },
        }),
      ).rejects.toMatchObject({ code: 'INVALID_SETTINGS' });
    });

    it('accepts well-formed color override map', async () => {
      mockDb.prepare.mockReturnValue({
        get: jest.fn().mockReturnValue(undefined),
        run: jest.fn(),
        all: jest.fn(),
      });

      const updated = await service.updateSettings({
        classColorOverrides: { 'http://www.wikidata.org/entity/Q5': '#FF00FF' },
      });
      expect(updated.classColorOverrides['http://www.wikidata.org/entity/Q5']).toBe('#FF00FF');
    });
  });
});
