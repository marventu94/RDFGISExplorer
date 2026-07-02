import { Controller, Get, Query } from '@nestjs/common';
import { SuggestionsService } from './suggestions.service';
import type { EntitySearchQueryDto } from './dto/entity-search-query.dto';

@Controller('suggestions')
export class SuggestionsController {
  constructor(private readonly suggestionsService: SuggestionsService) {}

  @Get('predicates')
  getPredicates(): Promise<{ predicates: string[] }> {
    return this.suggestionsService
      .getPredicates()
      .then((predicates) => ({ predicates }));
  }

  @Get('entities')
  searchEntities(@Query() query: EntitySearchQueryDto): Promise<{
    entities: import('./suggestions.service').EntitySearchResult[];
  }> {
    return this.suggestionsService
      .searchEntities(query.q ?? '', query.limit, query.classUri)
      .then((entities) => ({ entities }));
  }
}
