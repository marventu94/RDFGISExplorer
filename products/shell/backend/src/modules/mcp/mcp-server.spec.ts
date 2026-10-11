import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import type { Dashboard, QueryResult } from '@rdfgis/contracts';
import { ExplorerApiError } from './explorer-api.client';
import { createMcpServer, type McpServerDeps } from './mcp-server';

const CONFIG = {
  backend: 'graphdb',
  endpointUrl: 'http://graphdb/repositories/ovs',
  maxLimit: 1000,
  timeoutMs: 300000,
  labelUri: 'http://www.w3.org/2000/01/rdf-schema#label',
  defaultPrefixes: { rdfs: 'http://www.w3.org/2000/01/rdf-schema#' },
};

function result(rows: number, truncated = false): QueryResult {
  return {
    variables: ['s', 'label'],
    bindings: Array.from({ length: rows }, (_, i) => ({
      s: { type: 'uri', value: `urn:s${i}` },
      label: { type: 'literal', value: `S${i}`, lang: 'es' },
    })),
    nodes: [],
    edges: [],
    meta: { durationMs: 12, truncated, limitApplied: 1000, backend: 'graphdb' },
  } as unknown as QueryResult;
}

function dashboard(overrides: Partial<Dashboard> = {}): Dashboard {
  return {
    id: 'd1',
    kind: 'gis',
    name: 'Casas',
    payload: { query: 'SELECT * WHERE { ?s ?p ?o }' },
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-02T00:00:00.000Z',
    ...overrides,
  };
}

