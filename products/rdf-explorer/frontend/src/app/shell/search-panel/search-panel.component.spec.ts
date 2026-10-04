import { TestBed } from '@angular/core/testing';
import { Subject } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DiscoveryCatalog, DiscoveryTerm } from '@rdfgis/contracts';
import { SearchPanelComponent } from './search-panel.component';
import { DiscoveryApiService } from '../../tools/discovery/discovery-api.service';
import { RequestService } from '../../core/request.service';
import { parseDropPayload } from '../../graph/canvas-graph/canvas-graph.drop';

const term = (kind: 'class' | 'resource', uri = 'urn:House'): DiscoveryTerm => ({
  uri, label: 'House', kind, evidence: ['observed'],
});
describe('unified class and resource search', () => {
  let component: SearchPanelComponent;
  let responses: Subject<DiscoveryCatalog>[];
  let catalog: ReturnType<typeof vi.fn>;
  let setLabel: ReturnType<typeof vi.fn>;
  const finish = (index: number, data: DiscoveryCatalog) => {
    responses[index].next(data);
    responses[index].complete();
  };
  beforeEach(() => {
    responses = [];
    catalog = vi.fn(() => {
      const subject = new Subject<DiscoveryCatalog>();
      responses.push(subject);
      return subject;
    });
    setLabel = vi.fn();
    TestBed.configureTestingModule({ providers: [
      { provide: DiscoveryApiService, useValue: { catalog } },
      { provide: RequestService, useValue: { setLabel } },
    ] });
    component = TestBed.runInInjectionContext(() => new SearchPanelComponent());
  });
  afterEach(() => { component.ngOnDestroy(); vi.useRealTimers(); });
  it('stays idle with empty input and cancels both stages when cleared', () => {
    vi.useFakeTimers();
    component.onSearchChange(); component.doSearch();
    vi.advanceTimersByTime(350);
    expect(catalog).not.toHaveBeenCalled();
    component.searchInput = 'House'; component.doSearch();
    component.clearSearch();
    expect(responses[0].observed).toBe(false);
    responses[0].complete();
    vi.advanceTimersByTime(350);
    expect(catalog).toHaveBeenCalledTimes(1);
    expect(component.results()).toEqual([]);
    expect(component.busy()).toBe(false);
    expect(component.active()).toBe(false);
  });
  it('searches classes then resources, preserving their identity and class-first order', () => {
    component.searchInput = 'House'; component.doSearch();
    expect(catalog.mock.calls).toEqual([['class', 'House', 0]]);
    finish(0, { items: [term('class')], sampled: true, truncated: true });
    expect(component.results()).toEqual([term('class')]);
    expect(component.busy()).toBe(true);
    expect(catalog.mock.calls).toEqual([['class', 'House', 0], ['resource', 'House', 0]]);
    finish(1, { items: [term('resource')], truncated: false });
    expect(component.results().map(result => result.kind)).toEqual(['class', 'resource']);
    expect(component.sampled()).toBe(true);
    expect(component.busy()).toBe(false);
    expect(component.hasMore()).toBe(false);
    expect(catalog.mock.calls.some(call => call[0] === 'property')).toBe(false);
  });
  it('debounces rapid typing and repeated submits without restarting either stage', () => {
    vi.useFakeTimers();
    for (const text of ['H', 'Ho', 'House']) {
      component.searchInput = text; component.onSearchChange(); vi.advanceTimersByTime(100);
    }
    expect(catalog).not.toHaveBeenCalled();
    vi.advanceTimersByTime(350);
    component.doSearch();
    expect(catalog).toHaveBeenCalledTimes(1);
    finish(0, { items: [], truncated: false });
    component.doSearch();
    expect(catalog).toHaveBeenCalledTimes(2);
    finish(1, { items: [], truncated: false });
    component.toggleResults();
    expect(component.active()).toBe(false);
    component.toggleResults();
    expect(catalog).toHaveBeenCalledTimes(2);
    expect(component.active()).toBe(true);
  });
  it('cancels obsolete resource requests before they can overwrite new text', () => {
    vi.useFakeTimers();
    component.searchInput = 'House'; component.doSearch();
    finish(0, { items: [term('class')], truncated: false });
    component.searchInput = 'Address'; component.onSearchChange();
    expect(responses[1].observed).toBe(false);
    responses[1].next({ items: [term('resource')], truncated: false });
    expect(component.results()).toEqual([]);
    vi.advanceTimersByTime(350);
    expect(catalog).toHaveBeenLastCalledWith('class', 'Address', 0);
  });
  it('paginates each group independently, merging evidence and keeping classes above resources', () => {
    component.searchInput = 'House'; component.doSearch();
    finish(0, { items: [term('class')], truncated: true, nextOffset: 50 });
    finish(1, { items: [term('resource', 'urn:listing')], truncated: true, nextOffset: 100 });
    component.doSearch(true); component.doSearch(true);
    expect(catalog).toHaveBeenLastCalledWith('class', 'House', 50);
    finish(2, { items: [{ ...term('class'), evidence: ['declared'] }, term('class', 'urn:Other')], truncated: true });
    expect(catalog).toHaveBeenLastCalledWith('resource', 'House', 100);
    finish(3, { items: [term('resource', 'urn:listing2')], truncated: true, nextOffset: 150 });
    expect(component.results().map(result => result.kind)).toEqual(['class', 'class', 'resource', 'resource']);
    expect(component.results()[0].evidence).toEqual(['observed', 'declared']);
    component.doSearch(true);
    expect(catalog).toHaveBeenLastCalledWith('resource', 'House', 150);
    finish(4, { items: [], truncated: false });
    expect(component.hasMore()).toBe(false);
  });
  it('keeps successful results when the other group fails and never retries automatically', () => {
    vi.useFakeTimers();
    component.searchInput = 'House'; component.doSearch();
    finish(0, { items: [term('class')], truncated: false });
    responses[1].error(new Error('timeout'));
    expect(component.results()).toEqual([term('class')]);
    expect(component.busy()).toBe(false);
    expect(component.error()).toBe(true);
    vi.advanceTimersByTime(10000);
    expect(catalog).toHaveBeenCalledTimes(2);
    component.doSearch(); component.doSearch();
    expect(catalog).toHaveBeenCalledTimes(3);
  });
  it('also searches resources after a failed class request', () => {
    component.searchInput = 'Casa'; component.doSearch();
    responses[0].error(new Error('timeout'));
    expect(catalog).toHaveBeenLastCalledWith('resource', 'Casa', 0);
    finish(1, { items: [term('resource')], truncated: false });
    expect(component.results()).toEqual([term('resource')]);
    expect(component.busy()).toBe(false);
  });
  it.each(['class', 'resource', 'property'] as const)('creates a canvas-compatible %s drag payload', kind => {
    const data: Record<string, string> = {};
    const transfer = { setData: (key: string, value: string) => { data[key] = value; }, getData: (key: string) => data[key] ?? '' } as unknown as DataTransfer;
    const result: DiscoveryTerm = { ...term('resource'), kind };
    component.onDragStart({ dataTransfer: transfer } as DragEvent, result);
    expect(parseDropPayload(transfer)).toEqual(kind === 'class' ? { kind: 'class', uri: result.uri }
      : kind === 'property' ? { kind: 'prop', prop: result.uri } : { kind: 'uri', uri: result.uri });
    expect(setLabel).toHaveBeenCalledWith(result.uri, result.label);
    expect(transfer.effectAllowed).toBe('copy');
  });
});
