import { Injectable, signal, inject, effect, untracked } from '@angular/core';
import { GraphInteractionService } from '../graph/canvas-graph/interaction.service';
import { Node } from '../graph/domain';
import { PropertyGraphService } from '../graph/property-graph.service';

export type ToolName = 'edit' | 'sparql' | 'discovery';

@Injectable({ providedIn: 'root' })
export class ToolService {
  private readonly interaction = inject(GraphInteractionService);
  private readonly graph = inject(PropertyGraphService);
  readonly active = signal<ToolName | 'none'>('none');

  constructor() {
    effect(() => {
      const req = this.interaction.requestedTool();
      if (!req) return;
      this.active.set(req.tool === 'describe' ? 'discovery' : req.tool);
      untracked(() => { if (this.graph.selected() !== req.target) this.graph.setSelected(req.target); });
    });

    effect(() => {
      const selected = this.graph.selected();
      if (!selected) return;
      if (!(selected instanceof Node) && !selected.getUri()) return;
      const active = untracked(() => this.active());
      if (active === 'none' || active === 'discovery') this.active.set('discovery');
    });
  }

  toggle(name: ToolName): void {
    this.active.update(current => current === name ? 'none' : name);
  }
}
