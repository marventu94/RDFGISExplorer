import nock from 'nock';
import { WikidataAdapter } from './wikidata.adapter';

const OWL_THING = 'http://www.w3.org/2002/07/owl#Thing';

function mockSearch(search: Array<Record<string, string>>): nock.Scope {
  return nock('https://www.wikidata.org')
    .get('/w/api.php')
    .query(true)
    .reply(200, { search });
}

describe('WikidataAdapter.searchEntities', () => {
  let adapter: WikidataAdapter;

  beforeEach(() => {
    adapter = new WikidataAdapter();
    process.env['SPARQL_USER'] = 'test-agent/1.0';
    process.env['SPARQL_ENDPOINT_URL'] = 'https://query.wikidata.org/sparql';
  });

  afterEach(() => {
    nock.cleanAll();
    delete process.env['SPARQL_USER'];
    delete process.env['SPARQL_ENDPOINT_URL'];
  });

  it('searches through the Wikidata API and maps the results', async () => {
    mockSearch([
      {
        concepturi: 'http://www.wikidata.org/entity/Q1486',
        label: 'Buenos Aires',
        description: 'Capital city',
      },
    ]);

    const results = await adapter.searchEntities('buenos aires', { limit: 10 });

    expect(results).toHaveLength(1);
    expect(results[0].uri).toBe('http://www.wikidata.org/entity/Q1486');
    expect(results[0].label).toBe('Buenos Aires');
    expect(results[0].description).toBe('Capital city');
  });

  it('falls back to concepturi when no label exists', async () => {
    mockSearch([{ concepturi: 'http://www.wikidata.org/entity/Q42' }]);

    const results = await adapter.searchEntities('x', { limit: 5 });

    expect(results[0].label).toBe('http://www.wikidata.org/entity/Q42');
  });

  it('post-filters by P31 when a class is requested', async () => {
    mockSearch([
      { concepturi: 'http://www.wikidata.org/entity/Q5', label: 'human' },
      { concepturi: 'http://www.wikidata.org/entity/Q515', label: 'city' },
    ]);

    let sentQuery = '';
    nock('https://query.wikidata.org')
      .post('/sparql', (body: unknown) => {
        sentQuery =
          typeof body === 'string'
            ? (new URLSearchParams(body).get('query') ?? '')
            : ((body as Record<string, string>)['query'] ?? '');
        return true;
      })
      .reply(200, {
        results: {
          bindings: [
            {
              uri: { type: 'uri', value: 'http://www.wikidata.org/entity/Q5' },
            },
          ],
        },
      });

    const results = await adapter.searchEntities('human', {
      limit: 10,
      classUri: 'http://www.wikidata.org/entity/Q5',
    });

    expect(results).toHaveLength(1);
    expect(results[0].uri).toBe('http://www.wikidata.org/entity/Q5');
    expect(sentQuery).toContain('http://www.wikidata.org/prop/direct/P31');
  });

  it('treats owl#Thing as no filter and does not query the endpoint', async () => {
    mockSearch([
      { concepturi: 'http://www.wikidata.org/entity/Q5', label: 'human' },
    ]);
    // No nock for query.wikidata.org: attempting to filter would fail the request.
    const results = await adapter.searchEntities('human', {
      limit: 10,
      classUri: OWL_THING,
    });

    expect(results).toHaveLength(1);
  });

  it('returns all candidates when class filtering fails', async () => {
    mockSearch([
      { concepturi: 'http://www.wikidata.org/entity/Q5', label: 'human' },
      { concepturi: 'http://www.wikidata.org/entity/Q515', label: 'city' },
    ]);
    nock('https://query.wikidata.org').post('/sparql').reply(503, 'nope');

    const results = await adapter.searchEntities('human', {
      limit: 10,
      classUri: 'http://www.wikidata.org/entity/Q5',
    });

    // Falling back to a broader list is better than returning no suggestions.
    expect(results).toHaveLength(2);
  });

  it('does not interpolate candidates whose URIs would terminate VALUES', async () => {
    mockSearch([{ concepturi: 'http://example.org/a>b', label: 'roto' }]);

    const results = await adapter.searchEntities('x', {
      limit: 10,
      classUri: 'http://www.wikidata.org/entity/Q5',
    });

    // No candidate passes validation: return them unfiltered instead of
    // building an invalid VALUES clause.
    expect(results).toHaveLength(1);
  });
});

