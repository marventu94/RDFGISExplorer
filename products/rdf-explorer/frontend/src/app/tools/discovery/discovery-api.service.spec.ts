import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { DiscoveryConnections } from '@rdfgis/contracts';
import { DiscoveryApiService } from './discovery-api.service';

const response = (direction: 'out' | 'in'): DiscoveryConnections => ({
  connections: [{ predicate: `urn:${direction}`, label: direction, direction, kind: 'resource', entityCount: 1, examples: [] }],
  sampledEntities: 1, sampleLimit: 200, sampled: false, truncated: false, failedDirections: [],
});
describe('incremental discovery API', () => {
  let api: DiscoveryApiService;
  let http: HttpTestingController;
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    api = TestBed.inject(DiscoveryApiService); http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());
  const request = (http: HttpTestingController, direction: string) => http.expectOne(req =>
    req.url.endsWith('/discovery/connections') && req.body.direction === direction);
  it('publishes outgoing connections before incoming and preserves them on failure', () => {
    const emitted: DiscoveryConnections[] = [];
    api.connections({ classUri: 'urn:House' }).subscribe(data => emitted.push(data));
    request(http, 'out').flush(response('out'));
    expect(emitted).toHaveLength(1);
    expect(emitted[0].pendingDirections).toEqual(['in']);
    request(http, 'in').flush({ retryAfterSeconds: 30 }, { status: 502, statusText: 'Upstream error' });
    expect(emitted[1].connections).toEqual(response('out').connections);
    expect(emitted[1].failedDirections).toEqual(['in']);
    expect(emitted[1].pendingDirections).toEqual([]);
    expect(emitted[1].retryAfterSeconds).toBe(30);
  });
  it('retries incoming alone and merges it with previous outgoing results', () => {
    let latest: DiscoveryConnections | undefined;
    api.connections({ classUri: 'urn:House' }, ['in'], { ...response('out'), failedDirections: ['in'] })
      .subscribe(data => latest = data);
    http.expectNone(req => req.body?.direction === 'out');
    request(http, 'in').flush(response('in'));
    expect(latest?.connections.map(c => c.direction)).toEqual(['out', 'in']);
    expect(latest?.failedDirections).toEqual([]);
  });
  it('cancels the active request when focus changes', () => {
    const subscription = api.connections({ classUri: 'urn:House' }).subscribe();
    const active = request(http, 'out');
    subscription.unsubscribe();
    expect(active.cancelled).toBe(true);
    http.expectNone(req => req.body?.direction === 'in');
  });
});
