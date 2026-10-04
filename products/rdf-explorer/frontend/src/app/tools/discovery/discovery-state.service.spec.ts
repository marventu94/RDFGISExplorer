import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { describe, expect, it, beforeEach, vi } from 'vitest';
import { DiscoveryStateService } from './discovery-state.service';
import { PropertyGraphService } from '../../graph/property-graph.service';
import { RequestService } from '../../core/request.service';
import { AppConfigService } from '../../core/services/app-config.service';
import { ToolService } from '../../tool/tool.service';
import type { DiscoveryTerm, DiscoveryConnection } from '@rdfgis/contracts';

const house: DiscoveryTerm = { uri: 'urn:House', label: 'House', kind: 'class', evidence: ['observed'] };
const feature: DiscoveryConnection = {
  predicate: 'urn:feature', direction: 'out', kind: 'resource', targetClass: 'urn:Address',
  label: 'feature', entityCount: 2, examples: [],
};
describe('DiscoveryStateService', () => {
  let state: DiscoveryStateService;
  let graph: PropertyGraphService;
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [
      { provide: RequestService, useValue: { labelCache: signal(new Map()), setLabel: vi.fn(), getLabel: vi.fn(), execQuery: vi.fn(), prefetchLabels: vi.fn() } },
      { provide: AppConfigService, useValue: { config: signal(null), defaultPrefixes: signal({}) } },
      { provide: ToolService, useValue: { active: signal('discovery') } },
    ] });
    state = TestBed.inject(DiscoveryStateService);
    graph = TestBed.inject(PropertyGraphService);
  });
  it('explores a class and its breadcrumbs without changing the query', () => {
    state.explore(house); state.traverse(feature);
    expect(state.focus()).toMatchObject({ classUri: 'urn:House', steps: [{ predicate: 'urn:feature' }] });
    expect(graph.nodes()).toHaveLength(0);
    state.backTo(0);
    expect(state.steps()).toEqual([]);
  });
  it('adds the explored path atomically and undoes it', () => {
    state.explore(house); state.traverse(feature); state.add();
    TestBed.tick();
    expect(graph.nodes()).toHaveLength(4);
    expect(state.canUndo()).toBe(true);
    state.undo();
    expect(graph.nodes()).toHaveLength(0);
    expect(state.origin()).toBeNull();
  });
  it('does not undo later manual edits or another workspace', () => {
    state.useClass(house);
    graph.addNode();
    expect(state.canUndo()).toBe(false);
    state.undo();
    expect(graph.nodes()).toHaveLength(3);
    graph.reset(); TestBed.tick();
    expect(state.source()).toBeNull();
  });
  it('refreshes contextual suggestions when a selected node gets a new constraint', () => {
    state.useClass(house); TestBed.tick();
    const source = state.source()!;
    const old = state.focus()!.query;
    graph.addDiscoveredPath(source, [{ predicate: 'urn:label', direction: 'out', kind: 'literal' }], false, { kind: 'literal', value: 'Berisso' });
    graph.setSelected(source); TestBed.tick();
    expect(state.focus()!.query).not.toBe(old);
    expect(state.focus()!.query).toContain('Berisso');
  });
});
