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

  it('busca por la API de Wikidata y mapea los resultados', async () => {
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

  it('cae en la concepturi cuando no hay label', async () => {
    mockSearch([{ concepturi: 'http://www.wikidata.org/entity/Q42' }]);

    const results = await adapter.searchEntities('x', { limit: 5 });

    expect(results[0].label).toBe('http://www.wikidata.org/entity/Q42');
  });

  it('post-filtra por P31 cuando se pide una clase', async () => {
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
            { uri: { type: 'uri', value: 'http://www.wikidata.org/entity/Q5' } },
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

  it('trata owl#Thing como "sin filtro" y no consulta el endpoint', async () => {
    mockSearch([
      { concepturi: 'http://www.wikidata.org/entity/Q5', label: 'human' },
    ]);
    // Sin nock para query.wikidata.org: si intentara filtrar, fallaria la request.
    const results = await adapter.searchEntities('human', {
      limit: 10,
      classUri: OWL_THING,
    });

    expect(results).toHaveLength(1);
  });

  it('si el filtro por clase falla, devuelve todos los candidatos', async () => {
    mockSearch([
      { concepturi: 'http://www.wikidata.org/entity/Q5', label: 'human' },
      { concepturi: 'http://www.wikidata.org/entity/Q515', label: 'city' },
    ]);
    nock('https://query.wikidata.org').post('/sparql').reply(503, 'nope');

    const results = await adapter.searchEntities('human', {
      limit: 10,
      classUri: 'http://www.wikidata.org/entity/Q5',
    });

    // Degradar a una lista mas amplia es mejor que no sugerir nada.
    expect(results).toHaveLength(2);
  });

  it('no interpola candidatos con URIs que cortarian el VALUES', async () => {
    mockSearch([{ concepturi: 'http://example.org/a>b', label: 'roto' }]);

    const results = await adapter.searchEntities('x', {
      limit: 10,
      classUri: 'http://www.wikidata.org/entity/Q5',
    });

    // Ningun candidato pasa la validacion: se devuelven sin filtrar en vez de
    // construir un VALUES invalido.
    expect(results).toHaveLength(1);
  });
});
