import { describe, it, expect, beforeEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { PropertyGraphService } from '../property-graph.service';
import { serializeGraph, deserializeGraph } from './graph-serializer';

describe('graph-serializer round-trip', () => {
  let service: PropertyGraphService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [PropertyGraphService],
    });
    service = TestBed.inject(PropertyGraphService);
  });

  it('serializes and deserializes an empty graph', () => {
    const snapshot = service.serializeGraph();
    expect(snapshot.nodes.length).toBe(0);
    expect(snapshot.edges.length).toBe(0);

    service.restoreGraph(snapshot);
    expect(service.nodes().length).toBe(0);
    expect(service.edges().length).toBe(0);
  });

  it('round-trips a graph with 10+ nodes and 10+ edges preserving queries', () => {
    // Build a graph with 12 nodes and 12 edges
    const nodes: ReturnType<typeof service.addNode>[] = [];
    for (let i = 0; i < 12; i++) {
      const n = service.addNode();
      n.x = i * 100;
      n.y = i * 50;
      n.mkVariable();
      n.variable.setAlias(`var${i}`, { usedAliases: new Set(), log: () => {} });
      nodes.push(n);
    }

    // Make some nodes constants with URIs
    nodes[0].mkConst();
    nodes[0].addUri('http://example.org/Node0');
    nodes[3].mkConst();
    nodes[3].addUri('http://example.org/Node3');
    nodes[6].mkConst();
    nodes[6].addUri('http://example.org/Node6');

    // Create 12 edges (each edge also creates a property)
    const edges: ReturnType<typeof service.addEdge>[] = [];
    for (let i = 0; i < 12; i++) {
      const src = nodes[i];
      const tgt = nodes[(i + 1) % nodes.length];
      const edge = service.addEdge(src, tgt);
      expect(edge).not.toBeNull();
      edges.push(edge!);
    }

    // Capture original queries
    const originalQueries = service.getQueriesForGraph();
    const originalSparql = originalQueries.queries.map(q => q.toSparql()).join('\n---\n');

    // Serialize
    const snapshot = service.serializeGraph();
    expect(snapshot.nodes.length).toBeGreaterThanOrEqual(12 + 12); // nodes + properties
    expect(snapshot.edges.length).toBe(12);

    // Reset and deserialize
    service.reset();
    expect(service.nodes().length).toBe(0);

    service.restoreGraph(snapshot);
    expect(service.nodes().length).toBe(12);
    expect(service.edges().length).toBe(12);

    // Verify restored queries match
    const restoredQueries = service.getQueriesForGraph();
    const restoredSparql = restoredQueries.queries.map(q => q.toSparql()).join('\n---\n');
    expect(restoredSparql).toBe(originalSparql);
  });

  it('preserves node positions and variable aliases', () => {
    const n1 = service.addNode();
    n1.x = 123;
    n1.y = 456;
    n1.mkVariable();
    n1.variable.setAlias('person', { usedAliases: new Set(), log: () => {} });
    n1.variable.addFilter('lang', { language: 'en' }, { usedAliases: new Set(), log: () => {} });

    const snapshot = service.serializeGraph();
    service.reset();
    service.restoreGraph(snapshot);

    const restored = service.nodes()[0];
    expect(restored.x).toBe(123);
    expect(restored.y).toBe(456);
    expect(restored.variable.alias).toBe('person');
    expect(restored.variable.filters.length).toBe(1);
    expect(restored.variable.filters[0].type).toBe('lang');
  });

  it('preserves literal properties', () => {
    const n = service.addNode();
    const p = n.newProp();
    p.mkLiteral();
    p.literal!.addUri('http://example.org/literalValue');

    const snapshot = service.serializeGraph();
    service.reset();
    service.restoreGraph(snapshot);

    const restoredNode = service.nodes()[0];
    expect(restoredNode.properties.length).toBe(1);
    expect(restoredNode.properties[0].literal).not.toBeNull();
    expect(restoredNode.properties[0].literal!.uris).toContain('http://example.org/literalValue');
  });

  it('preserves edge structure after round-trip', () => {
    const a = service.addNode();
    const b = service.addNode();
    const c = service.addNode();

    const e1 = service.addEdge(a, b);
    const e2 = service.addEdge(b, c);

    const snapshot = service.serializeGraph();
    service.reset();
    service.restoreGraph(snapshot);

    const edges = service.edges();
    expect(edges.length).toBe(2);
    expect(edges[0].source.parentNode).toBe(service.nodes()[0]);
    expect(edges[0].target).toBe(service.nodes()[1]);
    expect(edges[1].source.parentNode).toBe(service.nodes()[1]);
    expect(edges[1].target).toBe(service.nodes()[2]);
  });
});
