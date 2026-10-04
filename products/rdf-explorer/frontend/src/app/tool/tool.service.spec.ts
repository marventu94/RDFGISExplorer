import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ToolService } from './tool.service';
import { GraphInteractionService } from '../graph/canvas-graph/interaction.service';
import { PropertyGraphService } from '../graph/property-graph.service';
import { PropertyGraph, type RDFResource } from '../graph/domain';

describe('unified explorer routing', () => {
  let tools: ToolService;
  let interaction: GraphInteractionService;
  let selected: ReturnType<typeof signal<RDFResource | null>>;
  beforeEach(() => {
    selected = signal<RDFResource | null>(null);
    TestBed.configureTestingModule({ providers: [
      { provide: PropertyGraphService, useValue: { selected, setSelected: vi.fn((target: RDFResource) => selected.set(target)) } },
    ] });
    tools = TestBed.inject(ToolService);
    interaction = TestBed.inject(GraphInteractionService);
    TestBed.tick();
  });
  it('opens one explorer for concrete resources and variables', () => {
    const graph = new PropertyGraph();
    const variable = graph.addNode(); selected.set(variable); TestBed.tick();
    expect(tools.active()).toBe('discovery');
    const concrete = graph.addNode(); concrete.addUri('urn:listing'); concrete.mkConst();
    selected.set(concrete); TestBed.tick();
    expect(tools.active()).toBe('discovery');
  });
  it('routes the legacy describe context action into the explorer without locking selection', () => {
    const graph = new PropertyGraph();
    const first = graph.addNode(); const second = graph.addNode();
    interaction.requestedTool.set({ tool: 'describe', target: first }); TestBed.tick();
    expect(tools.active()).toBe('discovery');
    expect(selected()).toBe(first);
    selected.set(second); TestBed.tick();
    expect(selected()).toBe(second);
  });
  it('preserves the editor and query tabs while selection changes', () => {
    tools.toggle('edit');
    selected.set(new PropertyGraph().addNode()); TestBed.tick();
    expect(tools.active()).toBe('edit');
    tools.toggle('sparql');
    selected.set(new PropertyGraph().addNode()); TestBed.tick();
    expect(tools.active()).toBe('sparql');
  });
});
