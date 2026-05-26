import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import * as fs from 'fs';
import * as path from 'path';

const dbPath = path.join(__dirname, '../data/dashboards-e2e.sqlite');

describe('DashboardsController (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(() => {
    process.env['DASHBOARDS_SQLITE_PATH'] = dbPath;
  });

  beforeEach(async () => {
    if (fs.existsSync(dbPath)) {
      fs.unlinkSync(dbPath);
    }

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));
    await app.init();
  });

  afterEach(async () => {
    await app.close();
    if (fs.existsSync(dbPath)) {
      fs.unlinkSync(dbPath);
    }
  });

  afterAll(() => {
    delete process.env['DASHBOARDS_SQLITE_PATH'];
  });

  it('POST /api/dashboards should create and return 201', () => {
    return request(app.getHttpServer())
      .post('/dashboards')
      .send({ kind: 'gis', name: 'test', payload: { q: 'SELECT *' } })
      .expect(201)
      .expect((res) => {
        expect(res.body.name).toBe('test');
        expect(res.body.kind).toBe('gis');
        expect(res.body.payload).toEqual({ q: 'SELECT *' });
        expect(res.body.id).toBeDefined();
        expect(res.body.createdAt).toBeDefined();
        expect(res.body.updatedAt).toBeDefined();
      });
  });

  it('GET /api/dashboards/recent?limit=5 should return ordered dashboards', async () => {
    const agent = request(app.getHttpServer());

    await agent
      .post('/dashboards')
      .send({ kind: 'gis', name: 'First', payload: { a: 1 } })
      .expect(201);

    await agent
      .post('/dashboards')
      .send({ kind: 'explorer', name: 'Second', payload: { b: 2 } })
      .expect(201);

    const res = await agent.get('/dashboards/recent?limit=5').expect(200);
    expect(res.body).toHaveLength(2);
    expect(res.body[0].name).toBe('Second');
    expect(res.body[1].name).toBe('First');
  });

  it('PUT /api/dashboards/:id should update updatedAt', async () => {
    const agent = request(app.getHttpServer());

    const created = await agent
      .post('/dashboards')
      .send({ kind: 'gis', name: 'Before', payload: { a: 1 } })
      .expect(201);

    const id = created.body.id;
    const originalUpdatedAt = created.body.updatedAt;

    await new Promise((r) => setTimeout(r, 10));

    const updated = await agent
      .put(`/dashboards/${id}`)
      .send({ name: 'After' })
      .expect(200);

    expect(updated.body.name).toBe('After');
    expect(updated.body.updatedAt).not.toBe(originalUpdatedAt);
  });

  it('DELETE /api/dashboards/:id should return 204 and next GET should 404', async () => {
    const agent = request(app.getHttpServer());

    const created = await agent
      .post('/dashboards')
      .send({ kind: 'explorer', name: 'ToDelete', payload: { x: 1 } })
      .expect(201);

    const id = created.body.id;

    await agent.delete(`/dashboards/${id}`).expect(204);
    await agent.get(`/dashboards/${id}`).expect(404);
  });

  it('should reject invalid kind', () => {
    return request(app.getHttpServer())
      .post('/dashboards')
      .send({ kind: 'invalid', name: 'test', payload: { a: 1 } })
      .expect(400);
  });

  it('should reject empty name', () => {
    return request(app.getHttpServer())
      .post('/dashboards')
      .send({ kind: 'gis', name: '', payload: { a: 1 } })
      .expect(400);
  });

  it('should reject non-object payload', () => {
    return request(app.getHttpServer())
      .post('/dashboards')
      .send({ kind: 'gis', name: 'test', payload: 'not-an-object' })
      .expect(400);
  });

  it('should reject empty payload object', () => {
    return request(app.getHttpServer())
      .post('/dashboards')
      .send({ kind: 'gis', name: 'test', payload: {} })
      .expect(400);
  });
});
