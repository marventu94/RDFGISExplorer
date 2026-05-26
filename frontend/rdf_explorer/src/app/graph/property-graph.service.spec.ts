import { describe, it, expect, beforeEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { PropertyGraphService } from './property-graph.service';
import { Node } from './domain';

describe('PropertyGraphService', () => {
  let service: PropertyGraphService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [PropertyGraphService],
    });
    service = TestBed.inject(PropertyGraphService);
  });

  it('exposes nodes as a signal', () => {
    const n = service.addNode();
    const nodes = service.nodes();
    expect(nodes.some(x => x.id === n.id)).toBe(true);
  });

  it('exposes edges as a signal', () => {
    const s = service.addNode();
    const o = service.addNode();
    const edge = service.addEdge(s, o);
    expect(edge).not.toBeNull();
    const edges = service.edges();
    expect(edges.length).toBe(1);
  });

  it('exposes selected as a signal', () => {
    const n = service.addNode();
    service.setSelected(n);
    const sel = service.selected();
    expect(sel).toBeInstanceOf(Node);
  });

  it('revision signal bumps on mutation', () => {
    const before = service.revision();
    service.addNode();
    expect(service.revision()).toBe(before + 1);
  });

  it('reset clears graph and bumps revision', () => {
    service.addNode();
    const before = service.revision();
    service.reset();
    expect(service.nodes().length).toBe(0);
    expect(service.revision()).toBe(before + 1);
  });

  it('applyDrop uri creates a node', () => {
    service.applyDrop({ kind: 'uri', uri: 'http://example.org/A' }, { x: 10, y: 10 });
    expect(service.nodes().length).toBe(1);
  });

  it('applyDrop example creates canned scenario', () => {
    service.applyDrop({ kind: 'example', exampleType: 'cats' }, { x: 0, y: 0 });
    expect(service.nodes().length).toBeGreaterThan(1);
  });

  it('getQueriesForGraph returns queries', () => {
    service.applyDrop({ kind: 'example', exampleType: 'cats' }, { x: 0, y: 0 });
    const result = service.getQueriesForGraph();
    expect(result.queries.length).toBeGreaterThan(0);
  });

  it('getNodeByUri returns null for unknown URI', () => {
    expect(service.getNodeByUri('http://nonexistent/')).toBeNull();
  });
});
