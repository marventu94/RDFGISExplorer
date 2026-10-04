import { Body, Controller, Get, Post, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { withRequestCancellation } from './request-cancellation';
import { DiscoveryService } from './discovery.service';
import {
  DiscoveryCatalogDto,
  DiscoveryFocusDto,
  DiscoveryPathsDto,
} from './discovery.dto';

@Controller('discovery')
export class DiscoveryController {
  constructor(private readonly discovery: DiscoveryService) {}
  @Get('catalog') catalog(
    @Query() dto: DiscoveryCatalogDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    return withRequestCancellation(response, (signal) =>
      this.discovery.catalog(dto.kind, dto.q, dto.offset, signal),
    );
  }
  @Post('connections') connections(
    @Body() dto: DiscoveryFocusDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    return withRequestCancellation(response, (signal) =>
      this.discovery.connections(dto, signal),
    );
  }
  @Post('paths') paths(
    @Body() dto: DiscoveryPathsDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    return withRequestCancellation(response, (signal) =>
      this.discovery.paths(dto.focus, dto.targetUri, dto.targetKind, signal),
    );
  }
}
