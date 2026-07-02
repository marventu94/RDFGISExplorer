import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class EntitySearchQueryDto {
  @IsString()
  q!: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @IsOptional()
  @IsString()
  classUri?: string;
}
