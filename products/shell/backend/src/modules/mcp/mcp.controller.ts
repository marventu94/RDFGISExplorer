import { All, Controller, HttpCode, Post, Req, Res, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import type { Request, Response } from 'express';
import { DashboardsService } from '../dashboards/dashboards.service';
import { ExplorerApiClient } from './explorer-api.client';
import { createMcpServer } from './mcp-server';
import { McpGuard } from './mcp.guard';

/**
 * `POST /api/mcp`: servidor MCP por Streamable HTTP, sin estado. Cada request
 * arma su servidor y su transporte; no hay sesiones que limpiar ni que
 * compartir entre réplicas.
 */
@Controller('mcp')
@UseGuards(McpGuard)
export class McpController {
  private readonly appUrl: string;
  private readonly maxRows: number;

  constructor(
    config: ConfigService,
    private readonly api: ExplorerApiClient,
    private readonly dashboards: DashboardsService,
  ) {
    this.appUrl = (config.get<string>('MCP_PUBLIC_APP_URL') ?? 'http://localhost:4200').replace(
      /\/+$/,
      '',
    );
    const rows = parseInt(config.get<string>('MCP_MAX_ROWS') ?? '', 10);
    this.maxRows = Number.isInteger(rows) && rows > 0 ? rows : 100;
  }

  @Post()
  async handle(@Req() req: Request, @Res() res: Response): Promise<void> {
    const server = createMcpServer({
      api: this.api,
      dashboards: this.dashboards,
      appUrl: this.appUrl,
      maxRows: this.maxRows,
    });
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });
    res.on('close', () => {
      void transport.close();
      void server.close();
    });
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  }

  /** Sin sesiones no hay stream de notificaciones (GET) ni cierre de sesión (DELETE). */
  @All()
  @HttpCode(405)
  methodNotAllowed(@Res({ passthrough: true }) res: Response) {
    res.setHeader('Allow', 'POST');
    return {
      jsonrpc: '2.0',
      error: { code: -32000, message: 'Method not allowed.' },
      id: null,
    };
  }
}
