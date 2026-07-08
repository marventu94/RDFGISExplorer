import { IsString, IsOptional, IsInt, Min } from 'class-validator';

export class ExecuteQueryDto {
  @IsString()
  sparql!: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  limit?: number;
}
