import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
  DiscoveryCatalog,
  DiscoveryConnection,
  DiscoveryConnections,
  DiscoveryFocus,
  DiscoveryKind,
  DiscoveryPaths,
  DiscoveryStep,
  ResultBinding,
} from '@rdfgis/contracts';
import {
  SPARQL_ENDPOINT,
  type SparqlEndpoint,
} from '../../adapters/sparql-endpoint.interface';
import {
  catalogQuery,
  connectionsQuery,
  focusPattern,
  focusSample,
  iri,
  RDF_TYPE,
} from './discovery-query';

function value(row: ResultBinding, key: string): string {
  const cell = row[key];
  return cell?.type === 'coordinate' ? cell.raw : (cell?.value ?? '');
}
function local(uri: string): string {
  return uri.split(/[/#]/).pop() || uri;
}

@Injectable()
export class DiscoveryService {
  private readonly cache = new Map<
    string,
    { expires: number; data: unknown }
  >();
  constructor(
    @Inject(SPARQL_ENDPOINT) private readonly endpoint: SparqlEndpoint,
    private readonly config: ConfigService,
  ) {}

  private setting(name: string, fallback: number): number {
    const n = Number(this.config.get<string>(name));
    return Number.isInteger(n) && n > 0 ? n : fallback;
  }
  private get sample(): number {
    return this.setting('DISCOVERY_SAMPLE_SIZE', 200);
  }
  private get rows(): number {
    return this.setting('DISCOVERY_RESULT_LIMIT', 60);
  }
  private async run(
    query: string,
    limit: number,
    timeout?: number,
  ): Promise<ResultBinding[]> {
    const result = await this.endpoint.execute(query, {
      raw: true,
      limit,
      timeoutMs: Math.min(
        timeout ?? Infinity,
        this.setting('DISCOVERY_TIMEOUT_MS', 8000),
      ),
    });
    return result.bindings;
  }
  private async cached<T>(
    key: string,
    fn: () => Promise<T>,
    cacheable: (data: T) => boolean = () => true,
  ): Promise<T> {
    const entry = this.cache.get(key);
    if (entry && entry.expires > Date.now()) return entry.data as T;
    const data = await fn();
    if (!cacheable(data)) return data;
    if (this.cache.size >= 100)
      this.cache.delete(this.cache.keys().next().value!);
    this.cache.set(key, {
      data,
      expires: Date.now() + this.setting('DISCOVERY_CACHE_TTL_MS', 60000),
    });
    return data;
  }
  catalog(
    kind: DiscoveryKind,
    q: string,
    offset = 0,
  ): Promise<DiscoveryCatalog> {
    return this.cached(`catalog:${kind}:${q}:${offset}`, async () => {
      // Preserve Wikidata's dedicated entity search for examples; structural search remains SPARQL.
      if (
        kind === 'resource' &&
        q &&
        this.endpoint.describeEndpoint?.().search.mode === 'wikidata-api'
      ) {
        const entities = await this.endpoint.searchEntities(q, {
          limit: this.rows,
        });
        return {
          items: entities.map((e) => ({
            uri: e.uri,
            label: e.label,
            kind,
            evidence: ['observed'] as const,
          })),
          truncated: false,
        };
      }
      const rows = await this.run(
        catalogQuery(kind, q, this.rows + 1) + ` OFFSET ${offset}`,
        this.rows + 1,
      );
      const terms = new Map<string, DiscoveryCatalog['items'][number]>();
      for (const row of rows.slice(0, this.rows)) {
        const uri = value(row, 'uri');
        if (!uri) continue;
        const item = terms.get(uri) ?? {
          uri,
          label: value(row, 'label') || local(uri),
          kind,
          evidence: [],
        };
        const evidence =
          value(row, 'evidence') === 'declared' ? 'declared' : 'observed';
        if (!item.evidence.includes(evidence)) item.evidence.push(evidence);
        terms.set(uri, item);
      }
      return {
        items: [...terms.values()],
        truncated: rows.length > this.rows,
        nextOffset: rows.length > this.rows ? offset + this.rows : undefined,
      };
    });
  }
  connections(focus: DiscoveryFocus): Promise<DiscoveryConnections> {
    focusPattern(focus);
    return this.cached(
      `connections:${JSON.stringify(focus)}`,
      () => this.inspect(focus),
      (data) => data.failedDirections.length === 0,
    );
  }
  private async inspect(
    focus: DiscoveryFocus,
    timeout?: number,
  ): Promise<DiscoveryConnections> {
    const result: DiscoveryConnections = {
      connections: [],
      sampledEntities: 0,
      sampleLimit: this.sample,
      sampled: false,
      truncated: false,
      failedDirections: [],
    };
    // One aggregate over a capped distinct sample: rows are not entity counts.
    const countRows = await this.run(
      `SELECT (COUNT(*) AS ?total) WHERE { ${focusSample(focus, this.sample + 1)} }`,
      1,
      timeout,
    );
    const total = Number(value(countRows[0] ?? {}, 'total'));
    result.sampled = total > this.sample;
    result.sampledEntities = Math.min(total, this.sample);
    if (!total) return result;
    await Promise.all(
      (['out', 'in'] as const).map(async (direction) => {
        try {
          const rows = await this.run(
            connectionsQuery(focus, direction, this.sample, this.rows + 1),
            this.rows + 1,
            timeout,
          );
          result.truncated ||= rows.length > this.rows;
          for (const row of rows.slice(0, this.rows)) {
            const predicate = value(row, 'predicate');
            const targetClass = value(row, 'targetClass') || undefined;
            const datatype = value(row, 'datatype');
            const connection: DiscoveryConnection = {
              predicate,
              direction,
              targetClass,
              kind: value(row, 'kind') === 'literal' ? 'literal' : 'resource',
              datatype:
                datatype && datatype !== 'urn:rdfgis:no-datatype'
                  ? datatype
                  : undefined,
              label: local(predicate),
              targetLabel: targetClass ? local(targetClass) : undefined,
              entityCount: Number(value(row, 'entities')),
              examples: [],
            };
            const exampleKind = value(row, 'exampleKindValue');
            if (
              exampleKind === 'uri' ||
              exampleKind === 'bnode' ||
              exampleKind === 'literal'
            )
              connection.examples.push({
                kind: exampleKind,
                value: value(row, 'example'),
                datatype: connection.datatype,
                lang: value(row, 'languageValue') || undefined,
              });
            result.connections.push(connection);
          }
        } catch {
          result.failedDirections.push(direction);
        }
      }),
    );
    result.connections.sort(
      (a, b) =>
        b.entityCount - a.entityCount ||
        a.predicate.localeCompare(b.predicate) ||
        a.direction.localeCompare(b.direction),
    );
    return result;
  }
  async paths(
    focus: DiscoveryFocus,
    targetUri: string,
    targetKind: 'class' | 'property',
  ): Promise<DiscoveryPaths> {
    focusPattern(focus);
    iri(targetUri);
    const result: DiscoveryPaths = { paths: [], explored: 0, incomplete: true };
    const queue: DiscoveryStep[][] = [[]];
    const deadline =
      Date.now() + this.setting('DISCOVERY_PATH_TIMEOUT_MS', 20000);
    const budget = this.setting('DISCOVERY_PATH_BUDGET', 12);
    const depth = Math.min(
      this.setting('DISCOVERY_PATH_DEPTH', 4),
      12 - (focus.steps?.length ?? 0),
    );
    const pathLimit = this.setting('DISCOVERY_PATH_RESULT_LIMIT', 5);
    if (depth <= 0) return result;
    const seen = new Set<string>();
    while (
      queue.length &&
      result.explored < budget &&
      Date.now() < deadline &&
      result.paths.length < pathLimit
    ) {
      const path = queue.shift()!;
      result.explored++;
      let neighborhood: DiscoveryConnections;
      try {
        neighborhood = await this.inspect(
          { ...focus, steps: [...(focus.steps ?? []), ...path] },
          Math.max(1, Math.floor((deadline - Date.now()) / 2)),
        );
      } catch {
        continue;
      }
      for (const c of neighborhood.connections) {
        const step: DiscoveryStep = {
          predicate: c.predicate,
          direction: c.direction,
          targetClass: c.targetClass,
          kind: c.kind,
          datatype: c.datatype,
        };
        const next = [...path, step];
        const key = JSON.stringify(next);
        if (seen.has(key)) continue;
        seen.add(key);
        if (
          (targetKind === 'class' && c.targetClass === targetUri) ||
          (targetKind === 'property' && c.predicate === targetUri)
        ) {
          result.paths.push(next);
          if (result.paths.length >= pathLimit) break;
        } else if (
          next.length < depth &&
          c.kind === 'resource' &&
          c.predicate !== RDF_TYPE &&
          !path.some(
            (p) => p.predicate === c.predicate && p.direction !== c.direction,
          )
        ) {
          queue.push(next);
        }
      }
    }
    // Even an exhausted queue covers sampled neighborhoods, not the entire dataset.
    return result;
  }
}
