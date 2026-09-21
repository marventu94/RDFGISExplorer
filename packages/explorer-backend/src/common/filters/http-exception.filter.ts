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
  NotImplementedError,
} from '../../adapters/sparql-endpoint.interface';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

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
    } else if (exception instanceof NotImplementedError) {
      status = HttpStatus.SERVICE_UNAVAILABLE;
      body = { error: 'NOT_IMPLEMENTED', message: exception.message };
    } else if (exception instanceof Error) {
      body = { error: 'INTERNAL_ERROR', message: exception.message };
    }

    this.logger.error(
      `${request.method} ${request.url} → ${status} ${JSON.stringify(body)}`,
      exception instanceof Error ? exception.stack : undefined,
    );

    response.status(status).json(body);
  }
}
