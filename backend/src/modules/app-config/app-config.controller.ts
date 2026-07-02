import { Controller, Get } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface AppConfigDto {
  backend: string;
  endpointUrl: string;
  hasBasicAuth: boolean;
  userAgent: string;
  timeoutMs: number;
  defaultLimit: number;
  maxLimit: number;
  capabilities: string[];
  supportsWikibaseLabel: boolean;
  defaultPrefixes: Record<string, string>;
  search: {
    mode: 'wikidata-api' | 'sparql';
    endpoint?: string;
    labelProperty: string;
  };
}

@Controller('config')
export class AppConfigController {
  constructor(private readonly config: ConfigService) {}

  @Get()
  getConfig(): AppConfigDto {
    const backend = this.config.get<string>('SPARQL_BACKEND') ?? 'wikidata';
    const endpointUrl =
      this.config.get<string>('SPARQL_ENDPOINT_URL') ??
      'https://query.wikidata.org/sparql';
    const userAgent =
      this.config.get<string>('SPARQL_USER') ?? 'rdf-gis-explorer/0.1';
    const username = this.config.get<string>('SPARQL_USERNAME');
    const password = this.config.get<string>('SPARQL_PASSWORD');

    const isWikidata = backend === 'wikidata';

    return {
      backend,
      endpointUrl,
      hasBasicAuth: Boolean(username && password),
      userAgent,
      timeoutMs: parseInt(this.config.get<string>('SPARQL_TIMEOUT_MS') ?? '30000', 10),
      defaultLimit: parseInt(
        this.config.get<string>('SPARQL_DEFAULT_LIMIT') ?? '500',
        10,
      ),
      maxLimit: parseInt(
        this.config.get<string>('SPARQL_MAX_LIMIT') ?? '2000',
        10,
      ),
      capabilities: ['sparql11', 'queryExecute', 'predicateSuggestions', 'entitySearch'],
      supportsWikibaseLabel: isWikidata,
      defaultPrefixes: isWikidata
        ? {
            rdf: 'http://www.w3.org/1999/02/22-rdf-syntax-ns#',
            rdfs: 'http://www.w3.org/2000/01/rdf-schema#',
            wd: 'http://www.wikidata.org/entity/',
            wdt: 'http://www.wikidata.org/prop/direct/',
            wikibase: 'http://wikiba.se/ontology#',
            bd: 'http://www.bigdata.com/rdf#',
          }
        : {
            rdf: 'http://www.w3.org/1999/02/22-rdf-syntax-ns#',
            rdfs: 'http://www.w3.org/2000/01/rdf-schema#',
          },
      search: isWikidata
        ? {
            mode: 'wikidata-api',
            endpoint: 'https://www.wikidata.org/w/api.php',
            labelProperty: 'http://www.w3.org/2000/01/rdf-schema#label',
          }
        : {
            mode: 'sparql',
            labelProperty: 'http://www.w3.org/2000/01/rdf-schema#label',
          },
    };
  }
}
