import { TestBed } from '@angular/core/testing';
import { LibraryService } from './library.service';
import { StoredQuery, SEED_QUERIES } from './seed-queries';

const STORAGE_KEY = 'rdf-explorer:queries';

function createService(): LibraryService {
  return TestBed.inject(LibraryService);
}

describe('LibraryService', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({});
  });

  afterEach(() => {
    localStorage.clear();
  });

  describe('initialization', () => {
    it('should seed queries on first load when localStorage is empty', () => {
      const service = createService();
      expect(service.getAll().length).toBe(SEED_QUERIES.length);
      expect(service.getAll().every((q) => q.isSeed)).toBe(true);
    });

    it('should persist seed queries to localStorage on first load', () => {
      createService();
      const stored = localStorage.getItem(STORAGE_KEY);
      expect(stored).toBeTruthy();
      const parsed: StoredQuery[] = JSON.parse(stored!);
      expect(parsed.length).toBe(SEED_QUERIES.length);
    });

    it('should load existing queries from localStorage', () => {
      const custom: StoredQuery = {
        id: 'user-test-1',
        name: 'Mi query',
        category: 'custom',
        sparql: 'SELECT ?x WHERE { ?x ?p ?o }',
        isSeed: false,
        createdAt: new Date().toISOString(),
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify([...SEED_QUERIES, custom]));

      const service = createService();
      expect(service.getAll().length).toBe(SEED_QUERIES.length + 1);
    });

    it('should recover from corrupt localStorage data', () => {
      localStorage.setItem(STORAGE_KEY, 'not-valid-json');
      const service = createService();
      expect(service.getAll().length).toBe(SEED_QUERIES.length);
    });
  });

  describe('getAll', () => {
    it('should return all queries (seeds + custom)', () => {
      const service = createService();
      service.save('Custom', 'SELECT ?x WHERE { ?x ?p ?o }');
      expect(service.getAll().length).toBe(SEED_QUERIES.length + 1);
    });
  });

  describe('seedQueries', () => {
    it('should return only seed queries', () => {
      const service = createService();
      service.save('Custom', 'SELECT ?x WHERE { ?x ?p ?o }');
      expect(service.seedQueries.length).toBe(SEED_QUERIES.length);
      expect(service.seedQueries.every((q) => q.isSeed)).toBe(true);
    });
  });

  describe('customQueries', () => {
    it('should return only user-created queries', () => {
      const service = createService();
      service.save('Custom A', 'SELECT ?x WHERE { ?x ?p ?o }');
      service.save('Custom B', 'SELECT ?y WHERE { ?y ?z ?w }');
      expect(service.customQueries.length).toBe(2);
      expect(service.customQueries.every((q) => !q.isSeed)).toBe(true);
    });

    it('should return empty array when no custom queries exist', () => {
      const service = createService();
      expect(service.customQueries.length).toBe(0);
    });
  });

  describe('save', () => {
    it('should add a new custom query', () => {
      const service = createService();
      const entry = service.save('Test Query', 'SELECT ?s WHERE { ?s ?p ?o }');
      expect(entry.id).toMatch(/^user-/);
      expect(entry.name).toBe('Test Query');
      expect(entry.category).toBe('custom');
      expect(entry.isSeed).toBe(false);
      expect(entry.createdAt).toBeTruthy();
    });

    it('should persist to localStorage', () => {
      const service = createService();
      service.save('Persisted', 'SELECT ?x WHERE { ?x ?p ?o }');
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY)!);
      expect(stored.length).toBe(SEED_QUERIES.length + 1);
      expect(stored.some((q: StoredQuery) => q.name === 'Persisted')).toBe(true);
    });

    it('should emit updated queries via queries$', () => {
      const service = createService();
      const results: StoredQuery[][] = [];
      service.queries$.subscribe((q) => results.push(q));
      service.save('Emitted', 'SELECT ?x WHERE { ?x ?p ?o }');
      const last = results[results.length - 1];
      expect(last.some((q) => q.name === 'Emitted')).toBe(true);
    });

    it('should handle multiple saves', () => {
      const service = createService();
      service.save('Q1', 'SELECT ?a WHERE { ?a ?b ?c }');
      service.save('Q2', 'SELECT ?d WHERE { ?d ?e ?f }');
      service.save('Q3', 'SELECT ?g WHERE { ?g ?h ?i }');
      expect(service.customQueries.length).toBe(3);
    });
  });

  describe('delete', () => {
    it('should delete a custom query by id', () => {
      const service = createService();
      const entry = service.save('To Delete', 'SELECT ?x WHERE { ?x ?p ?o }');
      expect(service.customQueries.length).toBe(1);

      const result = service.delete(entry.id);
      expect(result).toBe(true);
      expect(service.customQueries.length).toBe(0);
    });

    it('should not delete seed queries', () => {
      const service = createService();
      const seedId = SEED_QUERIES[0].id;
      const before = service.getAll().length;
      service.delete(seedId);
      expect(service.getAll().length).toBe(before);
    });

    it('should return false when id does not exist', () => {
      const service = createService();
      const result = service.delete('nonexistent-id');
      expect(result).toBe(false);
    });

    it('should persist deletion to localStorage', () => {
      const service = createService();
      const entry = service.save('DeleteMe', 'SELECT ?x WHERE { ?x ?p ?o }');
      service.delete(entry.id);
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY)!);
      expect(stored.some((q: StoredQuery) => q.id === entry.id)).toBe(false);
    });

    it('should emit updated queries via queries$ after delete', () => {
      const service = createService();
      service.save('Q1', 'SELECT ?a WHERE { ?a ?b ?c }');
      service.save('Q2', 'SELECT ?d WHERE { ?d ?e ?f }');

      const results: StoredQuery[][] = [];
      service.queries$.subscribe((q) => results.push(q));

      const custom = service.customQueries;
      service.delete(custom[0].id);

      const last = results[results.length - 1];
      expect(last.filter((q) => !q.isSeed).length).toBe(1);
    });
  });

  describe('restoreDefaults', () => {
    it('should clear all custom queries and restore seeds', () => {
      const service = createService();
      service.save('Custom1', 'SELECT ?a WHERE { ?a ?b ?c }');
      service.save('Custom2', 'SELECT ?d WHERE { ?d ?e ?f }');
      expect(service.customQueries.length).toBe(2);

      service.restoreDefaults();

      expect(service.getAll().length).toBe(SEED_QUERIES.length);
      expect(service.customQueries.length).toBe(0);
      expect(service.seedQueries.length).toBe(SEED_QUERIES.length);
    });

    it('should persist restored defaults to localStorage', () => {
      const service = createService();
      service.save('Custom', 'SELECT ?x WHERE { ?x ?p ?o }');
      service.restoreDefaults();

      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY)!);
      expect(stored.length).toBe(SEED_QUERIES.length);
      expect(stored.every((q: StoredQuery) => q.isSeed)).toBe(true);
    });

    it('should emit updated queries after restore', () => {
      const service = createService();
      service.save('Custom', 'SELECT ?x WHERE { ?x ?p ?o }');

      const results: StoredQuery[][] = [];
      service.queries$.subscribe((q) => results.push(q));

      service.restoreDefaults();

      const last = results[results.length - 1];
      expect(last.length).toBe(SEED_QUERIES.length);
      expect(last.every((q) => q.isSeed)).toBe(true);
    });
  });

  describe('queries$ observable', () => {
    it('should emit initial seed queries', () => {
      const service = createService();
      const results: StoredQuery[][] = [];
      service.queries$.subscribe((q) => results.push(q));
      expect(results.length).toBeGreaterThanOrEqual(1);
      expect(results[0].length).toBe(SEED_QUERIES.length);
    });
  });
});
