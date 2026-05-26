import { describe, it, expect, beforeEach } from 'vitest';
import { PropertyGraph } from '../graph';
import { Node } from '../node';
import { Property } from '../property';
import { Literal } from '../literal';
import { GenericAdapter } from '../endpoint/generic-adapter';

function createGraph(): PropertyGraph {
  return new PropertyGraph({
    labelUri: 'http://www.w3.org/2000/01/rdf-schema#label',
    lang: 'en',
    prefixes: [
      { prefix: 'wdt', uri: 'http://www.wikidata.org/prop/direct/' },
      { prefix: 'wd', uri: 'http://www.wikidata.org/entity/' },
      { prefix: 'rdfs', uri: 'http://www.w3.org/2000/01/rdf-schema#' },
    ],
    endpointAdapter: new GenericAdapter(),
  });
}

describe('PropertyGraph mutations', () => {
  let graph: PropertyGraph;

  beforeEach(() => {
    graph = createGraph();
  });

  describe('addNode', () => {
    it('creates a Node with auto-incremented id', () => {
      const n1 = graph.addNode();
      const n2 = graph.addNode();
      expect(n1).toBeInstanceOf(Node);
      expect(n2).toBeInstanceOf(Node);
      expect(n1.id).toBe(0);
      expect(n2.id).toBe(1);
      expect(graph.nodes.length).toBe(2);
    });

    it('adds to nodes list', () => {
      const n = graph.addNode();
      expect(graph.nodes).toContain(n);
    });
  });

  describe('addEdge', () => {
    it('creates Edge between Property and Node', () => {
      const s = graph.addNode();
      const o = graph.addNode();
      const p = s.newProp();
      const edge = graph.addEdge(p, o);
      expect(edge).not.toBeNull();
      expect(graph.edges.length).toBe(1);
      expect(edge!.source).toBe(p);
      expect(edge!.target).toBe(o);
    });

    it('creates Edge and new Property when source is Node', () => {
      const s = graph.addNode();
      const o = graph.addNode();
      const edge = graph.addEdge(s, o);
      expect(edge).not.toBeNull();
      expect(graph.edges.length).toBe(1);
      expect(s.properties.length).toBe(1);
    });
  });

  describe('removeNode', () => {
    it('removes node from nodes list', () => {
      const n = graph.addNode();
      expect(graph.nodes).toContain(n);
      n.delete();
      expect(graph.nodes).not.toContain(n);
    });

    it('cascades through edges where node is target', () => {
      const s = graph.addNode();
      const o = graph.addNode();
      const p = s.newProp();
      graph.addEdge(p, o);
      expect(graph.edges.length).toBe(1);
      o.delete();
      expect(graph.edges.length).toBe(0);
    });

    it('clears selected when deleting selected node', () => {
      const n = graph.addNode();
      graph.setSelected(n);
      expect(graph.getSelected()).toBe(n);
      n.delete();
      expect(graph.getSelected()).toBeNull();
    });

    it('unregisters URIs from uriToNode', () => {
      const n = graph.addNode();
      n.addUri('http://example.org/test');
      expect(graph.getNodeByUri('http://example.org/test')).toBe(n);
      n.delete();
      expect(graph.getNodeByUri('http://example.org/test')).toBeNull();
    });
  });

  describe('removeProperty', () => {
    it('removes property from parent node', () => {
      const n = graph.addNode();
      const p = n.newProp();
      expect(n.properties).toContain(p);
      p.delete();
      expect(n.properties).not.toContain(p);
    });

    it('removes associated edges', () => {
      const s = graph.addNode();
      const o = graph.addNode();
      const p = s.newProp();
      graph.addEdge(p, o);
      expect(graph.edges.length).toBe(1);
      p.delete();
      expect(graph.edges.length).toBe(0);
    });

    it('reindexes sibling properties', () => {
      const n = graph.addNode();
      const p0 = n.newProp();
      const p1 = n.newProp();
      const p2 = n.newProp();
      expect(p0.index).toBe(0);
      expect(p1.index).toBe(1);
      expect(p2.index).toBe(2);
      p1.delete();
      expect(p0.index).toBe(0);
      expect(p2.index).toBe(1);
    });
  });

  describe('setSelected', () => {
    it('updates selected resource', () => {
      const n = graph.addNode();
      graph.setSelected(n);
      expect(graph.getSelected()).toBe(n);
    });

    it('clears selected', () => {
      const n = graph.addNode();
      graph.setSelected(n);
      graph.setSelected(null);
      expect(graph.getSelected()).toBeNull();
    });
  });

  describe('reset', () => {
    it('clears all state', () => {
      const n = graph.addNode();
      graph.setSelected(n);
      graph.reset();
      expect(graph.nodes.length).toBe(0);
      expect(graph.edges.length).toBe(0);
      expect(graph.getSelected()).toBeNull();
      expect(graph.usedAliases.size).toBe(0);
    });
  });

  describe('applyDrop', () => {
    it('uri payload creates const node', () => {
      graph.applyDrop({ kind: 'uri', uri: 'http://example.org/A' }, { x: 10, y: 20 });
      expect(graph.nodes.length).toBe(1);
      expect(graph.nodes[0].hasUris()).toBe(true);
      expect(graph.nodes[0].getUri()).toBe('http://example.org/A');
      expect(graph.nodes[0].isVariable()).toBe(false);
    });

    it('uri payload selects the node', () => {
      graph.applyDrop({ kind: 'uri', uri: 'http://example.org/A' }, { x: 10, y: 20 });
      expect(graph.getSelected()).toBe(graph.nodes[0]);
    });

    it('prop payload adds property to selected node', () => {
      const sel = graph.addNode();
      graph.setSelected(sel);
      graph.applyDrop({ kind: 'prop', prop: 'http://example.org/P' }, { x: 0, y: 0 });
      expect(sel.properties.length).toBe(1);
      expect(sel.properties[0].getUri()).toBe('http://example.org/P');
    });

    it('uri+prop creates node and edge', () => {
      const sel = graph.addNode();
      graph.setSelected(sel);
      graph.applyDrop(
        { kind: 'uri+prop', uri: 'http://example.org/B', prop: 'http://example.org/P' },
        { x: 50, y: 60 },
      );
      expect(graph.nodes.length).toBe(2);
      expect(graph.edges.length).toBe(1);
    });

    it('literal adds literal property', () => {
      const sel = graph.addNode();
      graph.setSelected(sel);
      graph.applyDrop({ kind: 'literal', prop: 'http://example.org/P' }, { x: 0, y: 0 });
      expect(sel.properties.length).toBe(1);
      expect(sel.properties[0].isLiteral()).toBe(true);
    });

    it('search creates node with label triple and filters', () => {
      graph.applyDrop(
        { kind: 'search', uri: 'http://example.org/X', alias: 'testVar' },
        { x: 10, y: 10 },
      );
      const node = graph.nodes[0];
      expect(node.variable.alias).toBe('testVar');
      expect(node.properties.length).toBe(1);
      expect(node.properties[0].isLiteral()).toBe(true);
      const litVar = node.properties[0].getLiteral();
      expect(litVar).not.toBeNull();
      expect(litVar?.alias).toBe('testVarLabel');
      expect(litVar?.filters.length).toBe(2);
    });

    it('example creates a canned scenario', () => {
      graph.applyDrop({ kind: 'example', exampleType: 'cats' }, { x: 100, y: 100 });
      expect(graph.nodes.length).toBeGreaterThanOrEqual(2);
      expect(graph.edges.length).toBeGreaterThanOrEqual(1);
    });
  });
});
