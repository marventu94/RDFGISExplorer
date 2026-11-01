import { QUERY_TIMEOUT_MS } from '../../../common/query-timeout';
import {
  IsString,
  IsOptional,
  IsInt,
  IsBoolean,
  Min,
  Max,
} from 'class-validator';

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

  @IsOptional()
  @IsInt()
  @Min(1000)
  @Max(QUERY_TIMEOUT_MS)
  timeoutMs?: number;
}
