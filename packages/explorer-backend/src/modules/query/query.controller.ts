import { Controller, Post, Body } from '@nestjs/common';
import { QueryService } from './query.service';
import { ExecuteQueryDto } from './dto/execute-query.dto';
import { SummaryQueryDto } from './dto/summary-query.dto';
import { QueryResult } from '../../shared/dto/query-result.dto';
import { QuerySummary } from '../../shared/dto/query-summary.dto';

@Controller('query')
export class QueryController {
  constructor(private readonly queryService: QueryService) {}

  @Post('execute')
  execute(@Body() dto: ExecuteQueryDto): Promise<QueryResult> {
    return this.queryService.execute(dto.sparql, dto.limit, dto.raw);
  }

  @Post('summary')
  summary(@Body() dto: SummaryQueryDto): Promise<QuerySummary> {
    return this.queryService.summarize(dto);
  }
}
