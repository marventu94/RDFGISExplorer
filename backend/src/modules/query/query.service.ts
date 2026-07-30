import {
  Injectable,
  Inject,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Parser, Generator } from 'sparqljs';
import {
  SPARQL_ENDPOINT,
  TimeoutError,
  UpstreamError,
  NotImplementedError,
} from '../../adapters/sparql-endpoint.interface';
import type { SparqlEndpoint } from '../../adapters/sparql-endpoint.interface';
import type { QueryResult } from '../../shared/dto/query-result.dto';
import type {
  CategoricalSummary,
  QuerySummary,
  SummaryRequest,
} from '../../shared/dto/query-summary.dto';

const MAX_QUERY_LOG_LEN = 500;
/** Alias de agregación con prefijo improbable: no colisiona con variables del usuario. */
const AGG_ALIAS_PREFIX = '__agg_';
/** Tope de valores en el top categórico (override: SUMMARY_TOP_CATEGORICAL_LIMIT). */
const DEFAULT_TOP_CATEGORICAL_LIMIT = 12;
/** Las queries de agregación devuelven 1 fila (o ≤12): sobra con un límite chico. */
const SUMMARY_ROW_LIMIT = 100;
/** Nombre de variable SPARQL válido (se inyecta en el texto de la query: whitelist). */
const SAFE_VAR_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;

@Injectable()
export class QueryService {
  private readonly logger = new Logger(QueryService.name);

  constructor(
    @Inject(SPARQL_ENDPOINT) private readonly endpoint: SparqlEndpoint,
  ) {}

  async execute(
    sparql: string,
    limit?: number,
    raw?: boolean,
  ): Promise<QueryResult> {
    const parser = new Parser();
    try {
      parser.parse(sparql);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      throw new HttpException(
        { error: 'INVALID_SPARQL', message: msg },
        HttpStatus.BAD_REQUEST,
      );
    }

    const maxLimit = parseInt(process.env['SPARQL_MAX_LIMIT'] ?? '2000', 10);
    const resolvedLimit =
      limit ?? parseInt(process.env['SPARQL_DEFAULT_LIMIT'] ?? '500', 10);

    if (resolvedLimit > maxLimit) {
      throw new HttpException(
        {
          error: 'LIMIT_EXCEEDED',
          message: `Limit ${resolvedLimit} exceeds maximum allowed ${maxLimit}`,
          maxAllowed: maxLimit,
        },
        HttpStatus.PAYLOAD_TOO_LARGE,
      );
    }

    const timeout = parseInt(process.env['SPARQL_TIMEOUT_MS'] ?? '30000', 10);
    const preview =
      sparql.length > MAX_QUERY_LOG_LEN
        ? sparql.slice(0, MAX_QUERY_LOG_LEN) + '...'
        : sparql;
    this.logger.debug(
      `Executing SPARQL (limit=${resolvedLimit}, timeout=${timeout}ms): ${preview}`,
    );

    try {
      return await this.endpoint.execute(sparql, {
        timeoutMs: timeout,
        limit: resolvedLimit,
        raw,
      });
    } catch (e) {
      if (e instanceof TimeoutError) {
        this.logger.error(`Timeout after ${e.timeoutMs}ms: ${preview}`);
        throw new HttpException(
          { error: 'TIMEOUT', message: e.message, timeoutMs: e.timeoutMs },
          HttpStatus.REQUEST_TIMEOUT,
        );
      }
      if (e instanceof UpstreamError) {
        this.logger.error(`Upstream error status=${e.status}: ${e.message}`);
        throw new HttpException(
          { error: 'UPSTREAM_ERROR', message: e.message },
          HttpStatus.BAD_GATEWAY,
        );
      }
      if (e instanceof NotImplementedError) {
        throw new HttpException(
          { error: 'NOT_IMPLEMENTED', message: e.message },
          HttpStatus.SERVICE_UNAVAILABLE,
        );
      }
      throw e;
    }
  }

