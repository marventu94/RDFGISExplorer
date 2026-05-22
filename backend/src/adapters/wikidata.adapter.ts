import axios, { AxiosError } from 'axios';
import {
  SparqlEndpoint,
  ExecuteOptions,
  TimeoutError,
  UpstreamError,
} from './sparql-endpoint.interface';
import {
  BindingValue,
  Coordinate,
  NormalizedEdge,
  NormalizedNode,
  QueryResult,
  ResultBinding,
  TemporalEvent,
} from '../shared/dto/query-result.dto';

const WIKIDATA_SPARQL_URL = 'https://query.wikidata.org/sparql';
const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_USER_AGENT = 'rdf-gis-explorer/0.1';
const RETRY_DELAYS_MS = [500, 1500, 4500];
const PREDICATE_CACHE_TTL_MS = 3_600_000;

const XSD_DATE = 'http://www.w3.org/2001/XMLSchema#date';
const XSD_DATE_TIME = 'http://www.w3.org/2001/XMLSchema#dateTime';
const GEOSPARQL_WKT = 'http://www.opengis.net/ont/geosparql#wktLiteral';

type WikidataRawBinding = Record<
  string,
  { type: string; value: string; 'xml:lang'?: string; datatype?: string }
>;

interface WikidataRawResponse {
  head: { vars: string[] };
  results: { bindings: WikidataRawBinding[] };
}

export class WikidataAdapter implements SparqlEndpoint {
  readonly backendName = 'wikidata' as const;

  private predicateCache: string[] | null = null;
  private predicateCacheAt = 0;

  async execute(query: string, opts: ExecuteOptions): Promise<QueryResult> {
    const t0 = Date.now();
    const timeoutMs = opts.timeoutMs > 0 ? opts.timeoutMs : DEFAULT_TIMEOUT_MS;
    const userAgent = this.resolveUserAgent();

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    if (opts.signal) {
      if (opts.signal.aborted) {
        clearTimeout(timer);
        controller.abort();
      } else {
        opts.signal.addEventListener('abort', () => controller.abort(), {
          once: true,
        });
      }
    }

    let lastErr: unknown;

    for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
      try {
        const response = await axios.post<WikidataRawResponse>(
          WIKIDATA_SPARQL_URL,
          new URLSearchParams({ query }),
          {
            headers: {
              'User-Agent': userAgent,
              Accept: 'application/sparql-results+json',
              'Content-Type': 'application/x-www-form-urlencoded',
            },
            signal: controller.signal,
          },
        );

        clearTimeout(timer);

        const rawBindings: WikidataRawBinding[] =
          response.data?.results?.bindings ?? [];
        const variables: string[] = response.data?.head?.vars ?? [];

        const truncated = opts.limit > 0 && rawBindings.length >= opts.limit;
        const bindings: ResultBinding[] = rawBindings
          .slice(0, opts.limit)
          .map((raw) => this.normalizeRow(raw, variables));

        const { nodes, edges } = this.buildGraph(bindings, variables);

        return {
          variables,
          bindings,
          nodes,
          edges,
          meta: {
            durationMs: Date.now() - t0,
            truncated,
            limitApplied: opts.limit,
            backend: 'wikidata',
          },
        };
      } catch (err) {
        clearTimeout(timer);

        if (controller.signal.aborted) {
          throw new TimeoutError(timeoutMs);
        }

        lastErr = err;

        if (!this.isAxiosError(err)) {
          throw err;
        }

        const status = err.response?.status ?? 0;
        if (status === 429 && attempt < RETRY_DELAYS_MS.length) {
          await this.delay(RETRY_DELAYS_MS[attempt]);
          continue;
        }
        if (status === 429) {
          throw new UpstreamError(429, 'Retries exhausted');
        }
        if (status >= 500) {
          throw new UpstreamError(status, err.message);
        }
        throw new UpstreamError(status, err.message);
      }
    }

