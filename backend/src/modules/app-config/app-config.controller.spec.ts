import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { AppConfigController } from './app-config.controller';

describe('AppConfigController', () => {
  let controller: AppConfigController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AppConfigController],
      providers: [
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              const values: Record<string, string> = {
                SPARQL_BACKEND: 'wikidata',
                SPARQL_ENDPOINT_URL: 'https://query.wikidata.org/sparql',
                SPARQL_USER: 'test-agent/1.0',
                SPARQL_TIMEOUT_MS: '10000',
                SPARQL_DEFAULT_LIMIT: '500',
                SPARQL_MAX_LIMIT: '2000',
              };
              return values[key];
            }),
          },
        },
      ],
    }).compile();

    controller = module.get<AppConfigController>(AppConfigController);
  });

  it('should expose public config without password', () => {
    const config = controller.getConfig();
    expect(config.backend).toBe('wikidata');
    expect(config.endpointUrl).toBe('https://query.wikidata.org/sparql');
    expect(config.hasBasicAuth).toBe(false);
    expect(config.supportsWikibaseLabel).toBe(true);
    expect(config.defaultPrefixes.wd).toBeDefined();
    expect(config.search.mode).toBe('wikidata-api');
    expect(config.search.endpoint).toBe('https://www.wikidata.org/w/api.php');
  });
});
