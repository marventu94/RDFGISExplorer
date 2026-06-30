import { Controller, Get, Query } from '@nestjs/common';
import { SuggestionsService } from './suggestions.service';

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
  searchEntities(
    @Query('q') q: string,
    @Query('limit') limit?: string,
  ): Promise<{ entities: import('./suggestions.service').EntitySearchResult[] }> {
    return this.suggestionsService
      .searchEntities(q ?? '', limit ? parseInt(limit, 10) : 20)
      .then((entities) => ({ entities }));
  }
}
