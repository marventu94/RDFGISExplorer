import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsDefined,
  IsInt,
  Min,
  Max,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import type { DiscoveryFocus, DiscoveryStep } from '@rdfgis/contracts';

export class DiscoveryCatalogDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(100000) offset = 0;
  @IsOptional() @IsString() @MaxLength(200) q = '';
  @IsIn(['class', 'property', 'resource']) kind:
    'class' | 'property' | 'resource' = 'class';
}
export class DiscoveryStepDto implements DiscoveryStep {
  @IsString() @MaxLength(2048) predicate!: string;
  @IsIn(['out', 'in']) direction!: 'out' | 'in';
  @IsIn(['resource', 'literal']) kind!: 'resource' | 'literal';
  @IsOptional() @IsString() @MaxLength(2048) targetClass?: string;
  @IsOptional() @IsString() @MaxLength(2048) datatype?: string;
}
export class DiscoveryFocusDto implements DiscoveryFocus {
  @IsOptional() @IsString() @MaxLength(2048) propertyUri?: string;
  @IsOptional() @IsString() @MaxLength(2048) classUri?: string;
  @IsOptional() @IsString() @MaxLength(2048) uri?: string;
  @IsOptional() @IsString() @MaxLength(50000) query?: string;
  @IsOptional() @IsString() @MaxLength(100) variable?: string;
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(12)
  @ValidateNested({ each: true })
  @Type(() => DiscoveryStepDto)
  steps?: DiscoveryStepDto[];
}
export class DiscoveryConnectionsDto extends DiscoveryFocusDto {
  @IsOptional() @IsIn(['out', 'in']) direction?: 'out' | 'in';
}
export class DiscoveryPathsDto {
  @IsDefined()
  @ValidateNested()
  @Type(() => DiscoveryFocusDto)
  focus!: DiscoveryFocusDto;
  @IsString() @MaxLength(2048) targetUri!: string;
  @IsIn(['class', 'property']) targetKind!: 'class' | 'property';
}
