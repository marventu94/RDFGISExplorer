import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  HttpCode,
  ParseIntPipe,
  DefaultValuePipe,
} from '@nestjs/common';
import { DashboardsService } from './dashboards.service';
import { CreateDashboardDto } from './dto/create-dashboard.dto';
import { UpdateDashboardDto } from './dto/update-dashboard.dto';
import type { Dashboard } from './dto/dashboard.dto';

@Controller('dashboards')
export class DashboardsController {
  constructor(private readonly dashboardsService: DashboardsService) {}

  @Get()
  findAll(): Dashboard[] {
    return this.dashboardsService.findAll();
  }

  @Get('recent')
  findRecent(
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number,
  ): Dashboard[] {
    const clamped = Math.min(Math.max(limit, 1), 50);
    return this.dashboardsService.findRecent(clamped);
  }

  @Get(':id')
  findOne(@Param('id') id: string): Dashboard {
    return this.dashboardsService.findOne(id);
  }

  @Post()
  @HttpCode(201)
  create(@Body() dto: CreateDashboardDto): Dashboard {
    return this.dashboardsService.create(dto);
  }

  @Put(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateDashboardDto,
  ): Dashboard {
    return this.dashboardsService.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@Param('id') id: string): void {
    return this.dashboardsService.remove(id);
  }
}
