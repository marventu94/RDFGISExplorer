import { IsString, IsOptional, IsInt, IsBoolean, Min } from 'class-validator';

export class ExecuteQueryDto {
  @IsString()
  sparql!: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  limit?: number;

  /** Modo crudo (export): sin proyección de intermedios ni grafo, solo bindings. */
  @IsOptional()
  @IsBoolean()
  raw?: boolean;
}
