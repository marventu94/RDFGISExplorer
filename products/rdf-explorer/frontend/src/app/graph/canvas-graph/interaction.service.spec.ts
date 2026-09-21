import { describe, it, expect, beforeEach } from 'vitest';
import { GraphInteractionService } from './interaction.service';

describe('GraphInteractionService', () => {
  let service: GraphInteractionService;

  beforeEach(() => {
    service = new GraphInteractionService();
  });

  it('starts with null requestedTool', () => {
    expect(service.requestedTool()).toBeNull();
  });

  it('accepts a describe request', () => {
    const resource = { id: 1 } as any;
    service.requestedTool.set({ tool: 'describe', target: resource });
    expect(service.requestedTool()).toEqual({ tool: 'describe', target: resource });
  });

  it('accepts an edit request', () => {
    const resource = { id: 2 } as any;
    service.requestedTool.set({ tool: 'edit', target: resource });
    expect(service.requestedTool()).toEqual({ tool: 'edit', target: resource });
  });
});
