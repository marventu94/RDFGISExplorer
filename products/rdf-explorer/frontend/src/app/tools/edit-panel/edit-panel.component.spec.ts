import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EditPanelComponent } from './edit-panel.component';
import { PropertyGraphService } from '../../graph/property-graph.service';
import { RequestService } from '../../core/request.service';
import { AppConfigService } from '../../core/services/app-config.service';
import { discoveryFocus } from '../../graph/domain/discovery';
import type { Node } from '../../graph/domain';

const first = 'http://www.wikidata.org/entity/Q397598';
const second = 'http://www.wikidata.org/entity/Q139454930';
describe('editing a single resource constraint', () => {
  let component: EditPanelComponent;
  let graph: PropertyGraphService;
  let selected: Node;
  let related: Node;
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [
      { provide: RequestService, useValue: { labelCache: signal(new Map()), getLabel: vi.fn(), execQuery: vi.fn(), prefetchLabels: vi.fn() } },
      { provide: AppConfigService, useValue: { config: signal(null), defaultPrefixes: signal({}) } },
    ] });
    graph = TestBed.inject(PropertyGraphService);
    selected = graph.addNode(); related = graph.addNode();
    const property = selected.newProp(); property.addUri('urn:relation'); property.mkConst();
    graph.addEdge(property, related);
    vi.spyOn(selected, 'loadPreview').mockImplementation(() => {});
    graph.setSelected(selected);
    component = TestBed.runInInjectionContext(() => new EditPanelComponent());
    TestBed.tick();
  });
  afterEach(() => component.ngOnDestroy());
  it('replaces the previous result and keeps the query and Explorer on the same resource', () => {
    component.addValue(first);
    component.mkVariable();
    component.addValue(second);
    expect(selected.uris).toEqual([second]);
    expect(selected.getUri()).toBe(second);
    expect(selected.isVariable()).toBe(false);
    expect(component.isVariable).toBe(false);
    expect(discoveryFocus(selected)).toEqual({ uri: second });
    const query = related.createQuery()!.toSparqlFullProjection();
    expect(query).toContain(`<${second}>`);
    expect(query).not.toContain(first);
    expect(query).not.toContain('VALUES');
  });
  it('replaces all legacy alternatives when entering a value manually', () => {
    selected.addUri(first); selected.addUri(second); selected.mkConst();
    component.newValue = 'urn:new-resource';
    component.addValue();
    expect(selected.uris).toEqual(['urn:new-resource']);
    expect(selected.getUri()).toBe('urn:new-resource');
    expect(component.newValue).toBe('');
  });
  it('keeps one value when selecting it again and leaves existing values intact on empty input', () => {
    component.addValue(first); component.addValue(first);
    expect(selected.uris).toEqual([first]);
    component.addValue('');
    expect(selected.uris).toEqual([first]);
  });
});
