import { HttpExceptionFilter } from './http-exception.filter';
import { HttpException, HttpStatus, Logger } from '@nestjs/common';
import {
  TimeoutError,
  UpstreamError,
} from '../../adapters/sparql-endpoint.interface';

function createMockHost() {
  const json = jest.fn();
  const status = jest.fn().mockReturnValue({ json });
  const setHeader = jest.fn();
  const getResponse = jest.fn().mockReturnValue({ status, setHeader });
  const getRequest = jest.fn().mockReturnValue({ url: '/test', method: 'GET' });
  const switchToHttp = jest.fn().mockReturnValue({ getResponse, getRequest });
  return {
    switchToHttp,
    json,
    status,
    setHeader,
  };
}

describe('HttpExceptionFilter', () => {
  let filter: HttpExceptionFilter;

  beforeEach(() => {
    filter = new HttpExceptionFilter();
  });

  it('should handle HttpException and preserve status and body', () => {
    const host = createMockHost();
    const exception = new HttpException(
      { error: 'INVALID_SPARQL', message: 'Bad query' },
      HttpStatus.BAD_REQUEST,
    );

    filter.catch(exception, host as never);

    expect(host.status).toHaveBeenCalledWith(400);
    expect(host.json).toHaveBeenCalledWith({
      error: 'INVALID_SPARQL',
      message: 'Bad query',
    });
  });

  it('should handle TimeoutError → 408', () => {
    const host = createMockHost();
    const exception = new TimeoutError(10000);

    filter.catch(exception, host as never);

    expect(host.status).toHaveBeenCalledWith(408);
    expect(host.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: 'TIMEOUT' }),
    );
  });

  it('should handle UpstreamError → 502', () => {
    const host = createMockHost();
    const exception = new UpstreamError(503, 'Bad gateway');

    filter.catch(exception, host as never);

    expect(host.status).toHaveBeenCalledWith(502);
    expect(host.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: 'UPSTREAM_ERROR' }),
    );
  });

  it('should handle generic Error → 500', () => {
    const host = createMockHost();
    const exception = new Error('Something went wrong');

    filter.catch(exception, host as never);

    expect(host.status).toHaveBeenCalledWith(500);
    expect(host.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: 'INTERNAL_ERROR' }),
    );
  });
  it('returns Retry-After for a local cooldown and logs a warning without a stack trace', () => {
    const warn = jest
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);
    const error = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
    try {
      const host = createMockHost();
      filter.catch(
        new HttpException(
          { error: 'DISCOVERY_COOLDOWN', retryAfterSeconds: 12 },
          503,
        ),
        host as never,
      );
      expect(host.status).toHaveBeenCalledWith(503);
      expect(host.setHeader).toHaveBeenCalledWith('Retry-After', '12');
      expect(warn).toHaveBeenCalledTimes(1);
      expect(error).not.toHaveBeenCalled();
    } finally {
      warn.mockRestore();
      error.mockRestore();
    }
  });
});
