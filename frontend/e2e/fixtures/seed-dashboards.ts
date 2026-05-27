import type { Page, APIRequestContext } from '@playwright/test';
import fs from 'fs';
import path from 'path';

const API_BASE = 'http://localhost:3000/api';

export interface Dashboard {
  id: string;
  kind: 'gis' | 'explorer';
  name: string;
  payload: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export async function createDashboard(
  request: APIRequestContext,
  input: { kind: 'gis' | 'explorer'; name: string; payload: Record<string, unknown> },
): Promise<Dashboard> {
  const resp = await request.post(`${API_BASE}/dashboards`, {
    data: input,
    headers: { 'Content-Type': 'application/json' },
  });
  if (!resp.ok()) {
    throw new Error(`Failed to create dashboard: ${await resp.text()}`);
  }
  return resp.json();
}

export async function listDashboards(request: APIRequestContext): Promise<Dashboard[]> {
  const resp = await request.get(`${API_BASE}/dashboards/recent`);
  if (!resp.ok()) {
    throw new Error(`Failed to list dashboards: ${await resp.text()}`);
  }
  return resp.json();
}

export async function deleteDashboard(request: APIRequestContext, id: string): Promise<void> {
  const resp = await request.delete(`${API_BASE}/dashboards/${id}`);
  if (!resp.ok() && resp.status() !== 204) {
    throw new Error(`Failed to delete dashboard: ${await resp.text()}`);
  }
}

export async function clearDashboards(request: APIRequestContext): Promise<void> {
  const dashboards = await listDashboards(request);
  await Promise.all(dashboards.map((d) => deleteDashboard(request, d.id)));
}

export function mockSparqlExecute(page: Page, result: unknown): void {
  page.route('http://localhost:3000/query/execute', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(result),
    });
  });
}

export function mockSparqlExecuteFromFixture(page: Page): void {
  const fixture = require('./sample-queries.json');
  mockSparqlExecute(page, fixture.mockResult);
}

export async function waitForRemotes(request: APIRequestContext, timeout = 60000): Promise<void> {
  const start = Date.now();
  const remotes = [
    'http://localhost:4201/remoteEntry.json',
    'http://localhost:4202/remoteEntry.json',
  ];

  for (const url of remotes) {
    while (Date.now() - start < timeout) {
      try {
        const resp = await request.get(url, { timeout: 2000 });
        if (resp.ok()) break;
      } catch {
        // ignore
      }
      await new Promise((r) => setTimeout(r, 500));
    }
  }
}

const GIS_CACHE_DIR = path.resolve(
  '/home/mventurino/Documents/TESIS/programs/RDFGISExplorer/frontend/rdf_gis_explorer/node_modules/.cache/native-federation/rdf_gis_explorer',
);

/**
 * Intercepts GIS chunk requests that the native-federation dev server fails to serve
 * and fulfills them from the local cache directory.
 */
export async function serveGisChunks(page: Page): Promise<void> {
  await page.route('http://localhost:4202/**', async (route, request) => {
    const url = new URL(request.url());
    const fileName = path.basename(url.pathname);
    const filePath = path.join(GIS_CACHE_DIR, fileName);
    if (fs.existsSync(filePath)) {
      const body = fs.readFileSync(filePath);
      const ext = path.extname(fileName);
      const contentType = ext === '.js' ? 'application/javascript' : ext === '.css' ? 'text/css' : 'application/json';
      await route.fulfill({ status: 200, body, contentType });
      return;
    }
    await route.continue();
  });
}
