import { describe, expect, it } from 'vitest';
import { connectionFailure, EndpointStatusService } from './endpoint-status.service';

const backendError = (message: string) => ({ status: 502, error: { error: 'UPSTREAM_ERROR', message } });

describe('connectionFailure', () => {
  it('detects that the backend could not reach the endpoint', () => {
    expect(connectionFailure(backendError('connect ECONNECTTIMEOUT 10.0.0.1:7200 (5000ms) (body: {})')))
      .toContain('ECONNECTTIMEOUT');
    expect(connectionFailure(backendError('connect ECONNREFUSED 127.0.0.1:7200'))).not.toBeNull();
    expect(connectionFailure(backendError('getaddrinfo ENOTFOUND graphdb'))).not.toBeNull();
  });

  it('ignores endpoint answers and other failures', () => {
    expect(connectionFailure(backendError('Request failed with status code 500 (body: {})'))).toBeNull();
    expect(connectionFailure({ status: 400, error: { message: 'Parse error' } })).toBeNull();
    expect(connectionFailure(new Error('connect ECONNREFUSED'))).toBeNull();
    expect(connectionFailure(null)).toBeNull();
  });

  it('publishes only connection failures', () => {
    const service = new EndpointStatusService();
    service.report(backendError('Request failed with status code 500'));
    expect(service.failure()).toBeNull();
    service.report(backendError('connect EHOSTUNREACH 10.0.0.1:7200'));
    expect(service.failure()?.detail).toBe('connect EHOSTUNREACH 10.0.0.1:7200');
  });
});
