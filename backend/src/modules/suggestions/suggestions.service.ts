import { Injectable, Inject, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { SPARQL_ENDPOINT } from '../../adapters/sparql-endpoint.interface';
import type { SparqlEndpoint } from '../../adapters/sparql-endpoint.interface';

export interface EntitySearchResult {
  uri: string;
  label: string;
  description?: string;
}

const URI_PATTERN = /^[a-z][a-z0-9+.-]*:[^\s<>"]*$/i;

function isValidUri(value: string): boolean {
  return URI_PATTERN.test(value);
}

@Injectable()
export class SuggestionsService {
  constructor(
    @Inject(SPARQL_ENDPOINT) private readonly endpoint: SparqlEndpoint,
    private readonly config: ConfigService,
  ) {}

  getPredicates(): Promise<string[]> {
    return this.endpoint.getPredicates();
  }

  async searchEntities(
    keyword: string,
    limit = 20,
    classUri?: string,
  ): Promise<EntitySearchResult[]> {
    const backend = this.config.get<string>('SPARQL_BACKEND') ?? 'wikidata';
    const normalizedClass =
      classUri && isValidUri(classUri) ? classUri : undefined;
    if (classUri && !normalizedClass) {
      throw new BadRequestException({
        error: 'INVALID_CLASS_URI',
        message: 'classUri is not a valid IRI',
      });
    }

    if (backend === 'wikidata') {
      return this.wikidataSearch(keyword, limit, normalizedClass);
    }
    return this.sparqlSearch(keyword, limit, normalizedClass);
  }

  private async wikidataSearch(
    keyword: string,
    limit: number,
    classUri?: string,
  ): Promise<EntitySearchResult[]> {
    const params = new URLSearchParams({
      action: 'wbsearchentities',
      format: 'json',
      language: 'en',
      uselang: 'en',
      type: 'item',
      continue: '0',
      limit: String(limit),
      search: keyword,
      origin: '*',
    });

    const userAgent = this.config.get<string>('SPARQL_USER');
    const response = await axios.get<{
      search?: Array<{
        concepturi: string;
        label?: string;
        description?: string;
      }>;
    }>(`https://www.wikidata.org/w/api.php?${params.toString()}`, {
      headers: userAgent ? { 'User-Agent': userAgent } : undefined,
    });

    const candidates = (response.data.search ?? []).map((r) => ({
      uri: r.concepturi,
      label: r.label ?? r.concepturi,
      description: r.description,
    }));

    if (!classUri || candidates.length === 0) {
      return candidates;
    }

    return this.filterByClass(candidates, classUri);
  }

  private async filterByClass(
    candidates: EntitySearchResult[],
    classUri: string,
  ): Promise<EntitySearchResult[]> {
    const values = candidates
      .map((c) => `<${c.uri}>`)
      .join(' ');
    const query = `SELECT ?uri WHERE {
  VALUES ?uri { ${values} }
  ?uri <http://www.wikidata.org/prop/direct/P31> <${classUri}> .
}`;
    try {
      const endpointUrl = this.config.get<string>('SPARQL_ENDPOINT_URL');
      if (!endpointUrl) return candidates;
      const username = this.config.get<string>('SPARQL_USERNAME');
      const password = this.config.get<string>('SPARQL_PASSWORD');
      const response = await axios.post<{
        results: { bindings: Array<Record<string, { value: string }>> };
      }>(endpointUrl, new URLSearchParams({ query }), {
        headers: {
          Accept: 'application/sparql-results+json',
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        auth: username && password ? { username, password } : undefined,
      });
      const matching = new Set(
        response.data.results.bindings.map((b) => b['uri']?.value).filter(Boolean),
      );
      return candidates.filter((c) => matching.has(c.uri));
    } catch {
      return candidates;
    }
  }

  private async sparqlSearch(
    keyword: string,
    limit: number,
    classUri?: string,
  ): Promise<EntitySearchResult[]> {
    const filterClauses = [`FILTER regex(?label, "$keyword", "i")`];
    if (classUri) {
      filterClauses.unshift(`?uri a <${classUri}>`);
    }
    const template =
      this.config.get<string>('SPARQL_ENTITY_SEARCH_QUERY') ??
      `PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
SELECT DISTINCT ?uri ?label WHERE {
  ?uri rdfs:label ?label .
  ${filterClauses.join(' .\n  ')}
}
LIMIT $limit`;

    const query = template
      .replace(/\$keyword/g, keyword.replace(/"/g, '\\"'))
      .replace(/\$limit/g, String(limit));

    const endpointUrl = this.config.get<string>('SPARQL_ENDPOINT_URL');
    if (!endpointUrl) {
      throw new Error('SPARQL_ENDPOINT_URL not configured');
    }

    const username = this.config.get<string>('SPARQL_USERNAME');
    const password = this.config.get<string>('SPARQL_PASSWORD');

    const response = await axios.post<{
      head: { vars: string[] };
      results: {
        bindings: Array<Record<string, { type: string; value: string }>>;
      };
    }>(endpointUrl, new URLSearchParams({ query }), {
      headers: {
        Accept: 'application/sparql-results+json',
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      auth: username && password ? { username, password } : undefined,
    });

    return response.data.results.bindings.map((b) => ({
      uri: b['uri']?.value ?? '',
      label: b['label']?.value ?? b['uri']?.value ?? '',
    }));
  }
}
