import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { PropertyGraphService } from '../../property-graph.service';
import { RequestService } from '../../../core/request.service';

function createMockRequestService(): RequestService {
  return {
    labelCache: vi.fn(() => new Map()),
    getLabel: vi.fn(() => undefined),
    setLabel: vi.fn(),
    execQuery: vi.fn(async () => ({ results: { bindings: [] } })),
    getPredicates: vi.fn(async () => []),
  } as unknown as RequestService;
}

describe('Domain model coverage boost', () => {
  let service: PropertyGraphService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        PropertyGraphService,
        { provide: RequestService, useValue: createMockRequestService() },
      ],
    });
    service = TestBed.inject(PropertyGraphService);
  });

  it('Node dimensions and position', () => {
    const n = service.addNode();
    expect(n.getWidth()).toBe(220);
    expect(n.getBaseHeight()).toBe(30);
    expect(n.getHeight()).toBe(30);
    n.setPosition(10, 20);
    expect(n.x).toBe(10);
    expect(n.y).toBe(20);
  });

  it('Node getColor returns based on isVariable', () => {
    const n = service.addNode();
    n.mkVariable();
    expect(n.getColor()).toBe('#2ca02c');
    n.mkConst();
    expect(n.getColor()).toBe('#1f77b4');
  });

  it('Node getPropByUri and literalRelations', () => {
    const n = service.addNode();
    const p = n.newProp();
    p.addUri('http://example.org/prop1');
    expect(n.getPropByUri('http://example.org/prop1')).toBe(p);
    expect(n.getPropByUri('http://example.org/other')).toBeNull();
    expect(n.literalRelations()).toEqual([]);
    p.mkLiteral();
    expect(n.literalRelations()).toContain(p);
  });

  it('Node loadPreview does not throw', () => {
    const n = service.addNode();
    expect(() => n.loadPreview({})).not.toThrow();
  });

  it('Node delete via graph service', () => {
    const n = service.addNode();
    expect(service.nodes().length).toBe(1);
    service.removeNode(n);
    expect(service.nodes().length).toBe(0);
  });

  it('Property dimensions and literal', () => {
    const n = service.addNode();
    const p = n.newProp();
    expect(p.getWidth()).toBe(200);
    expect(p.getHeight()).toBe(20);
    expect(p.getX()).toBe(-100);
    expect(p.isLiteral()).toBe(false);
    const lit = p.mkLiteral();
    expect(lit).not.toBeNull();
    expect(p.isLiteral()).toBe(true);
    expect(p.getLiteral()).toBe(lit!.variable);
  });

  it('Property getColor returns based on type', () => {
    const n = service.addNode();
    const p = n.newProp();
    p.mkVariable();
    expect(p.getColor()).toBe('#d62728');
    p.mkConst();
    expect(p.getColor()).toBe('#ff7f0e');
    p.mkLiteral();
    expect(p.getColor()).toBe('#9467bd');
  });

  it('Property loadPreview does not throw', () => {
    const n = service.addNode();
    const p = n.newProp();
    expect(() => p.loadPreview({})).not.toThrow();
  });

  it('Literal dimensions and path', () => {
    const n = service.addNode();
    const p = n.newProp();
    const lit = p.mkLiteral();
    expect(lit).not.toBeNull();
    expect(lit!.getWidth()).toBe(200);
    expect(lit!.getHeight()).toBe(20);
    expect(lit!.getPath()).toContain('M');
  });

  it('Literal getColor returns based on isVariable', () => {
    const n = service.addNode();
    const p = n.newProp();
    const lit = p.mkLiteral();
    lit!.mkVariable();
    expect(lit!.getColor()).toBe('#2ca02c');
    lit!.mkConst();
    expect(lit!.getColor()).toBe('#1f77b4');
  });

  it('Literal loadPreview does not throw', () => {
    const n = service.addNode();
    const p = n.newProp();
    const lit = p.mkLiteral();
    expect(() => lit!.loadPreview({})).not.toThrow();
  });

  it('RDFResource URI navigation', () => {
    const n = service.addNode();
    n.addUri('http://a.org/1');
    n.addUri('http://a.org/2');
    expect(n.hasUris()).toBe(true);
    expect(n.getUri()).toBe('http://a.org/1');
    expect(n.nextUri()).toBe('http://a.org/2');
    expect(n.getUri()).toBe('http://a.org/2');
    expect(n.prevUri()).toBe('http://a.org/1');
    expect(n.getUri()).toBe('http://a.org/1');
  });

  it('RDFResource removeUri', () => {
    const n = service.addNode();
    n.addUri('http://a.org/1');
    expect(n.removeUri('http://a.org/1')).toBe(true);
    expect(n.hasUris()).toBe(false);
    expect(n.removeUri('http://a.org/1')).toBe(false);
  });

  it('RDFResource createQuery returns null for non-variable', () => {
    const n = service.addNode();
    n.mkConst();
    expect(n.createQuery()).toBeNull();
  });

  it('RDFResource isSelected', () => {
    const n = service.addNode();
    service.setSelected(n);
    expect(n.isSelected()).toBe(true);
    service.setSelected(null);
    expect(n.isSelected()).toBe(false);
  });

  it('Query limit and offset', () => {
    const a = service.addNode();
    const b = service.addNode();
    a.mkVariable();
    service.addEdge(a, b);
    const q = a.createQuery({ limit: 10, offset: 5 });
    expect(q).not.toBeNull();
    const sparql = q!.toSparql()!;
    expect(sparql).toContain('LIMIT 10');
    expect(sparql).toContain('OFFSET 5');
  });

  it('Query addOptLabel', () => {
    const a = service.addNode();
    const b = service.addNode();
    a.mkVariable();
    service.addEdge(a, b);
    const q = a.createQuery()!;
    const lbl = q.addOptLabel(a);
    expect(lbl).not.toBeNull();
    const sparql = q.toSparql()!;
    expect(sparql).toContain('OPTIONAL');
  });

  it('Query selectAll', () => {
    const a = service.addNode();
    const b = service.addNode();
    a.mkVariable();
    service.addEdge(a, b);
    const q = a.createQuery()!;
    q.selectAll();
    expect(q.select.length).toBeGreaterThan(0);
  });

  it('Edge contains resource', () => {
    const a = service.addNode();
    const b = service.addNode();
    const edge = service.addEdge(a, b);
    expect(edge).not.toBeNull();
    expect(edge!.contains(a)).toBe(true);
    expect(edge!.contains(b)).toBe(true);
    const prop = edge!.source;
    expect(edge!.contains(prop)).toBe(true);
  });
});
