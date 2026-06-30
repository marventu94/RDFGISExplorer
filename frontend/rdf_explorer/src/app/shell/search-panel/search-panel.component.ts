import { Component, inject, signal, effect } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { EntitySearchService } from '../../tools/search-panel/entity-search.service';
import type { WikidataSearchResult } from '../../tools/search-panel/search-result.model';

@Component({
  selector: 'app-search-panel',
  templateUrl: './search-panel.component.html',
  styleUrl: './search-panel.component.scss',
  imports: [FormsModule],
})
export class SearchPanelComponent {
  private readonly searchService = inject(EntitySearchService);

  searchInput = '';
  searchResults = signal<WikidataSearchResult[]>([]);
  searchActive = false;
  searchWait = false;
  searchError = false;
  noResults = false;
  lastSearch = '';

  private abortController: AbortController | null = null;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;

  onSearchChange(): void {
    if (this.debounceTimer) clearTimeout(this.debounceTimer);

    if (!this.searchInput.trim()) {
      this.abortController?.abort();
      this.searchActive = false;
      this.searchResults.set([]);
      this.searchWait = false;
      this.searchError = false;
      this.noResults = false;
      this.lastSearch = '';
      return;
    }

    const now = this.searchInput + '';
    this.debounceTimer = setTimeout(() => {
      if (now && now === this.searchInput) {
        this.doSearch();
      }
    }, 400);
  }

  onInputFocus(): void {
    this.searchActive = true;
  }

  async doSearch(): Promise<void> {
    if (!this.searchInput || this.searchInput === this.lastSearch) return;

    const input = this.searchInput;
    this.lastSearch = input;
    this.searchWait = true;
    this.searchError = false;
    this.noResults = false;
    this.searchActive = true;

    if (this.abortController) {
      this.abortController.abort();
    }
    this.abortController = new AbortController();

    try {
      const results = await this.searchService.search(input, this.abortController.signal);
      this.searchResults.set(results);
      this.searchError = false;
      this.searchWait = false;
      if (results.length === 0) this.noResults = true;
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      this.searchWait = false;
      this.noResults = false;
      this.searchError = true;
      this.lastSearch = '';
    }
  }

  onDragStart(event: DragEvent, result: WikidataSearchResult): void {
    event.dataTransfer?.setData('uri', result.uri);
    event.dataTransfer?.setData('prop', '');
  }
}
