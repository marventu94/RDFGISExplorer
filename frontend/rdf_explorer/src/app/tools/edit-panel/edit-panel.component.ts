import { Component, computed, inject, NgZone, effect, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { PropertyGraphService } from '../../graph/property-graph.service';
import { RequestService } from '../../core/request.service';
import type { RDFResource, FilterType, FilterMetadata } from '../../graph/domain';
import type { Filter, FilterFieldMeta } from '../../graph/domain';

interface FilterField {
  key: string;
  meta: FilterFieldMeta;
  value: string | number | undefined;
}

interface ExistingFilter {
  filter: Filter;
  typeName: string;
  fields: FilterField[];
}

const DEFAULT_RESULTS_PER_PAGE = 10;

@Component({
  selector: 'app-edit-panel',
  templateUrl: './edit-panel.component.html',
  styleUrl: './edit-panel.component.scss',
  standalone: true,
  imports: [FormsModule],
})
export class EditPanelComponent {
  readonly graph = inject(PropertyGraphService);
  private readonly request = inject(RequestService);
  private readonly ngZone = inject(NgZone);

  readonly selected = computed(() => this.graph.selected());

  isVariable = true;
  isConst = false;
  isLiteral = false;

  newValueType = 'url';
  newValuePlaceholder = 'add a new URI';
  newValue = '';

  resultFilterValue = '';
  resultFilterLoading = false;
  resultOffset = 0;
  resultsPerPage = DEFAULT_RESULTS_PER_PAGE;
  hasMoreResults = false;
  readonly resultsVersion = signal(0);
  loadError: string | null = null;
  private previewAbort: AbortController | null = null;
  private previewTimer: ReturnType<typeof setTimeout> | null = null;

  added = 0;
  newFilterType: FilterType | '' = '';
  newFilterData: Record<string, string | number> = {};
  showFilters = true;

  newFilterFields: FilterField[] = [];
  existingFilters: ExistingFilter[] = [];

  private lastSelected: RDFResource | null = null;

  constructor() {
    effect(() => {
      this.graph.revision();
      const sel = this.selected();
      if (!sel) {
        this.lastSelected = null;
        return;
      }
      if (sel !== this.lastSelected) {
        this.lastSelected = sel;
        this.editResource(sel);
      } else if (sel.isVariable()) {
        this.loadPreview();
      }
    });
  }

  private editResource(resource: RDFResource): void {
    if (this.resultFilterValue) {
      this.resultFilterValue = '';
    }
    this.resultOffset = 0;
    this.hasMoreResults = false;
    this.loadError = null;
    this.isVariable = resource.isVariable();
    this.isConst = !this.isVariable;
    this.isLiteral = !!(resource as unknown as Record<string, unknown>)['parent'];
    if (this.isLiteral) {
      this.newValueType = 'text';
      this.newValuePlaceholder = 'add a new literal';
    } else {
      this.newValueType = 'url';
      this.newValuePlaceholder = 'add a new URI';
    }
    this.updateFilterFields();
    this.updateExistingFilters();
    this.loadPreview();
  }

  mkVariable(): void {
    const sel = this.selected();
    if (!sel) return;
    sel.mkVariable();
    this.isVariable = true;
    this.isConst = false;
    this.resultOffset = 0;
    this.hasMoreResults = false;
    this.loadPreview();
    this.graph.refresh();
  }

  mkConst(): void {
    const sel = this.selected();
    if (!sel) return;
    this.added = 0;
    sel.mkConst();
    this.isVariable = false;
    this.isConst = true;
    this.graph.refresh();
  }

  addValue(newV?: string): void {
    const sel = this.selected();
    if (!sel) return;
    const val = newV ?? this.newValue;
    if (!val) return;
    this.newValue = '';
    if (sel.addUri(val)) {
      if (sel.uris.length === 1) {
        this.mkConst();
      } else {
        this.added += 1;
      }
    }
    this.graph.refresh();
  }

  rmValue(value: string): void {
    const sel = this.selected();
    if (!sel) return;
    sel.removeUri(value);
    this.graph.refresh();
  }

  onNewFilterTypeChange(type: FilterType | ''): void {
    this.newFilterType = type;
    this.newFilterData = {};
    this.updateFilterFields();
  }

  newFilter(): void {
    const sel = this.selected();
    if (!sel || !this.newFilterType) return;

    const ctx = this.graph as unknown as Record<string, unknown>;
    const vctx = ctx['graphRef'] as unknown as { usedAliases: Set<string>; log: (msg: string) => void };
    sel.variable.addFilter(this.newFilterType, { ...this.newFilterData }, vctx);
    this.resultOffset = 0;
    this.hasMoreResults = false;
    this.loadPreview();
    this.graph.refresh();
    this.newFilterType = '';
    this.newFilterData = {};
    this.updateFilterFields();
    this.updateExistingFilters();
  }

  rmFilter(filter: Filter): void {
    const sel = this.selected();
    if (!sel) return;
    sel.variable.removeFilter(filter);
    this.resultOffset = 0;
    this.hasMoreResults = false;
    this.loadPreview();
    this.graph.refresh();
    this.updateExistingFilters();
  }

  onAliasChange(alias: string): void {
    const sel = this.selected();
    if (!sel) return;
    const ctx = this.graph as unknown as Record<string, unknown>;
    const vctx = ctx['graphRef'] as unknown as { usedAliases: Set<string>; log: (msg: string) => void };
    sel.variable.setAlias(alias, vctx);
    this.graph.refresh();
  }

  onFilterValueChange(): void {
    if (this.previewTimer) clearTimeout(this.previewTimer);
    const now = this.resultFilterValue + '';
    this.previewTimer = setTimeout(() => {
      if (now === this.resultFilterValue) {
        this.resultOffset = 0;
        this.hasMoreResults = false;
        this.loadPreview();
      }
    }, 400);
  }

  loadMoreResults(): void {
    if (this.resultFilterLoading || !this.hasMoreResults) return;
    this.resultOffset += this.resultsPerPage;
    this.loadPreview(true);
  }

  getLabel(uri: string): string {
    return this.request.getLabel(uri) ?? '<' + uri + '>';
  }

  private filterCatalog(): Record<string, FilterMetadata> {
    const g = this.graph as unknown as Record<string, unknown>;
    return (g['graphRef'] as unknown as Record<string, Record<string, FilterMetadata>>)?.['filterCatalog'] ?? {};
  }

  getFilterTypeOptions(): Array<{ key: string; metadata: FilterMetadata }> {
    const cat = this.filterCatalog();
    return Object.entries(cat).map(([key, meta]) => ({ key, metadata: meta }));
  }

  updateFilterFields(): void {
    if (!this.newFilterType) {
      this.newFilterFields = [];
      return;
    }
    const meta = this.filterCatalog()[this.newFilterType];
    if (!meta) {
      this.newFilterFields = [];
      return;
    }
    this.newFilterFields = Object.entries(meta.data).map(([k, v]) => ({
      key: k,
      meta: v,
      value: this.newFilterData[k] ?? '',
    }));
  }

  updateExistingFilters(): void {
    const sel = this.selected();
    if (!sel) {
      this.existingFilters = [];
      return;
    }
    this.existingFilters = sel.variable.filters.map(f => ({
      filter: f,
      typeName: this.getFilterMeta(f.type)?.name ?? f.type,
      fields: Object.entries(this.getFilterMeta(f.type)?.data ?? {}).map(([k, v]) => ({
        key: k,
        meta: v,
        value: (f.data as Record<string, string | number>)[k],
      })),
    }));
  }

  getFilterMeta(type: FilterType): FilterMetadata | undefined {
    return this.filterCatalog()[type];
  }

  selIsProperty(): boolean {
    const sel = this.selected();
    if (!sel) return false;
    return !!((sel as unknown as Record<string, () => boolean>)['isProperty']?.());
  }

  onStarChange(event: Event): void {
    const sel = this.selected();
    if (sel) {
      sel.star = (event.target as HTMLInputElement).checked;
      this.graph.refresh();
    }
  }

  onOptionalChange(event: Event): void {
    const sel = this.selected();
    if (sel) {
      sel.optional = (event.target as HTMLInputElement).checked;
      this.graph.refresh();
    }
  }

  updateNewFilterData(field: string, value: string | number): void {
    this.newFilterData = { ...this.newFilterData, [field]: value };
  }

  updateExistingFilterField(filter: Filter, field: string, value: string | number): void {
    (filter.data as Record<string, string | number>)[field] = value;
  }

  private loadPreview(isLoadMore = false): void {
    const sel = this.selected();
    if (!sel || !sel.isVariable()) return;

    if (!isLoadMore) {
      this.resultOffset = 0;
      this.hasMoreResults = false;
    }

    if (this.previewAbort) {
      this.previewAbort.abort();
      if (!isLoadMore) {
        this.resultFilterLoading = false;
      }
    }

    this.previewAbort = new AbortController();
    this.resultFilterLoading = true;
    this.loadError = null;

    const config: Record<string, unknown> = {
      limit: this.resultsPerPage,
      offset: this.resultOffset,
      appendResults: isLoadMore && this.resultOffset > 0,
      canceller: this.previewAbort.signal,
      callback: () => {
        this.ngZone.run(() => {
          this.resultFilterLoading = false;
          this.previewAbort = null;
          const rlen = sel.variable.results.length;
          this.hasMoreResults = rlen > 0 && rlen >= (this.resultOffset + this.resultsPerPage);
          this.resultsVersion.update(v => v + 1);
        });
      },
      onError: (err: unknown) => {
        this.ngZone.run(() => {
          this.resultFilterLoading = false;
          this.previewAbort = null;
          const msg = err instanceof Error ? err.message : String(err ?? '');
          this.loadError = msg || 'Error al ejecutar la query.';
        });
      },
    };

    const now = this.resultFilterValue + '';
    if (now) {
      config['varFilter'] = now;
    }

    const selNode = sel as unknown as { loadPreview?: (c: Record<string, unknown>) => void };
    if (selNode.loadPreview) {
      selNode.loadPreview.call(sel, config);
    }
  }
}
