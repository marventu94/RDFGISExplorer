import { Component, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
import type { DiscoveryKind, DiscoveryTerm } from '@rdfgis/contracts';
import { TranslatePipe } from '../../core/translate.pipe';
import { RequestService } from '../../core/request.service';
import { DiscoveryApiService } from '../../tools/discovery/discovery-api.service';
import { DiscoveryStateService } from '../../tools/discovery/discovery-state.service';

@Component({
  selector: 'app-search-panel', templateUrl: './search-panel.component.html',
  styleUrl: './search-panel.component.scss', imports: [FormsModule, TranslatePipe],
})
export class SearchPanelComponent implements OnDestroy {
  private readonly api = inject(DiscoveryApiService);
  private readonly request = inject(RequestService);
  readonly discovery = inject(DiscoveryStateService);
  readonly kind = signal<DiscoveryKind>('class');
  readonly results = signal<DiscoveryTerm[]>([]);
  readonly busy = signal(false);
  readonly error = signal(false);
  readonly active = signal(false);
  readonly truncated = signal(false);
  readonly nextOffset = signal<number | undefined>(undefined);
  searchInput = '';
  private subscription?: Subscription;
  private timer?: ReturnType<typeof setTimeout>;

  setKind(kind: DiscoveryKind): void { this.kind.set(kind); this.doSearch(); }
  onSearchChange(): void {
    clearTimeout(this.timer);
    this.subscription?.unsubscribe();
    this.results.set([]); this.busy.set(false); this.error.set(false);
    this.nextOffset.set(undefined); this.truncated.set(false);
    this.timer = setTimeout(() => this.doSearch(), 350);
  }
  doSearch(append = false): void {
    clearTimeout(this.timer); this.subscription?.unsubscribe();
    this.busy.set(true); this.active.set(true); this.error.set(false);
    if (!append) { this.results.set([]); this.nextOffset.set(undefined); }
    this.subscription = this.api.catalog(this.kind(), this.searchInput.trim(), append ? this.nextOffset() : 0).subscribe({
      next: data => {
        const terms = new Map(this.results().map(t => [t.uri, t]));
        for (const term of data.items) {
          const prior = terms.get(term.uri);
          terms.set(term.uri, { ...term, evidence: [...new Set([...(prior?.evidence ?? []), ...term.evidence])] });
        }
        this.results.set([...terms.values()]); this.nextOffset.set(data.nextOffset);
        this.truncated.set(data.truncated); this.busy.set(false);
      },
      error: () => { this.error.set(true); this.busy.set(false); },
    });
  }
  browse(): void { this.searchInput = ''; this.setKind('class'); }
  onDragStart(event: DragEvent, result: DiscoveryTerm): void {
    if (result.kind !== 'resource') { event.preventDefault(); return; }
    event.dataTransfer?.setData('uri', result.uri);
    event.dataTransfer?.setData('prop', '');
    this.request.setLabel(result.uri, result.label);
  }
  ngOnDestroy(): void { clearTimeout(this.timer); this.subscription?.unsubscribe(); }
}
