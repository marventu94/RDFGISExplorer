import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import {
  ENDPOINT_TYPES,
  SearchClassDto,
  SUPPORTED_LANGS,
} from './app-settings.dto';
import type { EndpointType, SupportedLang } from './app-settings.dto';

export class UpdateAppSettingsDto {
  @IsOptional()
  @IsIn(SUPPORTED_LANGS)
  lang?: SupportedLang;

  @IsOptional()
  @IsString()
  labelUri?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => SearchClassDto)
  searchClass?: SearchClassDto;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(2000)
  resultLimit?: number;

  @IsOptional()
  @IsIn(ENDPOINT_TYPES)
  endpointType?: EndpointType;
}
