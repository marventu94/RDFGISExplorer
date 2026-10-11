import { INestApplication } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { DashboardsService } from '../dashboards/dashboards.service';
import { ExplorerApiClient } from './explorer-api.client';
import { McpController } from './mcp.controller';
import { McpGuard } from './mcp.guard';

const INITIALIZE = {
  jsonrpc: '2.0',
  id: 1,
  method: 'initialize',
  params: {
    protocolVersion: '2025-06-18',
    capabilities: {},
    clientInfo: { name: 'supertest', version: '1.0.0' },
  },
};

describe('McpController (HTTP)', () => {
  let app: INestApplication;
  const savedEnv = { ...process.env };

  async function boot(env: Record<string, string | undefined>): Promise<void> {
    process.env = { ...savedEnv, ...env };
    const moduleRef = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ ignoreEnvFile: true })],
      controllers: [McpController],
      providers: [
        McpGuard,
        { provide: ExplorerApiClient, useValue: { get: jest.fn(), post: jest.fn() } },
        { provide: DashboardsService, useValue: { findAll: jest.fn(() => []), findOne: jest.fn(), create: jest.fn() } },
      ],
    }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
  }

  afterEach(async () => {
    await app?.close();
    process.env = { ...savedEnv };
  });

  function post() {
    return request(app.getHttpServer())
      .post('/api/mcp')
      .set('Accept', 'application/json, text/event-stream')
      .set('Content-Type', 'application/json');
  }

  it('does not exist unless MCP_TOKEN is configured', async () => {
    await boot({ MCP_TOKEN: undefined });
    await post().send(INITIALIZE).expect(404);
  });

  it('rejects a missing or wrong bearer token', async () => {
    await boot({ MCP_TOKEN: 'secret' });
    await post().send(INITIALIZE).expect(401);
    await post().set('Authorization', 'Bearer nope').send(INITIALIZE).expect(401);
  });

  it('rejects browser requests from an origin outside CORS_ORIGINS', async () => {
    await boot({ MCP_TOKEN: 'secret', CORS_ORIGINS: 'https://rdfgis.vpn' });
    await post()
      .set('Authorization', 'Bearer secret')
      .set('Origin', 'https://evil.example')
      .send(INITIALIZE)
      .expect(403);
  });

  it('initializes and lists tools with a valid token', async () => {
    await boot({ MCP_TOKEN: 'secret' });
    const init = await post().set('Authorization', 'Bearer secret').send(INITIALIZE).expect(200);
    expect(init.body.result.serverInfo.name).toBe('rdf-gis-explorer');

    const list = await post()
      .set('Authorization', 'Bearer secret')
      .send({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} })
      .expect(200);
    expect(list.body.result.tools.map((t: { name: string }) => t.name)).toContain('run_select');
  });

  it('answers 405 to GET: the stateless server has no notification stream', async () => {
    await boot({ MCP_TOKEN: 'secret' });
    await request(app.getHttpServer())
      .get('/api/mcp')
      .set('Authorization', 'Bearer secret')
      .expect(405);
  });
});
