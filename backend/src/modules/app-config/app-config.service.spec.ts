import { Test, TestingModule } from '@nestjs/testing';
import { AppConfigService } from './app-config.service';
import { ConfigService } from '@nestjs/config';
import { existsSync, rmSync, writeFileSync } from 'fs';

function createConfigMock(values: Record<string, string | undefined>) {
  return {
    get: jest.fn((key: string) => values[key]),
  };
}

describe('AppConfigService', () => {
  describe('wikidata backend', () => {
    let service: AppConfigService;

    beforeEach(async () => {
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          AppConfigService,
          {
            provide: ConfigService,
            useValue: createConfigMock({
              SPARQL_BACKEND: 'wikidata',
              SPARQL_ENDPOINT_URL: 'https://query.wikidata.org/sparql',
              SPARQL_USER: 'test-agent/1.0',
              SPARQL_TIMEOUT_MS: '10000',
              SPARQL_DEFAULT_LIMIT: '500',
              SPARQL_MAX_LIMIT: '2000',
              SPARQL_USERNAME: '',
              SPARQL_PASSWORD: '',
            }),
          },
        ],
      }).compile();

      service = module.get<AppConfigService>(AppConfigService);
    });

    it('returns public config derived from env', () => {
      const config = service.getConfig();
      expect(config.backend).toBe('wikidata');
      expect(config.endpointUrl).toBe('https://query.wikidata.org/sparql');
      expect(config.hasBasicAuth).toBe(false);
      expect(config.supportsWikibaseLabel).toBe(true);
      expect(config.defaultPrefixes.wd).toBeDefined();
      expect(config.search.mode).toBe('wikidata-api');
    });

    it('exposes labelUri and describe config', () => {
      const config = service.getConfig();
      expect(config.labelUri).toBe(
        'http://www.w3.org/2000/01/rdf-schema#label',
      );
      expect(config.describe.objects).toContain(
        'http://www.wikidata.org/prop/direct/P31',
      );
      expect(config.describe.image.length).toBeGreaterThan(0);
    });

    it('exposes settings defaults that match runtime config', () => {
      const config = service.getConfig();
      const defaults = service.getSettingsDefaults();
      expect(defaults.lang).toBe('en');
      expect(defaults.resultLimit).toBe(config.defaultLimit);
      expect(defaults.labelUri).toBe(config.labelUri);
      expect(defaults.endpointType).toBe('other');
      expect(defaults.searchClass.uri.value).toBe(
        'http://www.wikidata.org/entity/Q5',
      );
    });

    it('exposes wikidata default classColors', () => {
      const config = service.getConfig();
      expect(config.classColors['http://www.wikidata.org/entity/Q5']).toBe(
        '#9C27B0',
      );
      expect(config.classColors['http://www.wikidata.org/entity/Q515']).toBe(
        '#2196F3',
      );
    });
  });

  describe('generic backend', () => {
    let service: AppConfigService;

    beforeEach(async () => {
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          AppConfigService,
          {
            provide: ConfigService,
            useValue: createConfigMock({
              SPARQL_BACKEND: 'generic',
              SPARQL_ENDPOINT_URL: 'http://localhost:7200/repositories/test',
              SPARQL_USER: 'test-agent/1.0',
              SPARQL_TIMEOUT_MS: '30000',
              SPARQL_DEFAULT_LIMIT: '500',
              SPARQL_MAX_LIMIT: '2000',
            }),
          },
        ],
      }).compile();

      service = module.get<AppConfigService>(AppConfigService);
    });

    it('does not expose wikidata-specific prefixes', () => {
      const config = service.getConfig();
      expect(config.supportsWikibaseLabel).toBe(false);
      expect(config.defaultPrefixes.wd).toBeUndefined();
      expect(config.defaultPrefixes.wdt).toBeUndefined();
      expect(config.search.mode).toBe('sparql');
    });

    it('uses neutral describe config for generic backend', () => {
      const config = service.getConfig();
      expect(config.describe.objects).toContain(
        'http://www.w3.org/1999/02/22-rdf-syntax-ns#type',
      );
      expect(config.describe.image).toEqual([]);
    });

    it('builds settings defaults with owl#Thing search class', () => {
      const defaults = service.getSettingsDefaults();
      expect(defaults.searchClass.uri.value).toBe(
        'http://www.w3.org/2002/07/owl#Thing',
      );
    });

    it('returns empty classColors for generic backend', () => {
      const config = service.getConfig();
      expect(config.classColors).toEqual({});
    });
  });

  describe('classColors via JSON', () => {
    const overridePath = 'config/class-colors.test-override.json';
    const invalidPath = 'config/class-colors.test-invalid.json';

    afterEach(() => {
      for (const p of [overridePath, invalidPath]) {
        if (existsSync(p)) rmSync(p);
      }
    });

    async function buildService(values: Record<string, string | undefined>) {
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          AppConfigService,
          { provide: ConfigService, useValue: createConfigMock(values) },
        ],
      }).compile();
      return module.get<AppConfigService>(AppConfigService);
    }

    it('loads class colors from CLASS_COLORS_PATH override', async () => {
      writeFileSync(
        overridePath,
        JSON.stringify({ 'http://example.org/Clase': '#112233' }),
      );
      const service = await buildService({
        SPARQL_BACKEND: 'graphdb',
        CLASS_COLORS_PATH: overridePath,
      });
      expect(service.getConfig().classColors).toEqual({
        'http://example.org/Clase': '#112233',
      });
    });

    it('returns empty classColors when the JSON file is invalid', async () => {
      writeFileSync(invalidPath, '{ not json');
      const service = await buildService({
        SPARQL_BACKEND: 'graphdb',
        CLASS_COLORS_PATH: invalidPath,
      });
      expect(service.getConfig().classColors).toEqual({});
    });
  });

  describe('basic auth', () => {
    it('detects basic auth when both username and password are set', () => {
      const configMock = createConfigMock({
        SPARQL_BACKEND: 'generic',
        SPARQL_ENDPOINT_URL: 'http://localhost:7200',
        SPARQL_USERNAME: 'user',
        SPARQL_PASSWORD: 'pass',
      });

      const service = new AppConfigService(
        configMock as unknown as ConfigService,
      );
      expect(service.getConfig().hasBasicAuth).toBe(true);
    });

    it('does not report basic auth when only username is set', () => {
      const configMock = createConfigMock({
        SPARQL_BACKEND: 'generic',
        SPARQL_ENDPOINT_URL: 'http://localhost:7200',
        SPARQL_USERNAME: 'user',
        SPARQL_PASSWORD: '',
      });

      const service = new AppConfigService(
        configMock as unknown as ConfigService,
      );
      expect(service.getConfig().hasBasicAuth).toBe(false);
    });
  });

  describe('limits', () => {
    it('exposes current defaults when the env vars are not set', () => {
      const service = new AppConfigService(
        createConfigMock({}) as unknown as ConfigService,
      );
      expect(service.getConfig().limits).toEqual({
        graphMaxNodes: 300,
        lotDefaultSize: 300,
        lotSizeOptions: [100, 300, 500],
        tablePageSizeOptions: [50, 100, 200],
        exportMaxRows: 50_000,
        exportMinPageSize: 250,
        summaryTopCategorical: 12,
      });
    });

    it('reads integer limits from env', () => {
      const service = new AppConfigService(
        createConfigMock({
          GIS_GRAPH_MAX_NODES: '150',
          GIS_LOT_DEFAULT_SIZE: '100',
          EXPORT_MAX_ROWS: '10000',
          EXPORT_MIN_PAGE_SIZE: '125',
          SUMMARY_TOP_CATEGORICAL_LIMIT: '7',
        }) as unknown as ConfigService,
      );
      const limits = service.getConfig().limits;
      expect(limits.graphMaxNodes).toBe(150);
      expect(limits.lotDefaultSize).toBe(100);
      expect(limits.exportMaxRows).toBe(10000);
      expect(limits.exportMinPageSize).toBe(125);
      expect(limits.summaryTopCategorical).toBe(7);
    });

    it('parses CSV list options from env', () => {
      const service = new AppConfigService(
        createConfigMock({
          GIS_LOT_SIZE_OPTIONS: '200, 400 ,800',
          GIS_TABLE_PAGE_SIZE_OPTIONS: '25,75',
        }) as unknown as ConfigService,
      );
      const limits = service.getConfig().limits;
      expect(limits.lotSizeOptions).toEqual([200, 400, 800]);
      expect(limits.tablePageSizeOptions).toEqual([25, 75]);
    });

    it('falls back to defaults on malformed env values', () => {
      const service = new AppConfigService(
        createConfigMock({
          GIS_GRAPH_MAX_NODES: 'abc',
          GIS_LOT_SIZE_OPTIONS: 'x,,y',
          EXPORT_MAX_ROWS: '-5',
        }) as unknown as ConfigService,
      );
      const limits = service.getConfig().limits;
      expect(limits.graphMaxNodes).toBe(300);
      expect(limits.lotSizeOptions).toEqual([100, 300, 500]);
      expect(limits.exportMaxRows).toBe(50_000);
    });
  });
});
