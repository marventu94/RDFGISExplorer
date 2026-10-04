import { Component, computed, effect, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
import type { DiscoveryConnections, DiscoveryConnection, DiscoveryPaths, DiscoveryTerm, DiscoveryStep } from '@rdfgis/contracts';
import { TranslatePipe } from '../../core/translate.pipe';
import { DiscoveryApiService } from './discovery-api.service';
import { DiscoveryStateService } from './discovery-state.service';
import { DescribeService } from '../describe-panel/describe.service';
import { ToolService } from '../../tool/tool.service';

@Component({
  selector: 'app-discovery-panel', imports: [FormsModule, TranslatePipe],
  templateUrl: './discovery-panel.component.html', styleUrl: './discovery-panel.component.scss',
})
export class DiscoveryPanelComponent implements OnDestroy {
  readonly state = inject(DiscoveryStateService);
  private readonly api = inject(DiscoveryApiService);
  private readonly describe = inject(DescribeService);
  private readonly tools = inject(ToolService);
  readonly data = signal<DiscoveryConnections | null>(null);
  readonly busy = signal(false);
  readonly error = signal(false);
  readonly filter = signal('');
  readonly direction = signal<'all' | 'out' | 'in'>('all');
  readonly connections = computed(() => (this.data()?.connections ?? []).filter(c =>
    (this.direction() === 'all' || c.direction === this.direction())
    && `${c.predicate} ${c.targetClass ?? ''} ${c.datatype ?? ''}`.toLowerCase().includes(this.filter().toLowerCase())));
  readonly targets = signal<DiscoveryTerm[]>([]);
  readonly paths = signal<DiscoveryPaths | null>(null);
  readonly pathBusy = signal(false);
  readonly pathError = signal(false);
  readonly targetBusy = signal(false);
  readonly targetError = signal(false);
  readonly targetTruncated = signal(false);
  targetText = '';
  targetKind: 'class' | 'property' = 'class';
  readonly values: Record<string, string> = {};
  private connectionSub?: Subscription;
  private targetSub?: Subscription;
  private pathSub?: Subscription;
  constructor() {
    effect(() => { const focus = this.state.focus(); this.load(focus); });
  }
  private load(focus = this.state.focus()): void {
    this.connectionSub?.unsubscribe(); this.pathSub?.unsubscribe();
    this.paths.set(null); this.pathBusy.set(false); this.pathError.set(false);
    this.data.set(null); this.error.set(false); this.busy.set(!!focus);
    if (!focus) return;
    this.connectionSub = this.api.connections(focus).subscribe({
      next: data => { this.data.set(data); this.busy.set(false); },
      error: () => { this.error.set(true); this.busy.set(false); },
    });
  }
  retry(): void { this.load(); }
  local(uri: string): string { return uri.split(/[/#]/).pop() || uri; }
  key(c: DiscoveryConnection): string { return JSON.stringify([c.predicate, c.direction, c.targetClass, c.datatype, c.examples[0]?.kind, c.examples[0]?.lang]); }
  filterValue(c: DiscoveryConnection): void {
    const value = this.values[this.key(c)];
    if (value === undefined || value === '') return;
    this.state.add([c], false, { kind: 'literal', value, datatype: c.datatype });
  }
  inspect(uri: string): void { this.describe.describe(uri); this.tools.active.set('describe'); }
  searchTargets(): void {
    this.targetSub?.unsubscribe(); this.targets.set([]); this.targetError.set(false); this.targetBusy.set(true);
    this.targetSub = this.api.catalog(this.targetKind, this.targetText.trim()).subscribe({
      next: data => { this.targets.set(data.items); this.targetTruncated.set(data.truncated); this.targetBusy.set(false); },
      error: () => { this.targetError.set(true); this.targetBusy.set(false); },
    });
  }
  findPaths(term: DiscoveryTerm): void {
    const focus = this.state.focus();
    if (!focus || term.kind === 'resource') return;
    this.pathSub?.unsubscribe(); this.paths.set(null); this.pathBusy.set(true); this.pathError.set(false);
    this.pathSub = this.api.paths(focus, term.uri, term.kind).subscribe({
      next: data => { this.paths.set(data); this.pathBusy.set(false); },
      error: () => { this.pathError.set(true); this.pathBusy.set(false); },
    });
  }
  pathText(path: DiscoveryStep[]): string { return path.map(s => `${s.direction === 'out' ? '→' : '←'} ${this.local(s.predicate)}${s.targetClass ? ' · ' + this.local(s.targetClass) : ''}`).join(' / '); }
  ngOnDestroy(): void { this.connectionSub?.unsubscribe(); this.targetSub?.unsubscribe(); this.pathSub?.unsubscribe(); }
}
