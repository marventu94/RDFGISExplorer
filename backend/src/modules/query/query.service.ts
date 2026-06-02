import { Injectable, Inject, HttpException, HttpStatus } from '@nestjs/common';
import { Parser } from 'sparqljs';
import {
  SPARQL_ENDPOINT,
  TimeoutError,
  UpstreamError,
  NotImplementedError,
} from '../../adapters/sparql-endpoint.interface';
import type { SparqlEndpoint } from '../../adapters/sparql-endpoint.interface';
import type { QueryResult } from '../../shared/dto/query-result.dto';

@Injectable()
export class QueryService {
  constructor(
    @Inject(SPARQL_ENDPOINT) private readonly endpoint: SparqlEndpoint,
  ) {}

  async execute(sparql: string, limit?: number): Promise<QueryResult> {
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

    try {
      return await this.endpoint.execute(sparql, {
        timeoutMs: timeout,
        limit: resolvedLimit,
      });
    } catch (e) {
      if (e instanceof TimeoutError) {
        throw new HttpException(
          { error: 'TIMEOUT', message: e.message, timeoutMs: e.timeoutMs },
          HttpStatus.REQUEST_TIMEOUT,
        );
      }
      if (e instanceof UpstreamError) {
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
}
