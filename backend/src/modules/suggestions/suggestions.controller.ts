import { Controller, Get, Query, Logger } from '@nestjs/common';
import { SuggestionsService } from './suggestions.service';
import { EntitySearchQueryDto } from './dto/entity-search-query.dto';

@Controller('suggestions')
export class SuggestionsController {
  private readonly log = new Logger(SuggestionsController.name);

  constructor(private readonly suggestionsService: SuggestionsService) {}

  @Get('predicates')
  getPredicates(): Promise<{ predicates: string[] }> {
    return this.suggestionsService
      .getPredicates()
      .then((predicates) => ({ predicates }));
  }

  @Get('entities')
  async searchEntities(@Query() query: EntitySearchQueryDto): Promise<{
    entities: import('./suggestions.service').EntitySearchResult[];
  }> {
    this.log.log(
      `[controller] GET /api/suggestions/entities rawQuery=${JSON.stringify(query)}`,
    );
    const q = query.q ?? '';
    const limit = query.limit;
    const classUri = query.classUri;
    this.log.log(
      `[controller] parsed q=${JSON.stringify(q)} limit=${limit} classUri=${classUri ?? '(none)'}`,
    );
    try {
      const entities = await this.suggestionsService.searchEntities(q, limit, classUri);
      this.log.log(`[controller] returning ${entities.length} entities`);
      return { entities };
    } catch (err) {
      this.log.error(
        `[controller] searchEntities threw: ${(err as Error).message}`,
        (err as Error).stack,
      );
      throw err;
    }
  }
}