describe('Wikidata catalogue preview', () => {
  let adapter: WikidataAdapter;
  beforeEach(() => {
    adapter = new WikidataAdapter();
  });
  afterEach(() => {
    nock.cleanAll();
  });
  const options = { sampleSize: 1000, limit: 50, offset: 0, timeoutMs: 8000 };
  it('browses a configurable bounded statement sample and resolves labels only for its page', async () => {
    const execute = jest.spyOn(adapter, 'execute').mockResolvedValue({
      variables: ['uri'],
      bindings: [
        { uri: { type: 'uri', value: 'http://www.wikidata.org/entity/Q1' } },
        { uri: { type: 'uri', value: 'http://www.wikidata.org/entity/Q1' } },
        { uri: { type: 'uri', value: 'http://www.wikidata.org/entity/Q2' } },
        { uri: { type: 'uri', value: 'http://www.wikidata.org/entity/Q3' } },
      ],
      nodes: [],
      edges: [],
      meta: {
        durationMs: 1,
        limitApplied: 123,
        truncated: true,
        backend: 'wikidata',
      },
    });
    const metadata = nock('https://www.wikidata.org')
      .get('/w/api.php')
      .query((q) => q['props'] === 'labels' && q['ids'] === 'Q1|Q2')
      .reply(200, {
        entities: { Q1: { labels: { en: { value: 'Class one' } } }, Q2: {} },
      });
    const catalog = await adapter.searchCatalog('class', '', {
      ...options,
      sampleSize: 123,
      limit: 2,
    });
    expect(catalog.items.map((item) => item.label)).toEqual([
      'Class one',
      'Q2',
    ]);
    expect(catalog.nextOffset).toBe(2);
    expect(catalog.sampled).toBe(true);
    expect(execute).toHaveBeenCalledWith(
      expect.stringContaining('LIMIT 123'),
      expect.objectContaining({ raw: true, limit: 123, maxRetries: 0 }),
    );
    expect(execute.mock.calls[0][0]).not.toMatch(/DISTINCT|ORDER BY|GROUP BY/);
    expect(metadata.isDone()).toBe(true);
  });
  it('keeps classes identified by P279, preserves API ranking, and never queries WDQS', async () => {
    const search = nock('https://www.wikidata.org')
      .get('/w/api.php')
      .query(
        (q) =>
          q['action'] === 'wbsearchentities' &&
          q['search'] === 'house' &&
          q['type'] === 'item' &&
          q['limit'] === '50',
      )
      .reply(200, {
        search: [
          { id: 'Q3947', label: 'house' },
          { id: 'Q23558', label: 'House M.D.' },
          { id: 'Q1', label: 'unknown subclass' },
        ],
        'search-continue': 50,
      });
    const metadata = nock('https://www.wikidata.org')
      .get('/w/api.php')
      .query(
        (q) =>
          q['action'] === 'wbgetentities' && q['ids'] === 'Q3947|Q23558|Q1',
      )
      .reply(200, {
        entities: {
          Q3947: { claims: { P279: [{ mainsnak: { snaktype: 'value' } }] } },
          Q23558: { claims: { P31: [] } },
          Q1: { claims: { P279: [{ mainsnak: { snaktype: 'novalue' } }] } },
        },
      });
    const execute = jest.spyOn(adapter, 'execute');
    const catalog = await adapter.searchCatalog('class', 'house', options);
    expect(catalog.items).toEqual([
      {
        uri: 'http://www.wikidata.org/entity/Q3947',
        label: 'house',
        kind: 'class',
        evidence: ['declared'],
      },
    ]);
    expect(catalog).toMatchObject({
      sampled: true,
      truncated: true,
      nextOffset: 50,
    });
    expect(search.isDone() && metadata.isDone()).toBe(true);
    expect(execute).not.toHaveBeenCalled();
  });
  it('searches properties, maps their direct predicates and honors the configured API page size and continuation', async () => {
    const request = nock('https://www.wikidata.org')
      .get('/w/api.php')
      .query(
        (q) =>
          q['type'] === 'property' &&
          q['limit'] === '10' &&
          q['continue'] === '20',
      )
      .reply(200, { search: [{ id: 'P31', label: 'instance of' }] });
    const catalog = await adapter.searchCatalog('property', 'instance', {
      ...options,
      limit: 10,
      offset: 20,
    });
    expect(catalog.items[0].uri).toBe(
      'http://www.wikidata.org/prop/direct/P31',
    );
    expect(catalog.nextOffset).toBeUndefined();
    expect(request.isDone()).toBe(true);
  });
  it('caps Wikidata API pages at 50 and rejects malformed candidate IDs', async () => {
    const request = nock('https://www.wikidata.org')
      .get('/w/api.php')
      .query((q) => q['limit'] === '50')
      .reply(200, { search: [{ id: 'Q42|Q5' }, { id: 'P31' }] });
    expect(
      (await adapter.searchCatalog('class', 'x', { ...options, limit: 200 }))
        .items,
    ).toEqual([]);
    expect(request.isDone()).toBe(true);
  });
  it('surfaces MediaWiki errors rather than returning false empty success', async () => {
    nock('https://www.wikidata.org')
      .get('/w/api.php')
      .query(true)
      .reply(200, { error: { info: 'Rate limited' } });
    await expect(
      adapter.searchCatalog('class', 'house', options),
    ).rejects.toThrow('Rate limited');
  });
});
