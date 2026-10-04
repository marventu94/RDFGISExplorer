import { TestBed } from '@angular/core/testing';
import { Subject } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DiscoveryCatalog } from '@rdfgis/contracts';
import { SearchPanelComponent } from './search-panel.component';
import { DiscoveryApiService } from '../../tools/discovery/discovery-api.service';
import { DiscoveryStateService } from '../../tools/discovery/discovery-state.service';
import { RequestService } from '../../core/request.service';

describe('structural catalogue search', () => {
  let component: SearchPanelComponent;
  let responses: Subject<DiscoveryCatalog>[];
  let catalog: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    responses = [];
    catalog = vi.fn(() => { const subject = new Subject<DiscoveryCatalog>(); responses.push(subject); return subject; });
    TestBed.configureTestingModule({ providers: [
      { provide: DiscoveryApiService, useValue: { catalog } },
      { provide: DiscoveryStateService, useValue: {} },
      { provide: RequestService, useValue: { setLabel: vi.fn() } },
    ] });
    component = TestBed.runInInjectionContext(() => new SearchPanelComponent());
  });
  afterEach(() => { component.ngOnDestroy(); vi.useRealTimers(); });
  it('browses classes without requiring prior vocabulary knowledge', () => {
    component.browse();
    expect(catalog).toHaveBeenCalledWith('class', '', 0);
  });
  it('cancels obsolete requests before they can overwrite another category', () => {
    component.searchInput = 'House'; component.doSearch();
    component.setKind('property');
    expect(responses[0].observed).toBe(false);
    responses[0].next({ items: [{ uri: 'urn:House', label: 'House', kind: 'class', evidence: ['observed'] }], truncated: false });
    expect(component.results()).toEqual([]);
    responses[1].next({ items: [], truncated: false });
    expect(component.busy()).toBe(false);
  });
  it('merges class evidence across pages and invalidates pagination when text changes', () => {
    component.browse();
    responses[0].next({ items: [{ uri: 'urn:House', label: 'House', kind: 'class', evidence: ['observed'] }], truncated: true, nextOffset: 60 });
    component.doSearch(true);
    expect(catalog).toHaveBeenLastCalledWith('class', '', 60);
    responses[1].next({ items: [{ uri: 'urn:House', label: 'House', kind: 'class', evidence: ['declared'] }], truncated: true, nextOffset: 120 });
    expect(component.results()).toHaveLength(1);
    expect(component.results()[0].evidence).toEqual(['observed', 'declared']);
    vi.useFakeTimers();
    component.searchInput = 'Address'; component.onSearchChange();
    expect(component.nextOffset()).toBeUndefined();
    vi.advanceTimersByTime(350);
    expect(catalog).toHaveBeenLastCalledWith('class', 'Address', 0);
  });
});
