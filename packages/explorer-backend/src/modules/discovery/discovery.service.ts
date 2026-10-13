import {
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
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
  TimeoutError,
  UpstreamError,
  type SparqlEndpoint,
} from '../../adapters/sparql-endpoint.interface';
import {
  catalogQuery,
  classVocabularyQuery,
  connectionsQuery,
  focusPattern,
  focusSampleQuery,
  GENERIC_CLASSES,
  iri,
  OWL_SAME_AS,
  RDF_TYPE,
} from './discovery-query';
import { DiscoveryQueue, cancelled } from './discovery-queue';

function value(row: ResultBinding, key: string): string {
  const cell = row[key];
  return cell?.type === 'coordinate' ? cell.raw : (cell?.value ?? '');
}
function local(uri: string): string {
  const name = uri.split(/[/#]/).pop() || uri;
  try {
    return decodeURIComponent(name);
  } catch {
    return name;
  }
}

interface ClassVocabularyEntry {
  term: DiscoveryCatalog['items'][number];
  searchLabels: string[];
}

@Injectable()
export class DiscoveryService {
  private readonly cache = new Map<
    string,
    { expires: number; data: unknown }
  >();
  private readonly logger = new Logger(DiscoveryService.name);
  private traceSequence = 0;
  private readonly samples = new Map<
    string,
    { expires: number; rows: ResultBinding[] }
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
    context = 'discovery',
    timeoutCeilingMs?: number,
  ): Promise<ResultBinding[]> {
    const trace = `${context}/query-${++this.traceSequence}`;
    const timeoutMs = Math.min(
      timeout ?? Infinity,
      timeoutCeilingMs ?? this.setting('DISCOVERY_TIMEOUT_MS', 8000),
    );
    try {
      this.checkUpstream();
    } catch (error) {
      this.logger.debug(
        `[${trace}] skipped: upstream cooldown; no SPARQL sent`,
      );
      throw error;
    }
    const startedAt = Date.now();
    const details = `backend=${this.endpoint.backendName} limit=${limit} timeoutMs=${timeoutMs} regex=${/\bregex\s*\(/i.test(query)}`;
    this.logger.debug(
      `[${trace}] start ${details}\nSPARQL:\n${query}\n[${trace}] end SPARQL`,
    );
    const result = await this.endpoint
      .execute(query, {
        raw: true,
        limit,
        signal,
        maxRetries: 0,
        waitForServerOnCancel: true,
        timeoutMs,
      })
      .catch((error: unknown) => {
        const reason = error instanceof Error ? error.message : String(error);
        const status =
          error instanceof UpstreamError ? error.status : undefined;
        const outcome = signal?.aborted ? 'cancelled' : 'failed';
        const message = `[${trace}] ${outcome} ${details} elapsedMs=${Date.now() - startedAt} upstreamStatus=${status ?? 'n/a'} reason=${reason}`;
        if (signal?.aborted) this.logger.debug(message);
        else
          this.logger.warn(
            `${message}\nSPARQL:\n${query}\n[${trace}] end SPARQL`,
          );
        if (!signal?.aborted) {
          this.coolDown();
          if (error instanceof TimeoutError || error instanceof UpstreamError) {
            throw new HttpException(
              {
                error:
                  error instanceof TimeoutError ? 'TIMEOUT' : 'UPSTREAM_ERROR',
                message: error.message,
                retryAfterSeconds: Math.max(
                  1,
                  Math.ceil((this.upstreamCooldownUntil - Date.now()) / 1000),
                ),
              },
              error instanceof TimeoutError
                ? HttpStatus.REQUEST_TIMEOUT
                : HttpStatus.BAD_GATEWAY,
              { cause: error },
            );
          }
        }
        throw error;
      });
    this.logger.debug(
      `[${trace}] success elapsedMs=${Date.now() - startedAt} endpointDurationMs=${result.meta.durationMs} rows=${result.bindings.length} truncated=${result.meta.truncated}`,
    );
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

  private async classVocabulary(
    signal: AbortSignal,
  ): Promise<ClassVocabularyEntry[]> {
    const pageSize = this.setting('DISCOVERY_CLASS_VOCABULARY_PAGE_SIZE', 1000);
    const timeoutMs = this.setting(
      'DISCOVERY_CLASS_VOCABULARY_TIMEOUT_MS',
      45000,
    );
    const classPredicate =
      this.config.get<string>('DISCOVERY_CLASS_PREDICATE') ??
      this.endpoint.describeEndpoint?.().discovery?.classPredicate ??
      RDF_TYPE;
    const subclassPredicate =
      this.config.get<string>('DISCOVERY_SUBCLASS_PREDICATE') ??
      this.endpoint.describeEndpoint?.().discovery?.subclassPredicate;
    const entries = new Map<string, ClassVocabularyEntry>();
    for (let offset = 0; ; offset += pageSize) {
      const rows = await this.run(
        classVocabularyQuery(
          pageSize,
          offset,
          classPredicate,
          subclassPredicate,
        ),
        pageSize,
        undefined,
        signal,
        'catalog:class:vocabulary',
        timeoutMs,
      );
      for (const row of rows) {
        const uri = value(row, 'uri');
        if (!uri) continue;
        const label = value(row, 'label');
        let entry = entries.get(uri);
        if (!entry) {
          entry = {
            term: {
              uri,
              label: label || local(uri),
              kind: 'class',
              evidence: [],
            },
            searchLabels: [],
          };
          entries.set(uri, entry);
        } else if (
          label &&
          (!entry.searchLabels.length || label < entry.term.label)
        ) {
          entry.term.label = label;
        }
        if (label && !entry.searchLabels.includes(label))
          entry.searchLabels.push(label);
        for (const evidence of value(row, 'evidence').split(',')) {
          if (
            (evidence === 'observed' || evidence === 'declared') &&
            !entry.term.evidence.includes(evidence)
          ) {
            entry.term.evidence.push(evidence);
          }
        }
      }
      if (rows.length < pageSize) break;
    }
    return [...entries.values()].sort((a, b) =>
      a.term.uri < b.term.uri ? -1 : a.term.uri > b.term.uri ? 1 : 0,
    );
  }

  async catalog(
    kind: DiscoveryKind,
    q: string,
    offset = 0,
    signal?: AbortSignal,
  ): Promise<DiscoveryCatalog> {
    const text = q.trim().toLowerCase();
    if (kind === 'class' && text && !this.endpoint.searchCatalog) {
      const vocabulary = await this.cached(
        'catalog:class:complete-vocabulary',
        (jobSignal) => this.classVocabulary(jobSignal),
        () => true,
        signal,
        true,
        this.setting('DISCOVERY_CATALOG_TTL_MS', 300000),
      );
      const matches = vocabulary.filter(
        ({ term, searchLabels }) =>
          term.uri.toLowerCase().includes(text) ||
          local(term.uri).toLowerCase().includes(text) ||
          searchLabels.some((label) => label.toLowerCase().includes(text)),
      );
      const items = matches
        .slice(offset, offset + this.catalogRows)
        .map(({ term }) => term);
      const hasMore = matches.length > offset + this.catalogRows;
      return {
        items,
        sampled: false,
        truncated: hasMore,
        nextOffset: hasMore ? offset + this.catalogRows : undefined,
      };
    }
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
          `catalog:${kind}`,
        );
        return {
          items: this.terms(rows.slice(0, this.catalogRows), kind),
          // Text searches for classes enumerate all observed/declarable terms.
          // Empty browsing and property searches still use bounded samples.
          sampled: kind !== 'class' || !text,
          truncated:
            kind !== 'class' || !text || rows.length > this.catalogRows,
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
    direction?: 'out' | 'in',
  ): Promise<DiscoveryConnections> {
    focusPattern(focus);
    return this.cached(
      `connections:${direction ?? 'both'}:${JSON.stringify(focus)}`,
      (jobSignal) => this.inspect(focus, undefined, jobSignal, direction),
      (data) => data.failedDirections.length === 0,
      signal,
    );
  }
  private async inspect(
    focus: DiscoveryFocus,
    timeout?: number,
    signal?: AbortSignal,
    requestedDirection?: 'out' | 'in',
  ): Promise<DiscoveryConnections> {
    const trace = `connections-${++this.traceSequence}`;
    const { query, ...focusDetails } = focus;
    this.logger.debug(
      `[${trace}] focus=${JSON.stringify(focusDetails)} scope=${query ? 'connected-query' : 'term'} sampleLimit=${this.sample} resultLimit=${this.rows}`,
    );
    const result: DiscoveryConnections = {
      connections: [],
      sampledEntities: 0,
      sampleLimit: this.sample,
      sampled: false,
      truncated: false,
      failedDirections: [],
      relationsSampled: true,
      relationLimit: this.setting('DISCOVERY_RELATION_SAMPLE_SIZE', 2000),
    };
    const vocabulary = this.endpoint.describeEndpoint?.().discovery;
    const classPredicate =
      this.config.get<string>('DISCOVERY_CLASS_PREDICATE') ||
      vocabulary?.classPredicate ||
      RDF_TYPE;
    const sampleKey = JSON.stringify([focus, this.sample, classPredicate]);
    const cachedSample = this.samples.get(sampleKey);
    let countRows: ResultBinding[];
    if (cachedSample && cachedSample.expires > Date.now()) {
      countRows = cachedSample.rows;
      this.logger.debug(
        `[${trace}] reusing entity sample rows=${countRows.length}`,
      );
    } else {
      countRows = await this.run(
        focusSampleQuery(focus, this.sample + 1, classPredicate),
        this.sample + 1,
        timeout,
        signal,
        `${trace}/sample`,
      );
      if (signal?.aborted) throw cancelled();
      if (this.samples.size >= 100)
        this.samples.delete(this.samples.keys().next().value!);
      this.samples.set(sampleKey, {
        rows: countRows,
        expires: Date.now() + this.setting('DISCOVERY_CACHE_TTL_MS', 60000),
      });
    }
    const entities = countRows.slice(0, this.sample);
    const sampleIris = entities.flatMap((row) =>
      row.__d_focus?.type === 'uri' ? [row.__d_focus.value] : [],
    );
    // Blank-node identifiers never leave their original query as constants.
    const requeryNonIris = entities.some(
      (row) => row.__d_focus?.type !== 'uri',
    );
    const total = countRows.length;
    result.sampled = total > this.sample;
    result.sampledEntities = Math.min(total, this.sample);
    if (!total) {
      result.relationsSampled = false;
      return result;
    }
    for (const direction of requestedDirection
      ? [requestedDirection]
      : (['out', 'in'] as const)) {
      try {
        const rows = await this.run(
          connectionsQuery(focus, direction, this.sample, this.rows + 1, {
            ...vocabulary,
            classPredicate,
            sampleIris,
            requeryNonIris,
            relationLimit: result.relationLimit,
          }),
          this.rows + 1,
          timeout,
          signal,
          `${trace}/${direction}`,
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
      } catch (error) {
        if (signal?.aborted) throw cancelled();
        this.logger.warn(
          `[${trace}] Discovery ${direction} connections failed: ${error instanceof Error ? error.message : String(error)}`,
        );
        result.failedDirections.push(direction);
        result.retryAfterSeconds = Math.max(
          1,
          Math.ceil((this.upstreamCooldownUntil - Date.now()) / 1000),
        );
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
    const budget = this.setting('DISCOVERY_PATH_BUDGET', 40);
    const depth = Math.min(
      this.setting('DISCOVERY_PATH_DEPTH', 4),
      12 - (focus.steps?.length ?? 0),
    );
    const pathLimit = this.setting('DISCOVERY_PATH_RESULT_LIMIT', 5);
    if (depth <= 0) return result;
    const seen = new Set<string>();
    // Each class is expanded once, at its shallowest depth: reaching it again
    // through another route re-inspects the same structure.
    const expanded = new Set<string>(focus.classUri ? [focus.classUri] : []);
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
      } catch (error) {
        if (signal.aborted) throw cancelled();
        // Without the starting neighborhood an empty answer would read as
        // "no paths"; surface the cause (e.g. an upstream cooldown) instead.
        if (!path.length) throw error;
        continue;
      }
      // Inferred top classes duplicate each specific step; walking them
      // would spend the budget without reaching new structure.
      const specific = new Set(
        neighborhood.connections
          .filter((c) => c.targetClass && !GENERIC_CLASSES.has(c.targetClass))
          .map((c) => `${c.direction} ${c.predicate}`),
      );
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
          c.predicate !== OWL_SAME_AS &&
          !(
            c.targetClass &&
            GENERIC_CLASSES.has(c.targetClass) &&
            specific.has(`${c.direction} ${c.predicate}`)
          ) &&
          !path.some(
            (p) => p.predicate === c.predicate && p.direction !== c.direction,
          ) &&
          !(c.targetClass && expanded.has(c.targetClass))
        ) {
          if (c.targetClass) expanded.add(c.targetClass);
          queue.push(next);
        }
      }
    }
    // Even an exhausted queue covers sampled neighborhoods, not the entire dataset.
    return result;
  }
}