    if (lastErr instanceof UpstreamError) {
      throw lastErr;
    }
    throw new UpstreamError(0, 'Retries exhausted');
  }

  async getPredicates(): Promise<string[]> {
    const now = Date.now();
    if (
      this.predicateCache &&
      now - this.predicateCacheAt < PREDICATE_CACHE_TTL_MS
    ) {
      return this.predicateCache;
    }

    const userAgent = this.resolveUserAgent();
    const query = 'SELECT DISTINCT ?p WHERE { ?s ?p ?o } LIMIT 1000';

    const response = await axios.post<WikidataRawResponse>(
      WIKIDATA_SPARQL_URL,
      new URLSearchParams({ query }),
      {
        headers: {
          'User-Agent': userAgent,
          Accept: 'application/sparql-results+json',
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      },
    );

    const rawBindings: WikidataRawBinding[] =
      response.data?.results?.bindings ?? [];
    const predicates = rawBindings
      .map((b) => b['p']?.value)
      .filter((v): v is string => typeof v === 'string');

    this.predicateCache = predicates;
    this.predicateCacheAt = now;

    return predicates;
  }

  private resolveUserAgent(): string {
    const ua = process.env['SPARQL_USER_AGENT'];
    if (!ua) {
      console.warn('SPARQL_USER_AGENT not set, using default');
      return DEFAULT_USER_AGENT;
    }
    return ua;
  }

  private normalizeRow(
    raw: WikidataRawBinding,
    variables: string[],
  ): ResultBinding {
    const row: ResultBinding = {};
    for (const v of variables) {
      const cell = raw[v];
      if (!cell) continue;
      row[v] = this.normalizeValue(cell);
    }
    return row;
  }

  private normalizeValue(raw: {
    type: string;
    value: string;
    'xml:lang'?: string;
    datatype?: string;
  }): BindingValue {
    if (raw.type === 'uri') {
      return { type: 'uri', value: raw.value };
    }

    if (raw.type === 'bnode') {
      return { type: 'bnode', value: raw.value };
    }

    if (raw['xml:lang']) {
      return { type: 'literal', value: raw.value, lang: raw['xml:lang'] };
    }

    const dt = raw.datatype ?? '';

    if (dt === XSD_DATE || dt === XSD_DATE_TIME) {
      return { type: 'date', value: raw.value, raw: raw.value };
    }

    if (dt === GEOSPARQL_WKT || raw.value.startsWith('Point(')) {
      const coord = this.parseWktPoint(raw.value);
      return { type: 'coordinate', value: coord, raw: raw.value };
    }

    return {
      type: 'literal',
      value: raw.value,
      ...(dt ? { datatype: dt } : {}),
    };
  }

  private parseWktPoint(raw: string): Coordinate {
    const m = /Point\s*\(\s*(-?[\d.]+)\s+(-?[\d.]+)\s*\)/.exec(raw);
    if (!m) {
      throw new Error(`Invalid WKT Point literal: ${raw}`);
    }
    return { lat: parseFloat(m[2]), lng: parseFloat(m[1]) };
  }

  private buildGraph(
    bindings: ResultBinding[],
    variables: string[],
  ): { nodes: NormalizedNode[]; edges: NormalizedEdge[] } {
    const nodeMap = new Map<string, NormalizedNode>();
    const edgeSet = new Set<string>();
    const edges: NormalizedEdge[] = [];

    for (const row of bindings) {
      const uriVars = variables.filter((v) => row[v]?.type === 'uri');

      if (uriVars.length === 0) continue;

      const primaryVar = uriVars[0];
      const primaryUri = row[primaryVar].value as string;

      const labelVar = `${primaryVar}Label`;
      const label =
        row[labelVar]?.type === 'literal'
          ? String(row[labelVar].value)
          : this.uriFragment(primaryUri);

      if (!nodeMap.has(primaryUri)) {
        const node: NormalizedNode = {
          uri: primaryUri,
          label,
          type: primaryVar,
          attributes: this.collectAttributes(row, variables),
        };
        const coord = this.findCoordinate(row, variables);
        if (coord) node.coordinate = coord;
        const events = this.findTemporalEvents(row, variables);
        if (events.length > 0) node.temporalEvents = events;
        nodeMap.set(primaryUri, node);
      } else {
        const existing = nodeMap.get(primaryUri)!;
        if (
          !existing.label ||
          existing.label === this.uriFragment(primaryUri)
        ) {
          const lbl =
            row[labelVar]?.type === 'literal'
              ? String(row[labelVar].value)
              : '';
          if (lbl) existing.label = lbl;
        }
        Object.assign(
          existing.attributes,
          this.collectAttributes(row, variables),
        );
        const coord = this.findCoordinate(row, variables);
        if (coord && !existing.coordinate) {
          existing.coordinate = coord;
        }
        const events = this.findTemporalEvents(row, variables);
        for (const ev of events) {
          const alreadyExists = existing.temporalEvents?.some(
            (e) => e.field === ev.field && e.isoDate === ev.isoDate,
          );
          if (!alreadyExists) {
            existing.temporalEvents = [...(existing.temporalEvents ?? []), ev];
          }
        }
      }

      for (let i = 1; i < uriVars.length; i++) {
        const targetVar = uriVars[i];
        const targetUri = row[targetVar].value as string;

        if (!nodeMap.has(targetUri)) {
          nodeMap.set(targetUri, {
            uri: targetUri,
            label: this.uriFragment(targetUri),
            attributes: {},
          });
        }

        const edgeId = `${primaryUri}|${targetVar}|${targetUri}`;
        if (!edgeSet.has(edgeId)) {
          edgeSet.add(edgeId);
          edges.push({
            id: edgeId,
            source: primaryUri,
            target: targetUri,
            predicate: targetVar,
          });
        }
      }
    }

    return { nodes: [...nodeMap.values()], edges };
  }

  private uriFragment(uri: string): string {
    const idx = uri.lastIndexOf('/');
    return idx >= 0 ? uri.slice(idx + 1) : uri;
  }

  private findCoordinate(
    row: ResultBinding,
    variables: string[],
  ): Coordinate | undefined {
    for (const v of variables) {
      const val = row[v];
      if (val?.type === 'coordinate') {
        return val.value;
      }
    }
    return undefined;
  }

  private findTemporalEvents(
    row: ResultBinding,
    variables: string[],
  ): TemporalEvent[] {
    const events: TemporalEvent[] = [];
    for (const v of variables) {
      const val = row[v];
      if (val?.type === 'date') {
        const d = new Date(val.value);
        events.push({
          field: v,
          isoDate: val.value,
          numericValue: isNaN(d.getTime()) ? undefined : d.getFullYear(),
        });
      }
    }
    return events;
  }

  private collectAttributes(
    row: ResultBinding,
    variables: string[],
  ): Record<string, BindingValue> {
    const attrs: Record<string, BindingValue> = {};
    for (const v of variables) {
      if (row[v] && row[v].type !== 'uri') {
        attrs[v] = row[v];
      }
    }
    return attrs;
  }

  private isAxiosError(err: unknown): err is AxiosError {
    return (
      typeof err === 'object' &&
      err !== null &&
      'isAxiosError' in err &&
      err['isAxiosError'] === true
    );
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
