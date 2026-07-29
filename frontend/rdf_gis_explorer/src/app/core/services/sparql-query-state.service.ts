import { Injectable, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class SparqlQueryStateService {
  readonly query = signal('');
  readonly backend = signal<string>('wikidata');
}
