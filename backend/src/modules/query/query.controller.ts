import { Controller, Post, Body } from '@nestjs/common';
import { QueryService } from './query.service';
import { ExecuteQueryDto } from './dto/execute-query.dto';
import { QueryResult } from '../../shared/dto/query-result.dto';

@Controller('query')
export class QueryController {
  constructor(private readonly queryService: QueryService) {}

  @Post('execute')
  execute(@Body() dto: ExecuteQueryDto): Promise<QueryResult> {
    return this.queryService.execute(dto.sparql, dto.limit);
  }
}
