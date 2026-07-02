import { Test, TestingModule } from '@nestjs/testing';
import { AppConfigService } from './app-config.service';
import { ConfigService } from '@nestjs/config';

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
      expect(defaults.wikibaseAdapter).toBe(config.supportsWikibaseLabel);
      expect(defaults.endpointLabel).toBe(config.backend);
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
      expect(defaults.wikibaseAdapter).toBe(false);
      expect(defaults.endpointLabel).toBe('generic');
    });

    it('returns empty classColors for generic backend', () => {
      const config = service.getConfig();
      expect(config.classColors).toEqual({});
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
});
