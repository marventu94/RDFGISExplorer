import { Injectable, signal, inject, effect } from '@angular/core';
import { GraphInteractionService } from '../graph/canvas-graph/interaction.service';
import { DescribeService } from '../tools/describe-panel/describe.service';
import { PropertyGraphService } from '../graph/property-graph.service';

export type ToolName = 'describe' | 'edit' | 'sparql' | 'log';

@Injectable({ providedIn: 'root' })
export class ToolService {
  private readonly interaction = inject(GraphInteractionService);
  private readonly describeService = inject(DescribeService);
  private readonly graph = inject(PropertyGraphService);
  readonly active = signal<ToolName | 'none'>('none');

  constructor() {
    effect(() => {
      const req = this.interaction.requestedTool();
      if (!req) return;
      this.active.set(req.tool);
      if (req.tool === 'describe') {
        const uri = req.target.getUri();
        if (uri) this.describeService.describe(uri, req.target);
      }
    });

    effect(() => {
      const selected = this.graph.selected();
      if (!selected) return;
      const uri = selected.getUri();
      if (!uri) return;
      this.active.set('describe');
      this.describeService.describe(uri, selected);
    });
  }

  toggle(name: ToolName): void {
    this.active.update(current => current === name ? 'none' : name);
  }
}
