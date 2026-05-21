import { HttpExceptionFilter } from './http-exception.filter';
import { HttpException, HttpStatus } from '@nestjs/common';
import {
  TimeoutError,
  UpstreamError,
  NotImplementedError,
} from '../../adapters/sparql-endpoint.interface';

function createMockHost() {
  const json = jest.fn();
  const status = jest.fn().mockReturnValue({ json });
  const getResponse = jest.fn().mockReturnValue({ status });
  const getRequest = jest.fn().mockReturnValue({ url: '/test', method: 'GET' });
  const switchToHttp = jest.fn().mockReturnValue({ getResponse, getRequest });
  return {
    switchToHttp,
    json,
    status,
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

  it('should handle NotImplementedError → 503', () => {
    const host = createMockHost();
    const exception = new NotImplementedError('MillenniumDB');

    filter.catch(exception, host as never);

    expect(host.status).toHaveBeenCalledWith(503);
    expect(host.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: 'NOT_IMPLEMENTED' }),
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
});
