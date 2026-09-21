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
