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

export const SUPPORTED_LANGS = ['en', 'es'] as const;
export type SupportedLang = (typeof SUPPORTED_LANGS)[number];

export const ENDPOINT_TYPES = ['virtuoso', 'fuseki', 'other'] as const;
export type EndpointType = (typeof ENDPOINT_TYPES)[number];

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

  @IsIn(ENDPOINT_TYPES)
  endpointType!: EndpointType;
}