describe('createMcpServer', () => {
  let deps: McpServerDeps & {
    api: { get: jest.Mock; post: jest.Mock };
    dashboards: { findAll: jest.Mock; findOne: jest.Mock; create: jest.Mock };
  };
  let client: Client;

  beforeEach(async () => {
    deps = {
      api: { get: jest.fn().mockResolvedValue(CONFIG), post: jest.fn() },
      dashboards: {
        findAll: jest.fn().mockReturnValue([dashboard(), dashboard({ id: 'e1', kind: 'explorer', name: 'Workspace' })]),
        findOne: jest.fn().mockReturnValue(dashboard()),
        create: jest.fn().mockImplementation((dto) => dashboard({ id: 'new-1', name: dto.name, payload: dto.payload })),
      },
      appUrl: 'https://rdfgis.vpn',
      maxRows: 2,
    };
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await createMcpServer(deps).connect(serverTransport);
    client = new Client({ name: 'test', version: '1.0.0' });
    await client.connect(clientTransport);
  });

  afterEach(() => client.close());

  function text(res: Awaited<ReturnType<Client['callTool']>>): string {
    return (res.content as Array<{ text: string }>)[0].text;
  }

  it('exposes read tools, one creation tool and no destructive tools', async () => {
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual([
      'create_gis_dashboard',
      'describe_endpoint',
      'explore_connections',
      'find_paths',
      'get_dashboard',
      'list_dashboards',
      'run_select',
      'search_catalog',
    ]);
    for (const tool of tools.filter((t) => t.name !== 'create_gis_dashboard')) {
      expect(tool.annotations?.readOnlyHint).toBe(true);
    }
    expect(tools.find((t) => t.name === 'create_gis_dashboard')?.annotations?.destructiveHint).toBe(false);
  });

  it('gives the agent instructions about GIS-ready queries', () => {
    expect(client.getInstructions()).toContain('geo:asWKT');
    expect(client.getInstructions()).toContain('solo lectura');
  });

  it('describes the endpoint from the explorer config', async () => {
    const out = JSON.parse(text(await client.callTool({ name: 'describe_endpoint', arguments: {} })));
    expect(deps.api.get).toHaveBeenCalledWith('/config');
    expect(out).toMatchObject({ backend: 'graphdb', maxRowsPerQuery: 1000 });
    expect(out).not.toHaveProperty('endpointUrl');
  });

  it('forwards catalog searches to discovery', async () => {
    await client.callTool({ name: 'search_catalog', arguments: { kind: 'property', text: 'precio' } });
    expect(deps.api.get).toHaveBeenCalledWith('/discovery/catalog', {
      kind: 'property',
      q: 'precio',
      offset: undefined,
    });
  });

  it('requires exactly one focus for explore_connections', async () => {
    const res = await client.callTool({
      name: 'explore_connections',
      arguments: { classUri: 'urn:A', uri: 'urn:b' },
    });
    expect(res.isError).toBe(true);
    expect(deps.api.post).not.toHaveBeenCalled();

    deps.api.post.mockResolvedValue({ connections: [] });
    await client.callTool({ name: 'explore_connections', arguments: { classUri: 'urn:A', direction: 'out' } });
    expect(deps.api.post).toHaveBeenCalledWith('/discovery/connections', { classUri: 'urn:A', direction: 'out' });
  });

  it('runs SELECT queries and caps the rows returned to the agent', async () => {
    deps.api.post.mockResolvedValue(result(5, true));
    const out = JSON.parse(
      text(await client.callTool({ name: 'run_select', arguments: { sparql: 'SELECT ?s WHERE { ?s ?p ?o }' } })),
    );
    expect(deps.api.post).toHaveBeenCalledWith('/query/execute', {
      sparql: 'SELECT ?s WHERE { ?s ?p ?o }',
      raw: true,
    });
    expect(out).toMatchObject({ rowsRetrieved: 5, rowsShown: 2, truncatedByBackend: true });
    expect(out.rows).toEqual([
      { s: 'urn:s0', label: 'S0@es' },
      { s: 'urn:s1', label: 'S1@es' },
    ]);
  });

  it.each([
    ['an update', 'INSERT DATA { <urn:a> <urn:b> <urn:c> }'],
    ['a CONSTRUCT', 'CONSTRUCT { ?s ?p ?o } WHERE { ?s ?p ?o }'],
    ['invalid SPARQL', 'NOT SPARQL'],
  ])('rejects %s without calling the backend', async (_case, sparql) => {
    const res = await client.callTool({ name: 'run_select', arguments: { sparql } });
    expect(res.isError).toBe(true);
    expect(deps.api.post).not.toHaveBeenCalled();
  });

  it('reports backend errors to the agent instead of failing the call', async () => {
    deps.api.post.mockRejectedValue(new ExplorerApiError(408, { error: 'TIMEOUT' }));
    const res = await client.callTool({ name: 'run_select', arguments: { sparql: 'SELECT ?s WHERE { ?s ?p ?o }' } });
    expect(res.isError).toBe(true);
    expect(text(res)).toContain('TIMEOUT');
  });

  it('lists dashboards with links and filters by kind', async () => {
    const out = JSON.parse(text(await client.callTool({ name: 'list_dashboards', arguments: { kind: 'gis' } })));
    expect(out).toEqual([
      expect.objectContaining({ id: 'd1', url: 'https://rdfgis.vpn/dashboards/d1' }),
    ]);
  });

  it('creates a four-view GIS dashboard with the configured backend and returns its link', async () => {
    const sparql = 'SELECT ?s ?wkt WHERE { ?s <http://www.opengis.net/ont/geosparql#asWKT> ?wkt }';
    const out = JSON.parse(
      text(await client.callTool({ name: 'create_gis_dashboard', arguments: { name: 'Casas', sparql } })),
    );
    expect(deps.dashboards.create).toHaveBeenCalledWith({
      kind: 'gis',
      name: 'Casas',
      payload: expect.objectContaining({
        query: sparql,
        backend: 'graphdb',
        layout: expect.objectContaining({ slotsCount: 4, preset: 'quad' }),
      }),
    });
    expect(out).toMatchObject({ id: 'new-1', url: 'https://rdfgis.vpn/dashboards/new-1' });
  });

  it('offers a prompt that walks the graph and asks before creating dashboards', async () => {
    const { prompts } = await client.listPrompts();
    expect(prompts.map((p) => p.name)).toEqual(['suggest_dashboards']);
    const prompt = await client.getPrompt({ name: 'suggest_dashboards', arguments: { topic: 'precios en Berisso' } });
    const body = (prompt.messages[0].content as { text: string }).text;
    expect(body).toContain('precios en Berisso');
    expect(body).toContain('explore_connections');
    expect(body).toContain('Preguntame cuáles crear');
  });
});
