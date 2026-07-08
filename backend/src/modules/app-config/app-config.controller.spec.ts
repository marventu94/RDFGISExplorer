import { Test, TestingModule } from '@nestjs/testing';
import { AppConfigController } from './app-config.controller';
import { AppConfigService } from './app-config.service';

describe('AppConfigController', () => {
  let controller: AppConfigController;
  let service: { getConfig: jest.Mock };

  beforeEach(async () => {
    service = {
      getConfig: jest.fn().mockReturnValue({
        backend: 'wikidata',
        endpointUrl: 'https://query.wikidata.org/sparql',
        hasBasicAuth: false,
        userAgent: 'test-agent/1.0',
        timeoutMs: 10000,
        defaultLimit: 500,
        maxLimit: 2000,
        capabilities: ['sparql11'],
        supportsWikibaseLabel: true,
        defaultPrefixes: {},
        search: { mode: 'wikidata-api', labelProperty: 'rdfs:label' },
        labelUri: 'rdfs:label',
        describe: {
          exclude: [],
          objects: [],
          datatype: [],
          text: [],
          image: [],
          external: [],
        },
        defaults: {
          lang: 'en',
          resultLimit: 500,
          labelUri: 'rdfs:label',
          searchClass: {
            uri: { type: 'uri', value: 'x' },
            label: { type: 'literal', value: 'x' },
          },
          wikibaseAdapter: true,
          endpointType: 'other',
          endpointLabel: 'wikidata',
        },
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AppConfigController],
      providers: [{ provide: AppConfigService, useValue: service }],
    }).compile();

    controller = module.get<AppConfigController>(AppConfigController);
  });

  it('delegates to AppConfigService', () => {
    const result = controller.getConfig();
    expect(result.backend).toBe('wikidata');
    expect(result.defaults.lang).toBe('en');
    expect(service.getConfig).toHaveBeenCalled();
  });
});
