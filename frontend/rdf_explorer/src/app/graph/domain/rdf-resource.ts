import type { Variable, VariableContext, SparqlBinding } from './variable';
import { Variable as VariableImpl } from './variable';
import type { Prefix } from '../../core/settings.types';
import type { Query } from './query';
import type { IdAllocator } from './id-allocator';
import type { Edge } from './edge';
import type { DomainEndpointAdapter } from './endpoint/adapter';
import type { Node } from './node';
import type { Property } from './property';
import type { Literal } from './literal';
import type { QueryRetriever } from './query';

export interface LabelProvider {
  getLabel(uri: string): string | undefined;
}

export interface GraphContext extends VariableContext {
  ids: IdAllocator;
  labelUri: string;
  lang: string;
  prefixes: readonly Prefix[];
  endpointAdapter: DomainEndpointAdapter;
  labelProvider: LabelProvider;
  edges: Edge[];
  retriever?: QueryRetriever;

  getSelected(): RDFResource | null;
  setSelected(r: RDFResource | null): void;
  createQuery(seed: RDFResource, opts?: { limit?: number; offset?: number }): Query | null;
  addNodeToList(node: Node): void;
  registerUriNode(uri: string, node: Node): void;
  unregisterUriNode(uri: string): void;
  removeNodeFromGraph(node: Node): void;
  removeProperty(prop: Property): void;
  loadNodePreview(node: Node, config: Record<string, unknown>): void;
  loadPropertyPreview(prop: Property, config: Record<string, unknown>): void;
  loadLiteralPreview(lit: Literal, config: Record<string, unknown>): void;

  addEdgeToList(edge: Edge): void;
}

const EMPTY_VARS = { varResCounter: 0, varPropCounter: 0, varUnboundCounter: 0 };

export abstract class RDFResource {
  isVar = true;
  variable: Variable;
  uris: string[] = [];
  cur = -1;
  star = false;
  hide = false;
  x = 0;
  y = 0;
  id!: string | number;

  constructor(protected readonly ctx: GraphContext | null) {
    const vars = ctx?.ids ?? EMPTY_VARS;
    this.variable = new VariableImpl(
      (ctx as unknown as VariableContext) ?? { usedAliases: new Set(), log: () => {} },
      this,
      vars,
    );
  }

  protected requireCtx(): GraphContext {
    if (!this.ctx) throw new Error('Resource created without context');
    return this.ctx;
  }

  mkVariable(): void {
    this.ctx?.log('Resource is now a variable');
    this.isVar = true;
  }

  mkConst(): void {
    this.ctx?.log('Resource is now a constant');
    this.isVar = false;
  }

  isVariable(): boolean {
    return this.isVar;
  }

  getUri(): string | null {
    if (this.cur >= 0) return this.uris[this.cur] ?? null;
    return null;
  }

  nextUri(): string | null {
    if (this.cur < 0) return null;
    this.cur = (this.cur + 1) % this.uris.length;
    return this.getUri();
  }

  prevUri(): string | null {
    if (this.cur < 0) return null;
    this.cur = this.cur === 0 ? this.uris.length - 1 : this.cur - 1;
    return this.getUri();
  }

  hasUris(): boolean {
    return this.uris.length > 0;
  }

  addUri(uri: string): boolean {
    if (this.uris.indexOf(uri) < 0) {
      this.ctx?.log('Adding uri to resource (' + uri + ')');
      this.uris.push(uri);
      if (this.uris.length === 1) this.cur = 0;
      return true;
    }
    return false;
  }

  removeUri(uri: string): boolean {
    const i = this.uris.indexOf(uri);
    if (i < 0) return false;
    this.uris.splice(i, 1);
    if (this.uris.length === 0) {
      this.cur = -1;
    } else if (this.cur === i) {
      this.nextUri();
    }
    return true;
  }

  getRepr(): string | null {
    if (this.isVariable()) return this.variable.get();
    if (this.hasUris()) {
      if (this.uris.length === 1) {
        const label = this.labelOf(this.uris[0]);
        if (this.star) return label + '*';
        else return label;
      } else {
        const uri = this.getUri();
        if (!uri) return null;
        const label = this.labelOf(uri);
        if (this.star) return '(' + (this.cur + 1) + '/' + this.uris.length + ') ' + label + '*';
        else return '(' + (this.cur + 1) + '/' + this.uris.length + ') ' + label;
      }
    }
    return null;
  }

  isSelected(): boolean {
    return this.ctx?.getSelected() === this;
  }

  createQuery(opts?: { limit?: number; offset?: number }): Query | null {
    if (!this.isVariable()) return null;
    return this.ctx?.createQuery(this, opts) ?? null;
  }

  hasResults(): boolean {
    return this.variable.results.length > 0;
  }

  getResult(): SparqlBinding | undefined {
    return this.variable.results[0];
  }

  labelOf(uri: string): string {
    const cached = this.ctx?.labelProvider.getLabel(uri);
    if (cached !== undefined) return cached;
    const prefixes = this.ctx?.prefixes;
    if (!prefixes) return '<' + uri + '>';
    return curieLocal(uri, prefixes)[0];
  }
}

export function curieLocal(uri: string, prefixes: readonly Prefix[]): [string, Prefix | null] {
  for (const p of prefixes) {
    if (uri.startsWith(p.uri)) {
      return [p.prefix + ':' + uri.slice(p.uri.length), p];
    }
  }
  return ['<' + uri + '>', null];
}
