import { Injectable, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { SPARQL_ENDPOINT } from '../../adapters/sparql-endpoint.interface';
import type { SparqlEndpoint } from '../../adapters/sparql-endpoint.interface';

export interface EntitySearchResult {
  uri: string;
  label: string;
  description?: string;
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
  ): Promise<EntitySearchResult[]> {
    const backend = this.config.get<string>('SPARQL_BACKEND') ?? 'wikidata';
    if (backend === 'wikidata') {
      return this.wikidataSearch(keyword, limit);
    }
    return this.sparqlSearch(keyword, limit);
  }

  private async wikidataSearch(
    keyword: string,
    limit: number,
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

    return (response.data.search ?? []).map((r) => ({
      uri: r.concepturi,
      label: r.label ?? r.concepturi,
      description: r.description,
    }));
  }

  private async sparqlSearch(
    keyword: string,
    limit: number,
  ): Promise<EntitySearchResult[]> {
    const template =
      this.config.get<string>('SPARQL_ENTITY_SEARCH_QUERY') ??
      `PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
SELECT DISTINCT ?uri ?label WHERE {
  ?uri rdfs:label ?label .
  FILTER regex(?label, "$keyword", "i")
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
    }>(
      endpointUrl,
      new URLSearchParams({ query }),
      {
        headers: {
          Accept: 'application/sparql-results+json',
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        auth:
          username && password
            ? { username, password }
            : undefined,
      },
    );

    return response.data.results.bindings.map((b) => ({
      uri: b['uri']?.value ?? '',
      label: b['label']?.value ?? b['uri']?.value ?? '',
    }));
  }
}
