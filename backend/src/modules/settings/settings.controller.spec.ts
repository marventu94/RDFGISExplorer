import { Test, TestingModule } from '@nestjs/testing';
import { HttpException } from '@nestjs/common';
import { SettingsController } from './settings.controller';
import { SettingsService } from './settings.service';
import type { AppSettingsDto } from './dto/app-settings.dto';

const baseSettings: AppSettingsDto = {
  lang: 'en',
  labelUri: 'rdfs:label',
  searchClass: {
    uri: { type: 'uri', value: 'http://www.wikidata.org/entity/Q5' },
    label: { type: 'literal', value: 'human', 'xml:lang': 'en' },
  },
  resultLimit: 500,
  endpointType: 'other',
};

describe('SettingsController', () => {
  let controller: SettingsController;
  let service: {
    getSettings: jest.Mock;
    updateSettings: jest.Mock;
  };

  beforeEach(async () => {
    service = {
      getSettings: jest.fn().mockReturnValue(baseSettings),
      updateSettings: jest.fn().mockResolvedValue(baseSettings),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [SettingsController],
      providers: [{ provide: SettingsService, useValue: service }],
    }).compile();

    controller = module.get<SettingsController>(SettingsController);
  });

  it('GET /settings returns the current settings', () => {
    const result = controller.getSettings();
    expect(result).toEqual(baseSettings);
    expect(service.getSettings).toHaveBeenCalled();
  });

  it('PUT /settings returns the updated settings', async () => {
    const body = { lang: 'es' as const };
    const result = await controller.updateSettings(body);
    expect(result).toEqual(baseSettings);
    expect(service.updateSettings).toHaveBeenCalledWith(body);
  });

  it('PUT /settings maps INVALID_SETTINGS to 400', async () => {
    const err = new Error('bad') as Error & { code?: string };
    err.code = 'INVALID_SETTINGS';
    service.updateSettings.mockRejectedValueOnce(err);

    await expect(
      controller.updateSettings({ lang: 'en' }),
    ).rejects.toBeInstanceOf(HttpException);
  });

  it('PUT /settings rethrows other errors unchanged', async () => {
    service.updateSettings.mockRejectedValueOnce(new Error('db down'));
    await expect(controller.updateSettings({ lang: 'en' })).rejects.toThrow(
      'db down',
    );
  });
});
