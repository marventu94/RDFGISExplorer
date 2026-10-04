import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { DiscoveryService } from './discovery.service';
import {
  DiscoveryCatalogDto,
  DiscoveryFocusDto,
  DiscoveryPathsDto,
} from './discovery.dto';

@Controller('discovery')
export class DiscoveryController {
  constructor(private readonly discovery: DiscoveryService) {}
  @Get('catalog') catalog(@Query() dto: DiscoveryCatalogDto) {
    return this.discovery.catalog(dto.kind, dto.q, dto.offset);
  }
  @Post('connections') connections(@Body() dto: DiscoveryFocusDto) {
    return this.discovery.connections(dto);
  }
  @Post('paths') paths(@Body() dto: DiscoveryPathsDto) {
    return this.discovery.paths(dto.focus, dto.targetUri, dto.targetKind);
  }
}