  /**
   * Resumen agregado del resultado COMPLETO de una query SELECT: la query del
   * usuario se envuelve como subquery y se le aplican agregados por fuera, así
   * que sus LIMIT/GROUP BY internos se respetan y nunca se cuenta el grafo
   * entero. Cada sección se degrada por separado: si una query de agregación
   * falla (timeout, feature no soportada por el endpoint), el resto del
   * resumen se devuelve igual y la sección queda marcada en `failed`.
   */
  async summarize(request: SummaryRequest): Promise<QuerySummary> {
    const t0 = Date.now();
    const { prologue, inner } = this.extractInnerQuery(request.query);

    const numericVars = this.sanitizeVars(request.numericVars);
    const temporalVars = this.sanitizeVars(request.temporalVars);
    const categoricalVars = this.sanitizeVars(request.categoricalVars);

    const timeoutMs =
      request.timeoutMs ??
      parseInt(process.env['SPARQL_TIMEOUT_MS'] ?? '30000', 10);

    const summary: QuerySummary = {
      totalRows: null,
      numeric: [],
      temporal: [],
      categorical: [],
      failed: { total: false, numeric: [], temporal: [], categorical: [] },
      meta: { durationMs: 0, backend: this.endpoint.backendName },
    };

    // COUNT total + agregados numéricos y temporales en una sola query.
    const mainQuery = this.buildMainAggregateQuery(
      prologue,
      inner,
      numericVars,
      temporalVars,
    );
    const mainRow = await this.runSummarySection(mainQuery, timeoutMs, () => {
      summary.failed.total = true;
      summary.failed.numeric.push(...numericVars);
      summary.failed.temporal.push(...temporalVars);
    });
    if (mainRow) {
      summary.totalRows = this.parseCount(mainRow[`${AGG_ALIAS_PREFIX}total`]);
      for (const v of numericVars) {
        summary.numeric.push({
          variable: v,
          count: this.parseCount(mainRow[`${AGG_ALIAS_PREFIX}count_${v}`]) ?? 0,
          min: this.parseNumber(mainRow[`${AGG_ALIAS_PREFIX}min_${v}`]),
          max: this.parseNumber(mainRow[`${AGG_ALIAS_PREFIX}max_${v}`]),
          avg: this.parseNumber(mainRow[`${AGG_ALIAS_PREFIX}avg_${v}`]),
        });
      }
      for (const v of temporalVars) {
        summary.temporal.push({
          variable: v,
          min: this.parseString(mainRow[`${AGG_ALIAS_PREFIX}tmin_${v}`]),
          max: this.parseString(mainRow[`${AGG_ALIAS_PREFIX}tmax_${v}`]),
        });
      }
    }

    // Top valores por variable categórica: una query por variable.
    for (const v of categoricalVars) {
      const rows = await this.runSummarySection(
        this.buildCategoricalQuery(
          prologue,
          inner,
          v,
          this.topCategoricalLimit(),
        ),
        timeoutMs,
        () => summary.failed.categorical.push(v),
        false,
      );
      if (!rows) continue;
      const values: CategoricalSummary['values'] = [];
      for (const row of rows) {
        const value = this.parseString(row[v]);
        const count = this.parseCount(row[`${AGG_ALIAS_PREFIX}c`]);
        // Filas con ?v unbound (grupo de nulos) no son un "top valor".
        if (value === null || count === null) continue;
        values.push({ value, count });
      }
      summary.categorical.push({ variable: v, values });
    }

    summary.meta.durationMs = Date.now() - t0;
    return summary;
  }

