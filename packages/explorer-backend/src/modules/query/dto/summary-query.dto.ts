import {
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

export class SummaryQueryDto {
  @IsString()
  query!: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  numericVars?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  temporalVars?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  categoricalVars?: string[];

  @IsOptional()
  @IsInt()
  @Min(1000)
  @Max(120000)
  timeoutMs?: number;
}
