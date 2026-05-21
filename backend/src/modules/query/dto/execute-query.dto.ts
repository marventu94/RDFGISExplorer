import { IsString, IsOptional, IsInt, Min, Max } from 'class-validator';

export class ExecuteQueryDto {
  @IsString()
  sparql!: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(2000)
  limit?: number;
}
