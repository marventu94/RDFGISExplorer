import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PropertyGraphService } from './property-graph.service';
import { RequestService } from '../core/request.service';
import { AppConfigService } from '../core/services/app-config.service';
import { Node, Literal } from './domain';
import type { DiscoveryStep } from '@rdfgis/contracts';

const step: DiscoveryStep = { predicate: 'urn:addressFeature', direction: 'out', kind: 'resource', targetClass: 'urn:Address' };
describe('connection drops on the canvas', () => {
  let graph: PropertyGraphService;
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [
      { provide: RequestService, useValue: { labelCache: signal(new Map()), getLabel: vi.fn(), execQuery: vi.fn(), prefetchLabels: vi.fn() } },
      { provide: AppConfigService, useValue: { config: signal(null), defaultPrefixes: signal({}) } },
    ] });
    graph = TestBed.inject(PropertyGraphService);
  });
  it.each(['out', 'in'] as const)('preserves the %s direction and original source when selection changes during a drag', direction => {
    const source = graph.addDiscoveredClass('urn:House');
    const token = graph.prepareConnectionDrag(source, { ...step, direction });
    const other = graph.addNode(); graph.setSelected(other);
    graph.applyDrop({ kind: 'connection', token }, { x: 600, y: 300 });
    expect(graph.selected()).toBe(other);
    const connection = graph.edges().find(edge => edge.source.getUri() === step.predicate)!;
    const target = direction === 'out' ? connection.target : connection.source.parentNode;
    expect(target.variable.get()).toBe('?address');
    expect(target.variable.filters.some(filter => filter.type === 'isresource')).toBe(false);
    expect(graph.classesFor(target)).toEqual([]);
    expect(source.createQuery()!.toSparqlFullProjection()).not.toContain('<urn:Address>');
    expect({ x: target.x, y: target.y }).toEqual({ x: 600, y: 300 });
    const edge = graph.edges().find(edge => edge.source.getUri() === step.predicate)!;
    expect(edge.source.parentNode).toBe(direction === 'out' ? source : target);
    expect(edge.target).toBe(direction === 'out' ? target : source);
    expect(other.properties).toHaveLength(0);
  });
  it('does not add resource filters when dragging an untyped relationship', () => {
    const source = graph.addNode();
    const token = graph.prepareConnectionDrag(source, { ...step, targetClass: undefined });
    graph.applyDrop({ kind: 'connection', token }, { x: 500, y: 200 });
    expect(graph.selected()).toBeNull();
    const target = graph.edges().find(edge => edge.source.getUri() === step.predicate)!.target;
    expect(target.variable.filters).toEqual([]);
    expect(source.createQuery()!.toSparqlFullProjection()).not.toContain('isIRI(');
  });
  it('reuses a compatible branch without moving it or multiplying query joins', () => {
    const source = graph.addDiscoveredClass('urn:House');
    let token = graph.prepareConnectionDrag(source, step);
    graph.applyDrop({ kind: 'connection', token }, { x: 500, y: 200 });
    const target = graph.edges().find(edge => edge.source.getUri() === step.predicate)!.target;
    expect(graph.selected()).toBe(source);
    const count = graph.nodes().length;
    token = graph.prepareConnectionDrag(source, step);
    graph.applyDrop({ kind: 'connection', token }, { x: 900, y: 800 });
    expect(graph.selected()).toBe(source);
    expect(graph.nodes()).toHaveLength(count);
    expect({ x: target.x, y: target.y }).toEqual({ x: 500, y: 200 });
  });
  it('drags a concrete literal as an escaped typed constraint', () => {
    const source = graph.addDiscoveredClass('urn:House');
    const token = graph.prepareConnectionDrag(source, { predicate: 'urn:label', direction: 'out', kind: 'literal' },
      { kind: 'literal', value: 'Casa"\\', lang: 'es' });
    graph.applyDrop({ kind: 'connection', token }, { x: 0, y: 0 });
    expect(graph.selected()).toBe(source);
    expect(source.properties.find(property => property.getUri() === 'urn:label')!.literal).toBeInstanceOf(Literal);
    const query = source.createQuery()!.toSparqlFullProjection();
    expect(query).toContain('Casa\\"\\\\');
    expect(query).toContain('LANG(');
  });
  it('preserves distinct occupation values as constants in the generated query', () => {
    const source = graph.addDiscoveredClass('http://www.wikidata.org/entity/Q5');
    const occupation = { predicate: 'http://www.wikidata.org/prop/direct/P106', direction: 'out' as const, kind: 'resource' as const };
    const ids = ['Q482980', 'Q37226', 'Q49757'];
    const targets: Node[] = [];
    for (const id of ids) {
      const value = `http://www.wikidata.org/entity/${id}`;
      const token = graph.prepareConnectionDrag(source, occupation, { kind: 'uri', value });
      graph.applyDrop({ kind: 'connection', token }, { x: 500, y: 200 });
      expect(graph.selected()).toBe(source);
      const target = graph.edges().find(edge => edge.source.getUri() === occupation.predicate && edge.target.getUri() === value)!.target;
      expect(target.isVariable()).toBe(false);
      expect(target.getUri()).toBe(value);
      targets.push(target);
    }
    expect(new Set(targets).size).toBe(3);
    const query = source.createQuery()!.toSparqlFullProjection();
    for (const id of ids) expect(query).toContain(`<http://www.wikidata.org/entity/${id}>`);
    expect(graph.edges().filter(edge => edge.source.getUri() === occupation.predicate)).toHaveLength(3);
  });
  it('ignores stale drag data after switching graphs, even when node IDs are reused', () => {
    const source = graph.addNode();
    const token = graph.prepareConnectionDrag(source, step);
    graph.reset(); const replacement = graph.addNode();
    expect(replacement.id).toBe(source.id);
    graph.applyDrop({ kind: 'connection', token }, { x: 0, y: 0 });
    expect(graph.nodes()).toEqual([replacement]);
    expect(graph.edges()).toEqual([]);
  });
});
