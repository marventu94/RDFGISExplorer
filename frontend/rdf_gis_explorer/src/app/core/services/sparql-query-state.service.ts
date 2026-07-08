import { Injectable, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class SparqlQueryStateService {
  readonly query = signal('');
  readonly limit = signal(500);
  readonly backend = signal<string>('wikidata');
}
