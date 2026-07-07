import { Component, computed, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DescribeService } from './describe.service';
import type { DescribeObjectItem, DescribeBucketItem } from './describe.service';
import { RequestService } from '../../core/request.service';

@Component({
  selector: 'app-describe-panel',
  templateUrl: './describe-panel.component.html',
  standalone: true,
  imports: [FormsModule],
  styles: [
    `.c-img { width: 100%; height: auto; display: block; }`,
    `.desc-uri-link, .ell { word-break: break-all; white-space: normal; }`,
    `.desc-loading { display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 32px 0; gap: 12px; color: var(--explorer-text-muted); font-size: 0.875rem; }`,
    `.desc-spinner { display: block; width: 28px; height: 28px; border: 3px solid var(--explorer-panel-border); border-top-color: var(--color-accent); border-radius: 50%; animation: desc-spin 0.6s linear infinite; }`,
    `@keyframes desc-spin { to { transform: rotate(360deg); } }`,
  ],
})
export class DescribePanelComponent {
  private readonly describeService = inject(DescribeService);
  readonly request = inject(RequestService);

  readonly selected = computed(() => this.describeService.current());
  readonly loading = computed(() => this.describeService.loading());
  readonly hasMoreProperties = computed(() => this.describeService.hasMoreProperties());

  loadMore(): void {
    this.describeService.loadMoreProperties();
  }

  searchBackend(): void {
    this.describeService.searchAndLoadProperty(this.objectSearch);
  }

  readonly objectsEmpty = computed(() => this.selected()?.objects?.length === 0);

  show = { datatype: false, objects: true, external: false };
  objectSearch = '';

  private _textExpanded = new Map<string, boolean>();
  private _dtExpanded = new Map<string, boolean>();
  private _objActive = new Map<string, boolean>();
  private _propFilters = new Map<string, string>();

  getNext(): void {
    this.describeService.next();
  }

  getPrev(): void {
    this.describeService.prev();
  }

  onDragProperty(event: DragEvent, propUri: string): void {
    event.dataTransfer?.setData('prop', propUri);
    event.dataTransfer?.setData('uri', '');
    event.dataTransfer?.setData('special', '');
  }

  onDragObject(event: DragEvent, objUri: string, propUri: string): void {
    event.dataTransfer?.setData('uri', objUri);
    event.dataTransfer?.setData('prop', propUri);
    event.dataTransfer?.setData('special', '');
  }

  onDragLiteral(event: DragEvent, propUri: string): void {
    event.dataTransfer?.setData('prop', propUri);
    event.dataTransfer?.setData('uri', '');
    event.dataTransfer?.setData('special', 'literal');
  }

  getResultsForProp(results: Record<string, unknown[]>, propUri: string): unknown[] {
    return results[propUri] ?? [];
  }

  getLabel(uri: string): string {
    return this.request.getLabel(uri) ?? '<' + uri + '>';
  }

  isObjectItem(item: unknown): item is DescribeObjectItem {
    return typeof item === 'object' && item !== null && 'uri' in item;
  }

  isTextExpanded(key: string): boolean {
    return this._textExpanded.get(key) ?? false;
  }

  toggleText(key: string): void {
    this._textExpanded.set(key, !this.isTextExpanded(key));
  }

  isDtExpanded(key: string): boolean {
    return this._dtExpanded.get(key) ?? false;
  }

  toggleDt(key: string): void {
    this._dtExpanded.set(key, !this.isDtExpanded(key));
  }

  isObjActive(propUri: string): boolean {
    return this._objActive.get(propUri) ?? false;
  }

  toggleObj(propUri: string): void {
    this._objActive.set(propUri, !this.isObjActive(propUri));
  }

  toggleObjWithTrue(propUri: string): void {
    this._objActive.set(propUri, true);
  }

  getPropFilter(propUri: string): string {
    return this._propFilters.get(propUri) ?? '';
  }

  setPropFilter(propUri: string, value: string): void {
    this._propFilters.set(propUri, value);
  }

  getFilteredObjects(objects: DescribeBucketItem[]): DescribeBucketItem[] {
    const filter = this.objectSearch.toLowerCase().trim();
    if (!filter) return objects;
    return objects.filter(prop =>
      this.getLabel(prop.uri).toLowerCase().includes(filter) ||
      prop.uri.toLowerCase().includes(filter)
    );
  }

  getFilteredResults(results: Record<string, unknown[]>, propUri: string): unknown[] {
    const items = this.getResultsForProp(results, propUri);
    const filter = this.getPropFilter(propUri).toLowerCase();
    if (!filter) return items;
    return items.filter(item => {
      if (this.isObjectItem(item)) {
        const label = (item.label || this.getLabel(item.uri)).toLowerCase();
        return label.includes(filter) || item.uri.toLowerCase().includes(filter);
      }
      return String(item).toLowerCase().includes(filter);
    });
  }
}
