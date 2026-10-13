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
      'describe_resource',
      'explore_connections',
      'find_paths',
      'get_dashboard',
      'graph_overview',
      'list_dashboards',
      'preview_dashboard',
      'profile_space_time',
      'run_select',
      'scope_query',
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
    expect(client.getInstructions()).toContain('carga los lotes a demanda');
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
    expect(out).toMatchObject({
      rowsRetrieved: 5,
      rowsShown: 2,
      truncatedByBackend: true,
      variableTypes: { s: 'uri', label: 'literal' },
    });
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

  it('summarizes classes and properties, degrading per section', async () => {
    deps.api.post
      .mockResolvedValueOnce({
        ...result(0),
        bindings: [
          { class: { type: 'uri', value: 'urn:House' }, instances: { type: 'literal', value: '42' } },
        ],
      })
      .mockRejectedValueOnce(new ExplorerApiError(408, { error: 'TIMEOUT' }));
    const out = JSON.parse(text(await client.callTool({ name: 'graph_overview', arguments: { limit: 5 } })));
    expect(out.classes).toEqual([{ uri: 'urn:House', instances: 42 }]);
    expect(out.properties).toBeUndefined();
    expect(out.failed.properties).toContain('TIMEOUT');
    expect(deps.api.post.mock.calls[0][1].sparql).toContain('LIMIT 5');
  });

  it('describes a resource with its label language from the config', async () => {
    deps.api.get.mockResolvedValue({ ...CONFIG, defaults: { lang: 'es' } });
    deps.api.post.mockResolvedValue({
      ...result(0),
      bindings: [{ p: { type: 'uri', value: 'urn:city' }, o: { type: 'uri', value: 'urn:Rosario' } }],
    });
    const out = JSON.parse(
      text(await client.callTool({ name: 'describe_resource', arguments: { uri: 'urn:listing' } })),
    );
    expect(deps.api.post).toHaveBeenCalledTimes(4);
    expect(deps.api.post.mock.calls[1][1].sparql).toContain('LANGMATCHES(LANG(?l), "es")');
    expect(out.outgoing[0]).toEqual({ predicate: 'urn:city', value: 'urn:Rosario' });
  });

  it('rejects resources that are not absolute IRIs without querying', async () => {
    const res = await client.callTool({ name: 'describe_resource', arguments: { uri: 'x> } DROP ALL' } });
    expect(res.isError).toBe(true);
    expect(deps.api.post).not.toHaveBeenCalled();
  });

  it('previews a dashboard like the GIS runs it, asking the summary for the real total when truncated', async () => {
    deps.api.post.mockImplementation((path: string) =>
      path === '/query/summary'
        ? Promise.resolve({ totalRows: 3589, temporal: [] })
        : Promise.resolve(result(5, true)),
    );
    const out = JSON.parse(
      text(
        await client.callTool({
          name: 'preview_dashboard',
          arguments: { sparql: 'SELECT ?s ?label WHERE { ?s ?p ?label }' },
        }),
      ),
    );
    expect(deps.api.post).toHaveBeenCalledWith('/query/execute', {
      sparql: 'SELECT ?s ?label WHERE { ?s ?p ?label }',
    });
    expect(out.rows).toMatchObject({ retrieved: 5, total: 3589 });
    expect(out.sampleRows).toHaveLength(2);
    expect(out.warnings.join(' ')).toContain('el mapa quedaría vacío');
    expect(out.warnings.join(' ')).toContain('los demás lotes a demanda');
  });

  const spatial = (truncated = false): QueryResult =>
    ({
      ...result(0, truncated),
      variables: ['s', 'wkt', 'date'],
      bindings: [
        {
          s: { type: 'uri', value: 'urn:a' },
          wkt: { type: 'coordinate', value: { lat: -32.92, lng: -60.72 }, raw: 'POINT(-60.72 -32.92)' },
          date: { type: 'date', value: '2024-03-01', raw: '2024-03-01' },
        },
      ],
      nodes: [
        {
          uri: 'urn:a',
          label: 'a',
          attributes: {},
          coordinate: { lat: -32.92, lng: -60.72 },
          temporalEvents: [{ field: 'date', isoDate: '2024-03-01T00:00:00Z' }],
        },
        { uri: 'urn:b', label: 'b', attributes: {}, coordinate: { lat: -32.95, lng: -60.64 } },
      ],
    }) as QueryResult;
  const SPATIAL_QUERY = 'SELECT ?s ?wkt ?date WHERE { ?s <urn:wkt> ?wkt ; <urn:date> ?date }';

  it('profiles where and when the entities concentrate', async () => {
    deps.api.post.mockResolvedValue(spatial());
    const out = JSON.parse(
      text(await client.callTool({ name: 'profile_space_time', arguments: { sparql: SPATIAL_QUERY } })),
    );
    expect(deps.api.post).toHaveBeenCalledWith('/query/execute', { sparql: SPATIAL_QUERY });
    expect(out.space).toMatchObject({ entitiesWithCoordinate: 2, outliers: { count: 0 } });
    expect(out.time).toMatchObject({ entitiesWithDate: 1, granularity: 'day' });
  });

  it('scopes a query, detecting the WKT and date variables when not given', async () => {
    deps.api.post.mockResolvedValue(spatial());
    const out = JSON.parse(
      text(
        await client.callTool({
          name: 'scope_query',
          arguments: {
            sparql: SPATIAL_QUERY,
            area: { center: { lat: -32.925, lng: -60.725 }, radiusKm: 2 },
            period: { from: '2024' },
          },
        }),
      ),
    );
    expect(out.variables).toEqual({ wkt: 'wkt', date: 'date' });
    expect(out.sparql).toContain('FILTER(SUBSTR(STR(?date), 1, 10) >= "2024-01-01")');
    expect(deps.api.post).toHaveBeenCalledWith('/query/execute', { sparql: SPATIAL_QUERY, raw: true });
  });

  it('asks the agent to choose when several variables carry coordinates', async () => {
    deps.api.post.mockResolvedValue({
      ...spatial(),
      variables: ['a', 'b'],
      bindings: [
        {
          a: { type: 'coordinate', value: { lat: 1, lng: 1 }, raw: 'POINT(1 1)' },
          b: { type: 'coordinate', value: { lat: 2, lng: 2 }, raw: 'POINT(2 2)' },
        },
      ],
    });
    const res = await client.callTool({
      name: 'scope_query',
      arguments: {
        sparql: 'SELECT ?a ?b WHERE { ?s <urn:p> ?a ; <urn:q> ?b }',
        area: { bbox: { west: 0, south: 0, east: 3, north: 3 } },
      },
    });
    expect(res.isError).toBe(true);
    expect(text(res)).toContain('?a, ?b');
  });

  it('frames the map on the data and honours the chosen views, window, primary entity and selection', async () => {
    deps.api.post.mockResolvedValue(spatial());
    const out = JSON.parse(
      text(
        await client.callTool({
          name: 'create_gis_dashboard',
          arguments: {
            name: 'Fisherton',
            sparql: SPATIAL_QUERY,
            views: ['map', 'timeline', 'graph'],
            timeline: { from: '2024-01-01', to: '2024-07-01' },
            primaryVariable: 's',
            selectUri: 'urn:a',
          },
        }),
      ),
    );
    const payload = deps.dashboards.create.mock.calls[0][0].payload;
    expect(payload.layout).toEqual({
      slotsCount: 3,
      preset: 'triple',
      slots: [
        { id: 'slot-0', view: 'map' },
        { id: 'slot-1', view: 'timeline' },
        { id: 'slot-2', view: 'graph' },
      ],
    });
    expect(payload.filters.map.center).toEqual([-32.935, -60.68]);
    expect(payload.filters.map.zoom).toBeGreaterThanOrEqual(10);
    expect(payload.filters.timeline).toEqual({
      rangeStart: '2024-01-01T00:00:00.000Z',
      rangeEnd: '2024-07-01T00:00:00.000Z',
    });
    expect(payload.primaryVariable).toBe('s');
    expect(payload.selection).toEqual({ selectedIds: ['urn:a'], pinnedId: 'urn:a' });
    expect(out.views).toEqual(['map', 'timeline', 'graph']);
  });

  it('uses an explicit map view without running the query, and skips framing without a map', async () => {
    await client.callTool({
      name: 'create_gis_dashboard',
      arguments: { name: 'A', sparql: SPATIAL_QUERY, map: { lat: -34.6, lng: -58.4, zoom: 12 } },
    });
    await client.callTool({
      name: 'create_gis_dashboard',
      arguments: { name: 'B', sparql: SPATIAL_QUERY, views: ['table', 'graph'] },
    });
    expect(deps.api.post).not.toHaveBeenCalled();
    expect(deps.dashboards.create.mock.calls[0][0].payload.filters.map).toEqual({
      center: [-34.6, -58.4],
      zoom: 12,
    });
    expect(deps.dashboards.create.mock.calls[1][0].payload.filters.map).toBeUndefined();
  });

  it.each([
    ['an unprojected primary variable', { primaryVariable: 'otro' }, 'no proyecta ?otro'],
    ['an inverted timeline window', { timeline: { from: '2024-07-01', to: '2024-01-01' } }, 'from < to'],
  ])('rejects %s before saving', async (_case, extra, message) => {
    const res = await client.callTool({
      name: 'create_gis_dashboard',
      arguments: { name: 'X', sparql: SPATIAL_QUERY, frameMap: false, ...extra },
    });
    expect(res.isError).toBe(true);
    expect(text(res)).toContain(message);
    expect(deps.dashboards.create).not.toHaveBeenCalled();
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
    expect(prompts.map((p) => p.name)).toEqual(['suggest_dashboards', 'explore_graph']);
    const prompt = await client.getPrompt({ name: 'suggest_dashboards', arguments: { topic: 'precios en Berisso' } });
    const body = (prompt.messages[0].content as { text: string }).text;
    expect(body).toContain('precios en Berisso');
    expect(body).toContain('explore_connections');
    expect(body).toContain('Preguntame cuáles crear');
    expect(body).toContain('preview_dashboard');
  });

  it('offers a prompt to answer questions by walking the graph', async () => {
    const prompt = await client.getPrompt({
      name: 'explore_graph',
      arguments: { question: '¿Qué barrios de Rosario tienen más casas?' },
    });
    const body = (prompt.messages[0].content as { text: string }).text;
    expect(body).toContain('¿Qué barrios de Rosario tienen más casas?');
    expect(body).toContain('describe_resource');
    expect(body).toContain('no lo crees sin que te lo pida');
  });
});
