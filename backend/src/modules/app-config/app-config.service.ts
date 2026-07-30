import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import { DEFAULT_USER_AGENT } from '../../adapters/generic-sparql.adapter';
import type {
  AppConfigDto,
  SearchClassDto,
  SettingsDefaultsDto,
} from './dto/app-config.dto';
import type { LimitsConfig } from '@rdfgis/contracts';

@Injectable()
export class AppConfigService {
  constructor(private readonly config: ConfigService) {}

  getConfig(): AppConfigDto {
    return {
      ...this.buildRuntimeConfig(),
      classColors: this.getClassColors(),
      defaults: this.getSettingsDefaults(),
    };
  }

  getSettingsDefaults(): SettingsDefaultsDto {
    const cfg = this.buildRuntimeConfig();
    return {
      lang: 'en',
      resultLimit: cfg.defaultLimit,
      labelUri: cfg.labelUri,
      searchClass: this.defaultSearchClassFor(cfg),
      endpointType: 'other',
    };
  }

  /** Entero positivo desde env, con fallback al default actual. */
  private intFromEnv(key: string, fallback: number): number {
    const parsed = parseInt(this.config.get<string>(key) ?? '', 10);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
  }

  /** Lista CSV de enteros positivos desde env (p.ej. "100,300,500"). */
  private csvIntsFromEnv(key: string, fallback: number[]): number[] {
    const raw = this.config.get<string>(key);
    if (!raw) return fallback;
    const parsed = raw
      .split(',')
      .map((s) => parseInt(s.trim(), 10))
      .filter((n) => Number.isInteger(n) && n > 0);
    return parsed.length > 0 ? parsed : fallback;
  }

  /**
   * Límites de queries y visualización unificados: los frontends los consumen
   * vía /api/config (con defaults equivalentes hasta que la config llega).
   */
  private buildLimits(): LimitsConfig {
    return {
      graphMaxNodes: this.intFromEnv('GIS_GRAPH_MAX_NODES', 300),
      lotDefaultSize: this.intFromEnv('GIS_LOT_DEFAULT_SIZE', 300),
      lotSizeOptions: this.csvIntsFromEnv(
        'GIS_LOT_SIZE_OPTIONS',
        [100, 300, 500],
      ),
      tablePageSizeOptions: this.csvIntsFromEnv(
        'GIS_TABLE_PAGE_SIZE_OPTIONS',
        [50, 100, 200],
      ),
      exportMaxRows: this.intFromEnv('EXPORT_MAX_ROWS', 50_000),
      exportMinPageSize: this.intFromEnv('EXPORT_MIN_PAGE_SIZE', 250),
      summaryTopCategorical: this.intFromEnv(
        'SUMMARY_TOP_CATEGORICAL_LIMIT',
        12,
      ),
    };
  }

  private buildRuntimeConfig(): Omit<AppConfigDto, 'defaults' | 'classColors'> {
    const backend = this.config.get<string>('SPARQL_BACKEND') ?? 'wikidata';
    const endpointUrl =
      this.config.get<string>('SPARQL_ENDPOINT_URL') ??
      'https://query.wikidata.org/sparql';
    const userAgent =
      this.config.get<string>('SPARQL_USER') ?? DEFAULT_USER_AGENT;
    const username = this.config.get<string>('SPARQL_USERNAME');
    const password = this.config.get<string>('SPARQL_PASSWORD');

    const isWikidata = backend === 'wikidata';
    const defaultLimit = parseInt(
      this.config.get<string>('SPARQL_DEFAULT_LIMIT') ?? '500',
      10,
    );
    const maxLimit = parseInt(
      this.config.get<string>('SPARQL_MAX_LIMIT') ?? '2000',
      10,
    );
    const labelUri = 'http://www.w3.org/2000/01/rdf-schema#label';

    return {
      backend,
      endpointUrl,
      hasBasicAuth: Boolean(username && password),
      userAgent,
      timeoutMs: parseInt(
        this.config.get<string>('SPARQL_TIMEOUT_MS') ?? '30000',
        10,
      ),
      defaultLimit,
      maxLimit,
      capabilities: [
        'sparql11',
        'queryExecute',
        'predicateSuggestions',
        'entitySearch',
      ],
      supportsWikibaseLabel: isWikidata,
      defaultPrefixes: this.buildPrefixes(),
      search: isWikidata
        ? {
            mode: 'wikidata-api',
            endpoint: 'https://www.wikidata.org/w/api.php',
            labelProperty: labelUri,
          }
        : {
            mode: 'sparql',
            labelProperty: labelUri,
          },
      labelUri,
      limits: this.buildLimits(),
      describe: isWikidata
        ? {
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
          }
        : {
            exclude: [],
            objects: ['http://www.w3.org/1999/02/22-rdf-syntax-ns#type'],
            datatype: [],
            text: ['http://www.w3.org/2000/01/rdf-schema#comment'],
            image: [],
            external: [],
          },
    };
  }

  private defaultSearchClassFor(
    cfg: Omit<AppConfigDto, 'defaults' | 'classColors'>,
  ): SearchClassDto {
    if (cfg.backend === 'wikidata') {
      return {
        uri: { type: 'uri', value: 'http://www.wikidata.org/entity/Q5' },
        label: { type: 'literal', value: 'human', 'xml:lang': 'en' },
      };
    }
    return {
      uri: { type: 'uri', value: 'http://www.w3.org/2002/07/owl#Thing' },
      label: { type: 'literal', value: 'thing', 'xml:lang': 'en' },
    };
  }

  private getClassColors(): Record<string, string> {
    const backend = this.config.get<string>('SPARQL_BACKEND') ?? 'wikidata';
    if (backend === 'wikidata') {
      return {
        'http://www.wikidata.org/entity/Q515': '#2196F3',
        'http://www.wikidata.org/entity/Q5': '#9C27B0',
        'http://www.wikidata.org/entity/Q4022': '#03A9F4',
        'http://www.wikidata.org/entity/Q33506': '#FF9800',
        'http://www.wikidata.org/entity/Q3918': '#4CAF50',
        'http://www.wikidata.org/entity/Q207313': '#E91E63',
      };
    }
    return {};
  }

  private buildPrefixes(): Record<string, string> {
    const backend = this.config.get<string>('SPARQL_BACKEND') ?? 'wikidata';
    const customPath = this.config.get<string>('SPARQL_PREFIXES_PATH');
    const defaultPath = resolve(
      process.cwd(),
      'config',
      `prefixes.${backend}.json`,
    );
    const filePath = customPath
      ? resolve(process.cwd(), customPath)
      : defaultPath;

    if (existsSync(filePath)) {
      try {
        const prefixes = JSON.parse(readFileSync(filePath, 'utf-8')) as Record<
          string,
          string
        >;
        const count = Object.keys(prefixes).length;
        console.log(
          `Loaded ${count} prefixes from ${filePath}: ${Object.keys(prefixes).join(', ')}`,
        );
        return prefixes;
      } catch {
        console.warn(`Failed to parse ${filePath}`);
      }
    }
    console.warn(`Prefixes file not found: ${filePath}`);
    return {};
  }
}
