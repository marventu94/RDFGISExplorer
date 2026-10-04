import {
  Inject,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
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
import { DiscoveryQueue, cancelled } from './discovery-queue';

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
  private upstreamCooldownUntil = 0;
  private readonly failures = new Map<string, number>();
  private readonly queue: DiscoveryQueue;
  constructor(
    @Inject(SPARQL_ENDPOINT) private readonly endpoint: SparqlEndpoint,
    private readonly config: ConfigService,
  ) {
    this.queue = new DiscoveryQueue(
      this.setting('DISCOVERY_MAX_CONCURRENT', 1),
      this.setting('DISCOVERY_QUEUE_LIMIT', 4),
    );
  }

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
  private get catalogRows(): number {
    return this.setting('DISCOVERY_CATALOG_PAGE_SIZE', 50);
  }
  private async run(
    query: string,
    limit: number,
    timeout?: number,
    signal?: AbortSignal,
  ): Promise<ResultBinding[]> {
    this.checkUpstream();
    const result = await this.endpoint
      .execute(query, {
        raw: true,
        limit,
        signal,
        maxRetries: 0,
        waitForServerOnCancel: true,
        timeoutMs: Math.min(
          timeout ?? Infinity,
          this.setting('DISCOVERY_TIMEOUT_MS', 8000),
        ),
      })
      .catch((error: unknown) => {
        if (!signal?.aborted) this.coolDown();
        throw error;
      });
    return result.bindings;
  }
  private coolDown(): void {
    this.upstreamCooldownUntil =
      Date.now() + this.setting('DISCOVERY_FAILURE_COOLDOWN_MS', 30000);
  }
  private checkUpstream(): void {
    if (this.upstreamCooldownUntil > Date.now()) {
      throw this.cooldownError(this.upstreamCooldownUntil);
    }
  }
  private cooldownError(until: number): ServiceUnavailableException {
    return new ServiceUnavailableException({
      error: 'DISCOVERY_COOLDOWN',
      message:
        'Discovery is cooling down after an upstream failure. Retry later.',
      retryAfterSeconds: Math.max(1, Math.ceil((until - Date.now()) / 1000)),
    });
  }
  private async cached<T>(
    key: string,
    fn: (signal: AbortSignal) => Promise<T>,
    cacheable: (data: T) => boolean = () => true,
    signal?: AbortSignal,
    keepAlive = false,
    ttl = this.setting('DISCOVERY_CACHE_TTL_MS', 60000),
  ): Promise<T> {
    if (signal?.aborted) throw cancelled();
    const entry = this.cache.get(key);
    if (entry && entry.expires > Date.now()) return entry.data as T;
    if ((this.failures.get(key) ?? 0) > Date.now()) {
      throw this.cooldownError(this.failures.get(key)!);
    }
    this.checkUpstream();
    return this.queue.run(
      key,
      async (jobSignal) => {
        try {
          this.checkUpstream();
          const data = await fn(jobSignal);
          if (jobSignal.aborted) throw cancelled();
          if (cacheable(data)) {
            if (this.cache.size >= 100)
              this.cache.delete(this.cache.keys().next().value!);
            this.cache.set(key, { data, expires: Date.now() + ttl });
          }
          this.failures.delete(key);
          return data;
        } catch (error) {
          // A local cooldown rejection is not another upstream failure. In
          // particular, queued requests must not extend the original pause.
          const response =
            error instanceof ServiceUnavailableException
              ? error.getResponse()
              : undefined;
          const coolingDown =
            typeof response === 'object' &&
            'error' in response &&
            response.error === 'DISCOVERY_COOLDOWN';
          if (!jobSignal.aborted && !coolingDown) {
            if (this.failures.size >= 100)
              this.failures.delete(this.failures.keys().next().value!);
            this.failures.set(
              key,
              Date.now() + this.setting('DISCOVERY_FAILURE_COOLDOWN_MS', 30000),
            );
          }
          throw error;
        }
      },
      signal,
      keepAlive,
    );
  }

  private terms(
    rows: ResultBinding[],
    kind: DiscoveryKind,
  ): DiscoveryCatalog['items'] {
    const terms = new Map<string, DiscoveryCatalog['items'][number]>();
    for (const row of rows) {
      const uri = value(row, 'uri');
      if (!uri) continue;
      const item = terms.get(uri) ?? {
        uri,
        label: value(row, 'label') || local(uri),
        kind,
        evidence: [],
      };
      for (const evidence of value(row, 'evidence').split(',')) {
        if (evidence === 'observed' || evidence === 'declared') {
          if (!item.evidence.includes(evidence)) item.evidence.push(evidence);
        }
      }
      terms.set(uri, item);
    }
    return [...terms.values()];
  }

  async catalog(
    kind: DiscoveryKind,
    q: string,
    offset = 0,
    signal?: AbortSignal,
  ): Promise<DiscoveryCatalog> {
    const text = q.trim().toLowerCase();
    return this.cached(
      `catalog:${kind}:${kind === 'resource' ? q.trim() : text}:${offset}`,
      async (jobSignal) => {
        if (this.endpoint.searchCatalog) {
          return this.endpoint
            .searchCatalog(kind, text, {
              limit: this.catalogRows,
              sampleSize: this.setting('DISCOVERY_CATALOG_SAMPLE_SIZE', 1000),
              offset,
              signal: jobSignal,
              timeoutMs: this.setting('DISCOVERY_TIMEOUT_MS', 8000),
            })
            .catch((error: unknown) => {
              if (!jobSignal.aborted) this.coolDown();
              throw error;
            });
        }
        if (kind === 'resource') {
          const entities = await this.endpoint
            .searchEntities(q.trim(), {
              limit: this.catalogRows + 1,
              offset,
              signal: jobSignal,
              timeoutMs: this.setting('DISCOVERY_TIMEOUT_MS', 8000),
              waitForServerOnCancel: true,
            })
            .catch((error: unknown) => {
              if (!jobSignal.aborted) this.coolDown();
              throw error;
            });
          const hasMore = entities.length > this.catalogRows;
          return {
            items: entities.slice(0, this.catalogRows).map((entity) => ({
              ...entity,
              kind,
              evidence: ['observed' as const],
            })),
            sampled: false,
            truncated: hasMore,
            nextOffset: hasMore ? offset + this.catalogRows : undefined,
          };
        }
        const rows = await this.run(
          catalogQuery(
            kind,
            text,
            this.catalogRows + 1,
            offset,
            this.setting('DISCOVERY_CATALOG_SAMPLE_SIZE', 1000),
            this.config.get<string>('DISCOVERY_CLASS_PREDICATE') ??
              this.endpoint.describeEndpoint?.().discovery?.classPredicate ??
              RDF_TYPE,
            this.config.get<string>('DISCOVERY_SUBCLASS_PREDICATE') ??
              this.endpoint.describeEndpoint?.().discovery?.subclassPredicate,
          ),
          this.catalogRows + 1,
          undefined,
          jobSignal,
        );
        return {
          items: this.terms(rows.slice(0, this.catalogRows), kind),
          // The statement sample is intentionally incomplete; another page is
          // offered only when a lookahead term actually exists.
          sampled: true,
          truncated: true,
          nextOffset:
            rows.length > this.catalogRows
              ? offset + this.catalogRows
              : undefined,
        };
      },
      () => true,
      signal,
      false,
      this.setting('DISCOVERY_CATALOG_TTL_MS', 300000),
    );
  }
  connections(
    focus: DiscoveryFocus,
    signal?: AbortSignal,
  ): Promise<DiscoveryConnections> {
    focusPattern(focus);
    return this.cached(
      `connections:${JSON.stringify(focus)}`,
      (jobSignal) => this.inspect(focus, undefined, jobSignal),
      (data) => data.failedDirections.length === 0,
      signal,
    );
  }
  private async inspect(
    focus: DiscoveryFocus,
    timeout?: number,
    signal?: AbortSignal,
  ): Promise<DiscoveryConnections> {
    const result: DiscoveryConnections = {
      connections: [],
      sampledEntities: 0,
      sampleLimit: this.sample,
      sampled: false,
      truncated: false,
      failedDirections: [],
    };
    const vocabulary = this.endpoint.describeEndpoint?.().discovery;
    const classPredicate =
      this.config.get<string>('DISCOVERY_CLASS_PREDICATE') ||
      vocabulary?.classPredicate ||
      RDF_TYPE;
    // One aggregate over a capped distinct sample: rows are not entity counts.
    const countRows = await this.run(
      `SELECT (COUNT(*) AS ?total) WHERE { ${focusSample(focus, this.sample + 1, classPredicate)} }`,
      1,
      timeout,
      signal,
    );
    const total = Number(value(countRows[0] ?? {}, 'total'));
    result.sampled = total > this.sample;
    result.sampledEntities = Math.min(total, this.sample);
    if (!total) return result;
    for (const direction of ['out', 'in'] as const) {
      try {
        const rows = await this.run(
          connectionsQuery(focus, direction, this.sample, this.rows + 1, {
            ...vocabulary,
            classPredicate,
          }),
          this.rows + 1,
          timeout,
          signal,
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
            label: value(row, 'label') || local(predicate),
            targetLabel: targetClass
              ? value(row, 'targetLabel') || local(targetClass)
              : undefined,
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
              label: value(row, 'exampleLabel') || undefined,
              datatype: connection.datatype,
              lang: value(row, 'languageValue') || undefined,
            });
          result.connections.push(connection);
        }
      } catch {
        if (signal?.aborted) throw cancelled();
        result.failedDirections.push(direction);
      }
    }
    result.connections.sort(
      (a, b) =>
        b.entityCount - a.entityCount ||
        a.predicate.localeCompare(b.predicate) ||
        a.direction.localeCompare(b.direction),
    );
    return result;
  }
  paths(
    focus: DiscoveryFocus,
    targetUri: string,
    targetKind: 'class' | 'property',
    signal?: AbortSignal,
  ): Promise<DiscoveryPaths> {
    focusPattern(focus);
    iri(targetUri);
    return this.queue.run(
      `paths:${JSON.stringify([focus, targetUri, targetKind])}`,
      (jobSignal) => this.findPaths(focus, targetUri, targetKind, jobSignal),
      signal,
    );
  }
  private async findPaths(
    focus: DiscoveryFocus,
    targetUri: string,
    targetKind: 'class' | 'property',
    signal: AbortSignal,
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
      if (signal.aborted) throw cancelled();
      const path = queue.shift()!;
      result.explored++;
      let neighborhood: DiscoveryConnections;
      try {
        neighborhood = await this.inspect(
          { ...focus, steps: [...(focus.steps ?? []), ...path] },
          Math.max(1, Math.floor((deadline - Date.now()) / 3)),
          signal,
        );
      } catch {
        if (signal.aborted) throw cancelled();
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
