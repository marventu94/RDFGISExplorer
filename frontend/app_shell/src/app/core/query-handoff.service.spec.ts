import { TestBed } from '@angular/core/testing';
import { QueryHandoffService, HandoffPayload } from './query-handoff.service';

const STORAGE_KEY = 'platform.handoff.pending';

describe('QueryHandoffService', () => {
  let service: QueryHandoffService;

  beforeEach(() => {
    sessionStorage.clear();
    TestBed.configureTestingModule({});
    service = TestBed.inject(QueryHandoffService);
  });

  afterEach(() => {
    sessionStorage.clear();
  });

  const makePayload = (overrides?: Partial<HandoffPayload>): HandoffPayload => ({
    query: 'SELECT * WHERE { ?s ?p ?o } LIMIT 10',
    backend: 'wikidata',
    source: {},
    publishedAt: new Date().toISOString(),
    ...overrides,
  });

  it('publish stores payload in memory and sessionStorage', () => {
    service.publish({
      query: 'SELECT * WHERE { ?s ?p ?o }',
      backend: 'wikidata',
      source: {},
    });

    const peeked = service.peek();
    expect(peeked).not.toBeNull();
    expect(peeked!.query).toBe('SELECT * WHERE { ?s ?p ?o }');
    expect(peeked!.backend).toBe('wikidata');
    expect(peeked!.publishedAt).toBeDefined();

    const stored = JSON.parse(sessionStorage.getItem(STORAGE_KEY)!);
    expect(stored.query).toBe('SELECT * WHERE { ?s ?p ?o }');
  });

  it('consume reads and clears the payload', () => {
    service.publish({ query: 'SELECT ?a WHERE { ?a ?b ?c }', backend: 'wikidata', source: {} });

    const consumed = service.consume();
    expect(consumed).not.toBeNull();
    expect(consumed!.query).toBe('SELECT ?a WHERE { ?a ?b ?c }');

    expect(service.consume()).toBeNull();
    expect(sessionStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it('peek returns payload without clearing', () => {
    service.publish({ query: 'ASK WHERE { ?s ?p ?o }', backend: 'millenniumdb', source: {} });

    const first = service.peek();
    const second = service.peek();
    expect(first).not.toBeNull();
    expect(second).not.toBeNull();
    expect(first!.query).toBe('ASK WHERE { ?s ?p ?o }');
  });

  it('returns null for expired payload (TTL 5 min)', () => {
    const old = new Date(Date.now() - 6 * 60 * 1000).toISOString();
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(makePayload({ publishedAt: old })));

    expect(service.consume()).toBeNull();
    expect(sessionStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it('returns null for corrupted sessionStorage data', () => {
    sessionStorage.setItem(STORAGE_KEY, 'not-json-at-all');

    expect(service.consume()).toBeNull();
    expect(sessionStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it('returns null when no handoff exists', () => {
    expect(service.peek()).toBeNull();
    expect(service.consume()).toBeNull();
  });

  it('handles milleniumdb backend', () => {
    service.publish({ query: 'SELECT * WHERE { ?s ?p ?o }', backend: 'millenniumdb', source: {} });

    const payload = service.consume();
    expect(payload).not.toBeNull();
    expect(payload!.backend).toBe('millenniumdb');
  });

  it('includes source metadata', () => {
    service.publish({
      query: 'SELECT * WHERE { ?s ?p ?o }',
      backend: 'wikidata',
      source: { workspaceId: 'ws-1', panelId: 'panel-0' },
    });

    const payload = service.consume();
    expect(payload!.source).toEqual({ workspaceId: 'ws-1', panelId: 'panel-0' });
  });
});
