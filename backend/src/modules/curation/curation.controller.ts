import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Headers,
  HttpCode,
} from '@nestjs/common';
import { CurationService } from './curation.service';
import {
  CreateCurationDto,
  UpdateCurationDto,
  DuplicateDecisionDto,
} from '../../shared/dto/curation.dto';
import type {
  CurationRecord,
  DuplicateCandidate,
} from '../../shared/dto/curation.dto';

@Controller('curation')
export class CurationController {
  constructor(private readonly curationService: CurationService) {}

  @Get(':nodeUri')
  getForNode(@Param('nodeUri') nodeUri: string): {
    records: CurationRecord[];
    duplicates: DuplicateCandidate[];
  } {
    return this.curationService.getForNode(decodeURIComponent(nodeUri));
  }

  @Post()
  @HttpCode(201)
  create(
    @Body() dto: CreateCurationDto,
    @Headers('x-author') authorHeader?: string,
  ): CurationRecord {
    const author = authorHeader ?? 'martin@bago.com.ar';
    return this.curationService.create(dto, author);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateCurationDto,
  ): CurationRecord {
    return this.curationService.update(Number(id), dto);
  }

  @Get('duplicates/:nodeUri')
  getDuplicates(@Param('nodeUri') nodeUri: string): DuplicateCandidate[] {
    return this.curationService.getDuplicates(decodeURIComponent(nodeUri));
  }

  @Post('duplicates/:id/decision')
  decideDuplicate(
    @Param('id') id: string,
    @Body() dto: DuplicateDecisionDto,
    @Headers('x-author') authorHeader?: string,
  ): DuplicateCandidate {
    const author = authorHeader ?? 'martin@bago.com.ar';
    return this.curationService.decideDuplicate(
      Number(id),
      dto.decision,
      author,
    );
  }
}
