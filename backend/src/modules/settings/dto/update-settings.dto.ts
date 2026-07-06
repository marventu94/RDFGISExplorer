import {
  IsBoolean,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
  ValidationArguments,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';
import { Type } from 'class-transformer';
import {
  ENDPOINT_TYPES,
  SearchClassDto,
  SUPPORTED_LANGS,
  THEMES,
} from './app-settings.dto';
import type { EndpointType, SupportedLang, Theme } from './app-settings.dto';

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;
const URI_PATTERN = /^[a-z][a-z0-9+.-]*:[^\s<>"]*$/i;

@ValidatorConstraint({ name: 'colorOverrideMap', async: false })
class ColorOverrideMapConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    if (value === undefined || value === null) return true;
    if (typeof value !== 'object' || Array.isArray(value)) return false;
    for (const [key, val] of Object.entries(value)) {
      if (!URI_PATTERN.test(key)) return false;
      if (typeof val !== 'string' || !HEX_COLOR.test(val)) return false;
    }
    return true;
  }

  defaultMessage(args: ValidationArguments): string {
    return `${args.property} must be a map of URI -> #RRGGBB color`;
  }
}

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
  @IsBoolean()
  wikibaseAdapter?: boolean;

  @IsOptional()
  @IsIn(ENDPOINT_TYPES)
  endpointType?: EndpointType;

  @IsOptional()
  @IsString()
  endpointLabel?: string;

  @IsOptional()
  @IsObject()
  classColorOverrides?: Record<string, string>;

  @IsOptional()
  @IsIn(THEMES)
  theme?: Theme;
}

export { ColorOverrideMapConstraint };
