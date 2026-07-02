import {
  IsBoolean,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Max,
  Min,
  Validate,
  ValidateNested,
  ValidationArguments,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';
import { Type } from 'class-transformer';

export const SUPPORTED_LANGS = ['en', 'es'] as const;
export type SupportedLang = (typeof SUPPORTED_LANGS)[number];

export const ENDPOINT_TYPES = ['virtuoso', 'fuseki', 'other'] as const;
export type EndpointType = (typeof ENDPOINT_TYPES)[number];

export const THEMES = ['light', 'dark'] as const;
export type Theme = (typeof THEMES)[number];

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

export class EndpointConfigDto {
  @IsString()
  url!: string;

  @IsIn(ENDPOINT_TYPES)
  type!: EndpointType;

  @IsString()
  label!: string;
}

export class SearchClassBindingDto {
  @IsString()
  type!: 'uri' | 'literal';

  @IsString()
  value!: string;

  @IsOptional()
  @IsString()
  'xml:lang'?: string;
}

export class SearchClassDto {
  @ValidateNested()
  @Type(() => SearchClassBindingDto)
  uri!: SearchClassBindingDto;

  @ValidateNested()
  @Type(() => SearchClassBindingDto)
  label!: SearchClassBindingDto;
}

export class AppSettingsDto {
  @IsIn(SUPPORTED_LANGS)
  lang!: SupportedLang;

  @IsString()
  labelUri!: string;

  @ValidateNested()
  @Type(() => SearchClassDto)
  searchClass!: SearchClassDto;

  @IsInt()
  @Min(1)
  @Max(2000)
  resultLimit!: number;

  @IsBoolean()
  wikibaseAdapter!: boolean;

  @IsIn(ENDPOINT_TYPES)
  endpointType!: EndpointType;

  @IsString()
  endpointLabel!: string;

  @IsObject()
  @Validate(ColorOverrideMapConstraint)
  classColorOverrides!: Record<string, string>;

  @IsIn(THEMES)
  theme!: Theme;
}
