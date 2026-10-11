import { EventEmitter } from 'node:events';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import { createMcpServer } from './mcp-server';
import { McpController } from './mcp.controller';
import type { ExplorerApiClient } from './explorer-api.client';
import type { DashboardsService } from '../dashboards/dashboards.service';

// Sin sockets: el guard de CI bloquea la red. La prueba HTTP real está en
// test/mcp.e2e-spec.ts (`pnpm test:e2e`).
const transport = { handleRequest: jest.fn(), close: jest.fn() };
jest.mock('@modelcontextprotocol/sdk/server/streamableHttp.js', () => ({
  StreamableHTTPServerTransport: jest.fn(() => transport),
}));
const server = { connect: jest.fn(), close: jest.fn() };
jest.mock('./mcp-server', () => ({ createMcpServer: jest.fn(() => server) }));

function controller(env: Record<string, string | undefined> = {}): McpController {
  return new McpController(
    { get: (key: string) => env[key] } as unknown as ConfigService,
    {} as ExplorerApiClient,
    {} as DashboardsService,
  );
}

describe('McpController', () => {
  beforeEach(() => jest.clearAllMocks());

  it('serves each POST with a fresh server and stateless transport', async () => {
    const { StreamableHTTPServerTransport } = jest.requireMock(
      '@modelcontextprotocol/sdk/server/streamableHttp.js',
    );
    const req = { body: { jsonrpc: '2.0', method: 'tools/list' } } as Request;
    const res = new EventEmitter() as unknown as Response;

    await controller({ MCP_PUBLIC_APP_URL: 'https://rdfgis.vpn/', MCP_MAX_ROWS: '25' }).handle(req, res);

    expect(createMcpServer).toHaveBeenCalledWith(
      expect.objectContaining({ appUrl: 'https://rdfgis.vpn', maxRows: 25 }),
    );
    expect(StreamableHTTPServerTransport).toHaveBeenCalledWith({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });
    expect(server.connect).toHaveBeenCalledWith(transport);
    expect(transport.handleRequest).toHaveBeenCalledWith(req, res, req.body);

    (res as unknown as EventEmitter).emit('close');
    expect(transport.close).toHaveBeenCalled();
    expect(server.close).toHaveBeenCalled();
  });

  it('falls back to safe defaults for links and row caps', async () => {
    const res = new EventEmitter() as unknown as Response;
    await controller({ MCP_MAX_ROWS: 'abc' }).handle({ body: {} } as Request, res);
    expect(createMcpServer).toHaveBeenCalledWith(
      expect.objectContaining({ appUrl: 'http://localhost:4200', maxRows: 100 }),
    );
  });

  it('answers other methods with a JSON-RPC error and an Allow header', () => {
    const setHeader = jest.fn();
    const body = controller().methodNotAllowed({ setHeader } as unknown as Response);
    expect(setHeader).toHaveBeenCalledWith('Allow', 'POST');
    expect(body).toMatchObject({ jsonrpc: '2.0', error: { code: -32000 } });
  });
});
