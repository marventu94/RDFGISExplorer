import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { StoredQuery, SEED_QUERIES } from './seed-queries';

const STORAGE_KEY = 'rdf-explorer:queries';

@Injectable({ providedIn: 'root' })
export class LibraryService {
  private readonly _queries$ = new BehaviorSubject<StoredQuery[]>([]);
  readonly queries$: Observable<StoredQuery[]> = this._queries$.asObservable();

  constructor() {
    this.initialize();
  }

  get seedQueries(): StoredQuery[] {
    return this._queries$.getValue().filter((q) => q.isSeed);
  }

  get customQueries(): StoredQuery[] {
    return this._queries$.getValue().filter((q) => !q.isSeed);
  }

  getAll(): StoredQuery[] {
    return this._queries$.getValue();
  }

  save(name: string, sparql: string): StoredQuery {
    const entry: StoredQuery = {
      id: `user-${crypto.randomUUID()}`,
      name,
      category: 'custom',
      sparql,
      isSeed: false,
      createdAt: new Date().toISOString(),
    };
    const current = this._queries$.getValue();
    const updated = [...current, entry];
    this.persist(updated);
    return entry;
  }

  delete(id: string): boolean {
    const current = this._queries$.getValue();
    const filtered = current.filter((q) => q.id !== id || q.isSeed);
    if (filtered.length === current.length) {
      return false;
    }
    this.persist(filtered);
    return true;
  }

  restoreDefaults(): void {
    localStorage.removeItem(STORAGE_KEY);
    this.persist([...SEED_QUERIES]);
  }

  private initialize(): void {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) {
      this.persist([...SEED_QUERIES]);
    } else {
      try {
        const parsed: StoredQuery[] = JSON.parse(stored);
        this._queries$.next(parsed);
      } catch {
        this.persist([...SEED_QUERIES]);
      }
    }
  }

  private persist(queries: StoredQuery[]): void {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(queries));
    this._queries$.next(queries);
  }
}
