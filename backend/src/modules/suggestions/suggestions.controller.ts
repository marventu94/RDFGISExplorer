import { Controller, Get } from '@nestjs/common';
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
}
