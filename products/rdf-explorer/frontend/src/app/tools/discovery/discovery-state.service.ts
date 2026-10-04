import { computed, effect, inject, Injectable, signal, untracked } from '@angular/core';
import type { DiscoveryConnection, DiscoveryExample, DiscoveryFocus, DiscoveryStep, DiscoveryTerm } from '@rdfgis/contracts';
import { PropertyGraphService } from '../../graph/property-graph.service';
import { Node } from '../../graph/domain';
import { discoveryFocus } from '../../graph/domain/discovery';
import { RequestService } from '../../core/request.service';
import { ToolService } from '../../tool/tool.service';
import type { ExplorerSerializedGraph } from '../../graph/domain/graph-serializer';

@Injectable({ providedIn: 'root' })
export class DiscoveryStateService {
  readonly graph = inject(PropertyGraphService);
  private readonly tools = inject(ToolService);
  private readonly request = inject(RequestService);
  readonly origin = signal<DiscoveryFocus | null>(null);
  readonly title = signal('');
  readonly source = signal<Node | null>(null);
  readonly steps = signal<DiscoveryStep[]>([]);
  readonly scope = signal<'query' | 'class'>('query');
  readonly classUri = signal<string | null>(null);
  private readonly history = signal<Array<{ before: ExplorerSerializedGraph; after: string }>>([]);
  readonly canUndo = computed(() => {
    this.graph.revision();
    const last = this.history().at(-1);
    return !!last && last.after === JSON.stringify(this.graph.serializeGraph());
  });
  readonly focus = computed<DiscoveryFocus | null>(() => {
    const origin = this.origin();
    if (!origin) return null;
    const base = this.scope() === 'class' && this.classUri() ? { classUri: this.classUri()! } : origin;
    return { ...base, steps: this.steps() };
  });
  constructor() {
    effect(() => {
      this.graph.revision();
      const selected = this.graph.selected();
      untracked(() => {
        if (selected instanceof Node && this.tools.active() === 'discovery') this.selectNode(selected);
        else if (this.source() && !this.graph.nodes().includes(this.source()!)) this.clear();
      });
    });
  }
  private clear(): void { this.source.set(null); this.origin.set(null); this.steps.set([]); }
  selectNode(node: Node): void {
    const focus = discoveryFocus(node);
    if (this.source() === node && JSON.stringify(this.origin()) === JSON.stringify(focus)) return;
    this.source.set(node); this.origin.set(focus); this.steps.set([]);
    this.classUri.set(this.graph.classesFor(node)[0] ?? null);
    this.title.set(node.getRepr() ?? node.variable.get());
  }
  openSelected(): void {
    this.tools.active.set('discovery');
    const node = this.graph.selected();
    if (node instanceof Node) this.selectNode(node);
  }
  explore(term: DiscoveryTerm): void {
    this.source.set(null); this.steps.set([]); this.scope.set('query'); this.classUri.set(null);
    this.origin.set(term.kind === 'class' ? { classUri: term.uri }
      : term.kind === 'property' ? { propertyUri: term.uri } : { uri: term.uri });
    this.title.set(term.label);
    this.tools.active.set('discovery');
  }
  useClass(term: DiscoveryTerm): void {
    this.request.setLabel(term.uri, term.label);
    this.mutate(() => { const node = this.graph.addDiscoveredClass(term.uri); this.selectNode(node); });
    this.tools.active.set('discovery');
  }
  traverse(connection: DiscoveryConnection): void {
    this.steps.update(steps => [...steps, this.asStep(connection)]);
  }
  backTo(index: number): void { this.steps.update(steps => steps.slice(0, index)); }
  asStep(c: DiscoveryStep): DiscoveryStep {
    return { predicate: c.predicate, direction: c.direction, kind: c.kind, targetClass: c.targetClass, datatype: c.datatype };
  }
  add(steps: DiscoveryStep[] = [], optional = false, example?: DiscoveryExample): void {
    const origin = this.origin();
    if (!origin) return;
    const path = [...this.steps(), ...steps.map(s => this.asStep(s))];
    this.mutate(() => {
      let source = this.source();
      if (!source) {
        if (origin.classUri) source = this.graph.addDiscoveredClass(origin.classUri);
        else if (origin.uri) { source = this.graph.addNode(); source.addUri(origin.uri); source.mkConst(); }
        else if (origin.propertyUri) {
          source = this.graph.addNode();
          // Property-use focus makes no assumption about the original object's term kind.
          const object = this.graph.addNode();
          const prop = source.newProp();
          prop.addUri(origin.propertyUri); prop.mkConst();
          this.graph.addEdge(prop, object);
        }
      }
      if (!source) return;
      this.graph.addDiscoveredPath(source, path, optional, example);
      this.steps.set([]);
      const selected = this.graph.selected();
      if (selected instanceof Node) this.selectNode(selected);
      else this.selectNode(source);
    });
  }
  private mutate(fn: () => void): void {
    const before = this.graph.serializeGraph();
    try { fn(); } catch (error) { this.graph.restoreGraph(before); throw error; }
    this.history.update(h => [...h.slice(-19), { before, after: JSON.stringify(this.graph.serializeGraph()) }]);
    this.graph.viewport.set(null);
    this.tools.active.set('discovery');
  }
  undo(): void {
    if (!this.canUndo()) return;
    const last = this.history().at(-1)!;
    this.graph.restoreGraph(last.before);
    this.history.update(h => h.slice(0, -1));
    this.clear();
  }
}