  /**
   * Valida que la query sea SELECT y la desarma en prólogo (PREFIX/BASE, al
   * nivel externo) + cuerpo regenerado sin prólogo (para envolver como
   * subquery: los PREFIX dentro de una subquery llaveada son inválidos en
   * varios endpoints). La regeneración con sparqljs.Generator garantiza que
   * el cuerpo queda sintácticamente autocontenido.
   */
  private extractInnerQuery(query: string): {
    prologue: string;
    inner: string;
  } {
    const parser = new Parser();
    let ast: Record<string, unknown>;
    try {
      ast = parser.parse(query) as unknown as Record<string, unknown>;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      throw new HttpException(
        { error: 'INVALID_SPARQL', message: msg },
        HttpStatus.BAD_REQUEST,
      );
    }

    if (ast['type'] !== 'query' || ast['queryType'] !== 'SELECT') {
      throw new HttpException(
        {
          error: 'INVALID_QUERY_TYPE',
          message:
            'Solo las queries SELECT admiten resumen (no ASK/CONSTRUCT/DESCRIBE)',
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    const lines: string[] = [];
    if (typeof ast['base'] === 'string' && ast['base']) {
      lines.push(`BASE <${ast['base']}>`);
    }
    const prefixes = (ast['prefixes'] ?? {}) as Record<string, string>;
    for (const [name, iri] of Object.entries(prefixes)) {
      lines.push(`PREFIX ${name}: <${iri}>`);
    }

    const inner = new Generator().stringify({
      ...ast,
      base: undefined,
      prefixes: {},
    } as never);
    return { prologue: lines.join('\n'), inner };
  }

  private buildMainAggregateQuery(
    prologue: string,
    inner: string,
    numericVars: string[],
    temporalVars: string[],
  ): string {
    const projections = [`(COUNT(*) AS ?${AGG_ALIAS_PREFIX}total)`];
    for (const v of numericVars) {
      projections.push(
        `(COUNT(?${v}) AS ?${AGG_ALIAS_PREFIX}count_${v})`,
        `(MIN(?${v}) AS ?${AGG_ALIAS_PREFIX}min_${v})`,
        `(MAX(?${v}) AS ?${AGG_ALIAS_PREFIX}max_${v})`,
        `(AVG(?${v}) AS ?${AGG_ALIAS_PREFIX}avg_${v})`,
      );
    }
    for (const v of temporalVars) {
      projections.push(
        `(MIN(?${v}) AS ?${AGG_ALIAS_PREFIX}tmin_${v})`,
        `(MAX(?${v}) AS ?${AGG_ALIAS_PREFIX}tmax_${v})`,
      );
    }
    return `${prologue}\nSELECT ${projections.join(' ')}\nWHERE { {\n${inner}\n} }`;
  }

  private buildCategoricalQuery(
    prologue: string,
    inner: string,
    variable: string,
    topLimit: number,
  ): string {
    const alias = `?${AGG_ALIAS_PREFIX}c`;
    return (
      `${prologue}\nSELECT ?${variable} (COUNT(*) AS ${alias})\n` +
      `WHERE { {\n${inner}\n} }\n` +
      `GROUP BY ?${variable} ORDER BY DESC(${alias}) LIMIT ${topLimit}`
    );
  }

  /** Tope del top categórico: env SUMMARY_TOP_CATEGORICAL_LIMIT (default 12). */
  private topCategoricalLimit(): number {
    const parsed = parseInt(
      process.env['SUMMARY_TOP_CATEGORICAL_LIMIT'] ?? '',
      10,
    );
    return Number.isInteger(parsed) && parsed > 0
      ? parsed
      : DEFAULT_TOP_CATEGORICAL_LIMIT;
  }

  /**
   * Ejecuta una query de agregación por el puerto SPARQL habitual (mismo
   * adaptador, timeout y retry). Ante cualquier fallo degrada: llama a
   * `onFail` y devuelve null en vez de propagar el error.
   */
  private async runSummarySection(
    query: string,
    timeoutMs: number,
    onFail: () => void,
  ): Promise<QueryResult['bindings'][number] | null>;
  private async runSummarySection(
    query: string,
    timeoutMs: number,
    onFail: () => void,
    singleRow: false,
  ): Promise<QueryResult['bindings'] | null>;
  private async runSummarySection(
    query: string,
    timeoutMs: number,
    onFail: () => void,
    singleRow = true,
  ): Promise<QueryResult['bindings'] | QueryResult['bindings'][number] | null> {
    try {
      const result = await this.endpoint.execute(query, {
        timeoutMs,
        limit: SUMMARY_ROW_LIMIT,
      });
      return singleRow ? (result.bindings[0] ?? {}) : result.bindings;
    } catch (e) {
      const preview =
        query.length > MAX_QUERY_LOG_LEN
          ? query.slice(0, MAX_QUERY_LOG_LEN) + '...'
          : query;
      this.logger.warn(
        `Summary section failed (${e instanceof Error ? e.message : String(e)}): ${preview}`,
      );
      onFail();
      return null;
    }
  }

  /**
   * Nombres de variable seguros para interpolar en el texto SPARQL: se
   * descarta cualquier cosa que no sea un identificador válido y los nombres
   * reservados del alias de agregación.
   */
  private sanitizeVars(vars: string[] | undefined): string[] {
    const out: string[] = [];
    for (const v of vars ?? []) {
      if (!SAFE_VAR_NAME.test(v)) continue;
      if (v.startsWith(AGG_ALIAS_PREFIX)) continue;
      if (!out.includes(v)) out.push(v);
    }
    return out;
  }

  private parseNumber(
    value: QueryResult['bindings'][number][string],
  ): number | null {
    if (!value) return null;
    const raw = value.type === 'coordinate' ? null : value.value;
    if (typeof raw !== 'string') return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  }

  private parseCount(
    value: QueryResult['bindings'][number][string],
  ): number | null {
    const n = this.parseNumber(value);
    return n === null ? null : Math.trunc(n);
  }

  private parseString(
    value: QueryResult['bindings'][number][string],
  ): string | null {
    if (!value) return null;
    if (value.type === 'coordinate') return value.raw;
    return value.value;
  }
}
