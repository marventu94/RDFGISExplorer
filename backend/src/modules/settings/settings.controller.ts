import {
  Body,
  Controller,
  Get,
  HttpException,
  HttpStatus,
  Put,
} from '@nestjs/common';
import { SettingsService } from './settings.service';
import type { AppSettingsDto } from './dto/app-settings.dto';
import { UpdateAppSettingsDto } from './dto/update-settings.dto';

@Controller('settings')
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}

  @Get()
  getSettings(): AppSettingsDto {
    return this.settings.getSettings();
  }

  @Put()
  async updateSettings(
    @Body() body: UpdateAppSettingsDto,
  ): Promise<AppSettingsDto> {
    try {
      return await this.settings.updateSettings(body);
    } catch (err) {
      const code = (err as { code?: string }).code;
      if (code === 'INVALID_SETTINGS') {
        throw new HttpException(
          {
            error: 'INVALID_SETTINGS',
            message: (err as Error).message,
          },
          HttpStatus.BAD_REQUEST,
        );
      }
      throw err;
    }
  }
}
