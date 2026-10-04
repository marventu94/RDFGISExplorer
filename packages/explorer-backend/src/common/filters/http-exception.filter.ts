import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import {
  TimeoutError,
  UpstreamError,
} from '../../adapters/sparql-endpoint.interface';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    if (exception instanceof DOMException && exception.name === 'AbortError') {
      if (!response.destroyed)
        response
          .status(499)
          .json({ error: 'CANCELLED', message: 'Request cancelled' });
      return;
    }

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let body: Record<string, unknown> = {
      error: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred',
    };

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const res = exception.getResponse();
      body =
        typeof res === 'string'
          ? { error: 'ERROR', message: res }
          : { ...(res as Record<string, unknown>) };
    } else if (exception instanceof TimeoutError) {
      status = HttpStatus.REQUEST_TIMEOUT;
      body = { error: 'TIMEOUT', message: exception.message };
    } else if (exception instanceof UpstreamError) {
      status = HttpStatus.BAD_GATEWAY;
      body = { error: 'UPSTREAM_ERROR', message: exception.message };
    } else if (exception instanceof Error) {
      body = { error: 'INTERNAL_ERROR', message: exception.message };
    }

    const message = `${request.method} ${request.url} → ${status} ${JSON.stringify(body)}`;
    if (body.error === 'DISCOVERY_COOLDOWN') {
      response.setHeader('Retry-After', String(body.retryAfterSeconds));
      this.logger.warn(message);
    } else {
      this.logger.error(
        message,
        exception instanceof Error ? exception.stack : undefined,
      );
    }

    response.status(status).json(body);
  }
}
