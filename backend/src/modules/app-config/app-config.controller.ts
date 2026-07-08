import { Controller, Get } from '@nestjs/common';
import { AppConfigService } from './app-config.service';
import type { AppConfigDto } from './dto/app-config.dto';

@Controller('config')
export class AppConfigController {
  constructor(private readonly appConfig: AppConfigService) {}

  @Get()
  getConfig(): AppConfigDto {
    return this.appConfig.getConfig();
  }
}
