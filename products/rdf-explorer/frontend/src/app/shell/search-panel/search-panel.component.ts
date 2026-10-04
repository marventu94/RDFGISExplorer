import { Component, inject, OnDestroy, computed, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { EMPTY, Subscription, catchError, concat, defer, map } from 'rxjs';
import type { DiscoveryTerm } from '@rdfgis/contracts';
import { TranslatePipe } from '../../core/translate.pipe';
import { RequestService } from '../../core/request.service';
import { DiscoveryApiService } from '../../tools/discovery/discovery-api.service';

@Component({
  selector: 'app-search-panel', templateUrl: './search-panel.component.html',
  styleUrl: './search-panel.component.scss', imports: [FormsModule, TranslatePipe],
})
export class SearchPanelComponent implements OnDestroy {
  private readonly api = inject(DiscoveryApiService);
  private readonly request = inject(RequestService);
  readonly results = signal<DiscoveryTerm[]>([]);
  readonly busy = signal(false);
  readonly error = signal(false);
  readonly active = signal(false);
  readonly truncated = signal(false);
  readonly sampled = signal(false);
  private readonly nextOffsets = signal<{ class?: number; resource?: number }>({});
  readonly hasMore = computed(() => this.nextOffsets().class !== undefined || this.nextOffsets().resource !== undefined);
  searchInput = '';
  private subscription?: Subscription;
  private timer?: ReturnType<typeof setTimeout>;
  private requestKey?: string;

  toggleResults(): void { this.active.update(visible => !visible); }
  clearSearch(): void {
    this.searchInput = '';
    this.onSearchChange();
  }
  onSearchChange(): void {
    this.requestKey = undefined;
    clearTimeout(this.timer);
    this.subscription?.unsubscribe();
    this.results.set([]); this.busy.set(false); this.error.set(false);
    this.nextOffsets.set({}); this.truncated.set(false); this.sampled.set(false);
    if (!this.searchInput.trim()) {
      this.active.set(false);
      return;
    }
    this.timer = setTimeout(() => this.doSearch(), 350);
  }
  doSearch(append = false): void {
    clearTimeout(this.timer);
    if (!this.searchInput.trim()) { this.onSearchChange(); return; }
    if (append && (this.busy() || !this.hasMore())) return;
    const offsets = append ? this.nextOffsets() : { class: 0, resource: 0 };
    const text = this.searchInput.trim();
    const key = JSON.stringify([text, offsets]);
    if (key === this.requestKey) { this.active.set(true); return; }
    this.subscription?.unsubscribe();
    this.requestKey = key;
    this.busy.set(true); this.active.set(true); this.error.set(false);
    if (!append) {
      this.results.set([]); this.nextOffsets.set({});
      this.truncated.set(false); this.sampled.set(false);
    }
    // Start resources only when the class request settles, sharing backend load protection.
    const requests = (['class', 'resource'] as const)
      .filter(kind => offsets[kind] !== undefined)
      .map(kind => defer(() => this.api.catalog(kind, text, offsets[kind])).pipe(
        map(data => ({ kind, data })),
        catchError(() => { this.error.set(true); return EMPTY; }),
      ));
    this.subscription = concat(...requests).subscribe({
      next: ({ kind, data }) => {
        const terms = new Map(this.results().map(term => [term.kind + ':' + term.uri, term]));
        for (const term of data.items) {
          const key = term.kind + ':' + term.uri;
          const prior = terms.get(key);
          terms.set(key, { ...term, evidence: [...new Set([...(prior?.evidence ?? []), ...term.evidence])] });
        }
        this.results.set([...terms.values()].sort((a, b) => Number(b.kind === 'class') - Number(a.kind === 'class')));
        this.nextOffsets.update(offsets => ({ ...offsets, [kind]: data.nextOffset }));
        if (kind === 'class') this.sampled.set(!!data.sampled);
        if (kind === 'resource') this.truncated.set(data.truncated);
      },
      complete: () => {
        this.busy.set(false);
        if (this.error()) this.requestKey = undefined;
      },
    });
  }

  onDragStart(event: DragEvent, result: DiscoveryTerm): void {
    if (!event.dataTransfer) return;
    event.dataTransfer.setData('uri', result.kind === 'property' ? '' : result.uri);
    event.dataTransfer.setData('prop', result.kind === 'property' ? result.uri : '');
    event.dataTransfer.setData('special', result.kind === 'class' ? 'class' : '');
    event.dataTransfer.effectAllowed = 'copy';
    this.request.setLabel(result.uri, result.label);
  }
  ngOnDestroy(): void { clearTimeout(this.timer); this.subscription?.unsubscribe(); }
}
