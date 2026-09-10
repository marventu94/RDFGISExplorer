import axios from 'axios';

import { GenericSparqlAdapter } from './generic-sparql.adapter';
import type {
  EndpointDescriptor,
  EntitySearchOptions,
  EntitySearchResult,
} from './sparql-endpoint.interface';
import { isValidUri } from './sparql-text';

/**
 * Wikidata habla SPARQL como cualquier otro endpoint (de eso se encarga
 * `GenericSparqlAdapter`), pero para buscar entidades por texto tiene su propia
 * API (`wbsearchentities`), que devuelve mejores resultados que un `regex` sobre
 * los labels. Todo lo especifico de Wikidata vive aca: el resto del backend no
 * sabe que este backend existe.
 */
export class WikidataAdapter extends GenericSparqlAdapter {
  constructor() {
    super('wikidata');
  }

  /** Clase raiz de OWL: ningun item de Wikidata la usa como valor de P31. */
  private static readonly OWL_THING = 'http://www.w3.org/2002/07/owl#Thing';

  /** Propiedad "instancia de": con esto se filtra por clase en Wikidata. */
  private static readonly P31 = 'http://www.wikidata.org/prop/direct/P31';

  override describeEndpoint(): EndpointDescriptor {
    return {
      supportsWikibaseLabel: true,
      search: {
        mode: 'wikidata-api',
        endpoint: 'https://www.wikidata.org/w/api.php',
      },
      describe: {
        // Propiedades ruidosas que no aportan al panel de descripcion.
        exclude: [
          'http://www.wikidata.org/prop/direct/P443',
          'http://www.wikidata.org/prop/direct/P109',
        ],
        objects: ['http://www.wikidata.org/prop/direct/P31'],
        datatype: [],
        text: ['http://dbpedia.org/ontology/abstract'],
        image: [
          'http://www.wikidata.org/prop/direct/P18',
          'http://www.wikidata.org/prop/direct/P154',
          'http://www.wikidata.org/prop/direct/P41',
          'http://www.wikidata.org/prop/direct/P94',
          'http://www.wikidata.org/prop/direct/P158',
          'http://www.wikidata.org/prop/direct/P242',
          'http://www.wikidata.org/prop/direct/P948',
        ],
        external: [
          'http://www.wikidata.org/prop/direct/P2035',
          'http://www.wikidata.org/prop/direct/P2888',
          'http://www.wikidata.org/prop/direct/P973',
          'http://www.wikidata.org/prop/direct/P856',
          'http://www.wikidata.org/prop/direct/P3264',
          'http://www.wikidata.org/prop/direct/P1896',
          'http://www.wikidata.org/prop/direct/P1581',
        ],
      },
      defaultSearchClass: {
        uri: { type: 'uri', value: 'http://www.wikidata.org/entity/Q5' },
        label: { type: 'literal', value: 'human', 'xml:lang': 'en' },
      },
    };
  }

  override async searchEntities(
    keyword: string,
    opts: EntitySearchOptions,
  ): Promise<EntitySearchResult[]> {
    const params = new URLSearchParams({
      action: 'wbsearchentities',
      format: 'json',
      language: 'en',
      uselang: 'en',
      type: 'item',
      continue: '0',
      limit: String(opts.limit),
      search: keyword,
      origin: '*',
    });

    const response = await axios.get<{
      search?: Array<{
        concepturi: string;
        label?: string;
        description?: string;
      }>;
    }>(`https://www.wikidata.org/w/api.php?${params.toString()}`, {
      headers: { 'User-Agent': this.resolveUserAgent() },
    });

    const candidates = (response.data.search ?? []).map((r) => ({
      uri: r.concepturi,
      label: r.label ?? r.concepturi,
      description: r.description,
    }));

    if (!opts.classUri || candidates.length === 0) {
      return candidates;
    }

    // owl#Thing es la raiz generica de OWL: ningun item la usa como valor de
    // P31, asi que el filtro devolveria 0 siempre. Se trata como "sin filtro".
    if (opts.classUri === WikidataAdapter.OWL_THING) {
      return candidates;
    }

    return this.filterByClass(candidates, opts.classUri);
  }

  /**
   * La API de busqueda no filtra por clase, asi que se hace en un segundo paso
   * con una query SPARQL. Si esa query falla, se devuelven todos los candidatos:
   * es preferible una lista mas amplia que ninguna sugerencia.
   */
  private async filterByClass(
    candidates: EntitySearchResult[],
    classUri: string,
  ): Promise<EntitySearchResult[]> {
    // Las URIs vienen de la respuesta del upstream: no interpolarlas en el
    // query sin validarlas (una URI con espacios o `>` corta el VALUES).
    const safeCandidates = candidates.filter((c) => isValidUri(c.uri));
    if (safeCandidates.length === 0) return candidates;

    const values = safeCandidates.map((c) => `<${c.uri}>`).join(' ');
    const query = `SELECT ?uri WHERE {
  VALUES ?uri { ${values} }
  ?uri <${WikidataAdapter.P31}> <${classUri}> .
}`;

    try {
      const response = await axios.post<{
        results: { bindings: Array<Record<string, { value: string }>> };
      }>(this.resolveEndpointUrl(), new URLSearchParams({ query }), {
        headers: {
          Accept: 'application/sparql-results+json',
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        auth: this.resolveAuth(),
      });

      const matching = new Set(
        response.data.results.bindings
          .map((b) => b['uri']?.value)
          .filter(Boolean),
      );
      return candidates.filter((c) => matching.has(c.uri));
    } catch {
      return candidates;
    }
  }
}
