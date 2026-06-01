import { RDFResource, type GraphContext, type LabelProvider } from './rdf-resource';
import type { VariableContext } from './variable';
import { Node } from './node';
import { Property } from './property';
import { Literal } from './literal';
import { Edge } from './edge';
import { Query } from './query';
import type { QueryRetrieveConfig, QueryRetriever } from './query';
import { IdAllocator } from './id-allocator';
import type { FilterType, FilterMetadata } from './filter';
import type { DomainEndpointAdapter } from './endpoint/adapter';
import { WikidataAdapter } from './endpoint/wikidata-adapter';
import { GenericAdapter } from './endpoint/generic-adapter';
import type { Prefix } from '../../core/settings.types';
import type { DropPayload } from './drop-payload';
import { createCatsExample, createW3cExample, createMosquitoExample, createCancerExample } from './examples/canned-examples';

export const NODE_WIDTH = 220;
export const CHILD_WIDTH = 200;
export const NODE_BASE_HEIGHT = 30;
export const CHILD_HEIGHT = 20;
export const PADDING = 10;

export interface FilterCatalog {
  text: FilterMetadata;
  lang: FilterMetadata;
  regex: FilterMetadata;
  leq: FilterMetadata;
  geq: FilterMetadata;
  datefrom: FilterMetadata;
  dateto: FilterMetadata;
}

export interface Colors {
  rConst: string;
  rVar: string;
  pConst: string;
  pVar: string;
  pLit: string;
}

export class PropertyGraph implements GraphContext, VariableContext, LabelProvider {
  readonly nodes: Node[] = [];
  readonly edges: Edge[] = [];
  selected: RDFResource | null = null;
  ids = new IdAllocator();
  readonly usedAliases = new Set<string>();
  readonly uriToNode = new Map<string, Node>();

  readonly filterCatalog: FilterCatalog = {
    text: { name: 'contains', inputs: 1, data: { keyword: { type: 'text' } } },
    lang: { name: 'language', inputs: 1, data: { language: { type: 'text' } } },
    regex: { name: 'regex', inputs: 1, data: { regex: { type: 'text' } } },
    leq: { name: 'less than', inputs: 1, data: { number: { type: 'number' } } },
    geq: { name: 'more than', inputs: 1, data: { number: { type: 'number' } } },
    datefrom: { name: 'date from', inputs: 2, data: { date: { type: 'date' }, granularity: { type: 'select', options: [{ value: 'day', label: 'Day' }, { value: 'month', label: 'Month' }, { value: 'year', label: 'Year' }] } } },
    dateto: { name: 'date to', inputs: 2, data: { date: { type: 'date' }, granularity: { type: 'select', options: [{ value: 'day', label: 'Day' }, { value: 'month', label: 'Month' }, { value: 'year', label: 'Year' }] } } },
  };

  readonly colors: Colors = {
    rConst: '#1f77b4',
    rVar: '#2ca02c',
    pConst: '#ff7f0e',
    pVar: '#d62728',
    pLit: '#9467bd',
  };

  endpointAdapter: DomainEndpointAdapter;
  labelUri: string;
  lang: string;
  prefixes: readonly Prefix[];
  labelProvider: LabelProvider;
  retriever!: QueryRetriever;

  constructor(opts: {
    labelUri?: string;
    lang?: string;
    prefixes?: readonly Prefix[];
    endpointAdapter?: DomainEndpointAdapter;
    labelProvider?: LabelProvider;
    retriever?: QueryRetriever;
  } = {}) {
    this.labelUri = opts.labelUri ?? 'http://www.w3.org/2000/01/rdf-schema#label';
    this.lang = opts.lang ?? 'en';
    this.prefixes = opts.prefixes ?? [];
    this.labelProvider = opts.labelProvider ?? this;
    this.retriever = opts.retriever!;
    this.endpointAdapter = opts.endpointAdapter ?? new WikidataAdapter();
  }

  getLabel(uri: string): string | undefined {
    return undefined;
  }

  log(msg: string): void {
    // Logs handled by wrapping service
  }

  getSelected(): RDFResource | null {
    return this.selected;
  }

  setSelected(r: RDFResource | null): void {
    this.selected = r;
  }

  setRetriever(retriever: QueryRetriever): void {
    this.retriever = retriever;
  }

  // --- GraphContext methods ---

  addNodeToList(node: Node): void {
    this.nodes.push(node);
  }

  registerUriNode(uri: string, node: Node): void {
    this.uriToNode.set(uri, node);
  }

  unregisterUriNode(uri: string): void {
    this.uriToNode.delete(uri);
  }

  removeNodeFromGraph(node: Node): void {
    for (let i = this.edges.length - 1; i >= 0; i--) {
      const edge = this.edges[i];
      if (edge.target === node) {
        const tmp = this.edges.filter(e => e.source === edge.source);
        if (tmp.length === 1) {
          tmp[0].source.delete();
        } else {
          this.edges.splice(i, 1);
        }
      }
    }

    for (const prop of [...node.properties]) {
      for (let i = this.edges.length - 1; i >= 0; i--) {
        if (this.edges[i].source === prop) {
          this.edges.splice(i, 1);
        }
      }
    }

    for (const uri of node.uris) {
      this.uriToNode.delete(uri);
    }

    if (this.selected === node) {
      this.selected = null;
    } else {
      for (const p of node.properties) {
        if (this.selected === p) this.selected = null;
      }
    }

    const idx = this.nodes.indexOf(node);
    if (idx >= 0) {
      this.nodes.splice(idx, 1);
    }
  }

  removeProperty(prop: Property): void {
    for (let i = this.edges.length - 1; i >= 0; i--) {
      if (this.edges[i].source === prop) {
        this.edges.splice(i, 1);
      }
    }

    const i = prop.parentNode.properties.indexOf(prop);
    prop.parentNode.properties.splice(i, 1);
    for (let j = i; j < prop.parentNode.properties.length; j++) {
      prop.parentNode.properties[j].index -= 1;
    }

    if (this.selected === prop) {
      this.selected = null;
    }
  }

  addEdgeToList(edge: Edge): void {
    // TODO: duplicate edges are not deduplicated (preserved legacy behavior)
    this.edges.push(edge);
  }

  loadNodePreview(node: Node, config: Record<string, unknown>): void {
    const q = node.createQuery();
    if (!q) return;
    if (typeof config['limit'] === 'number') q.limit = config['limit'] as number;
    if (typeof config['offset'] === 'number') q.offset = config['offset'] as number;
    if (this.endpointAdapter.loadNodePreview) {
      this.endpointAdapter.loadNodePreview(this, node, q, config);
    } else {
      if (config['varFilter']) {
        const label = q.addLabel(node);
        if (label) {
          label.variable.addFilter('regex', { regex: config['varFilter'] as string }, this);
        }
      } else {
        q.addOptLabel(node);
      }
      q.retrieve(config);
    }
  }

  loadPropertyPreview(prop: Property, config: Record<string, unknown>): void {
    const q = prop.createQuery();
    if (!q) return;
    if (typeof config['limit'] === 'number') q.limit = config['limit'] as number;
    if (typeof config['offset'] === 'number') q.offset = config['offset'] as number;
    if (this.endpointAdapter.loadPropertyPreview) {
      this.endpointAdapter.loadPropertyPreview(this, prop, q, config);
    } else {
      q.retrieve(config);
    }
  }

  loadLiteralPreview(lit: Literal, config: Record<string, unknown>): void {
    const q = lit.createQuery();
    if (!q) return;
    if (typeof config['limit'] === 'number') q.limit = config['limit'] as number;
    if (typeof config['offset'] === 'number') q.offset = config['offset'] as number;
    if (this.endpointAdapter.loadLiteralPreview) {
      this.endpointAdapter.loadLiteralPreview(this, lit, q, config);
    } else {
      q.retrieve(config);
    }
  }

  createQuery(seed: RDFResource, opts?: { limit?: number; offset?: number }): Query | null {
    const q = new Query(this, seed);
    if (q.triples.length === 0) return null;
    if (opts?.limit) q.limit = opts.limit;
    if (opts?.offset) q.offset = opts.offset;
    return q;
  }

  // --- Public API ---

  addNode(): Node {
    return new Node(this);
  }

  addEdge(source: Node | Property, target: Node): Edge | null {
    if (source instanceof Property) {
      const edge = new Edge(source, target);
      this.addEdgeToList(edge);
      this.log('New edge from property id ' + source.id + ' to node id ' + target.id);
      return edge;
    }
    if (source instanceof Node) {
      const edge = new Edge(source.newProp(), target);
      this.addEdgeToList(edge);
      this.log('New edge via new property to node id ' + target.id);
      return edge;
    }
    return null;
  }

  getNodeByUri(uri: string): Node | null {
    return this.uriToNode.get(uri) ?? null;
  }

  removeNode(node: Node): void {
    node.delete();
  }

  removeEdge(edge: Edge): void {
    const idx = this.edges.indexOf(edge);
    if (idx >= 0) {
      this.edges.splice(idx, 1);
      if (this.selected === (edge as unknown as RDFResource)) {
        this.selected = null;
      }
    }
  }

  applyDrop(payload: DropPayload, at: { x: number; y: number }): void {
    switch (payload.kind) {
      case 'example':
        this.applyExampleDrop(payload.exampleType, at);
        break;
      case 'uri': {
        let d = this.getNodeByUri(payload.uri);
        if (!d) {
          d = this.addNode();
          if (payload.uri) {
            d.addUri(payload.uri);
            d.mkConst();
          }
        }
        d.setPosition(at.x, at.y);
        this.setSelected(d);
        break;
      }
      case 'uri+prop': {
        let d = this.getNodeByUri(payload.uri);
        if (!d) {
          d = this.addNode();
          if (payload.uri) {
            d.addUri(payload.uri);
            d.mkConst();
          }
        }
        d.setPosition(at.x, at.y);

        const sel = this.getSelected();
        if (sel instanceof Node) {
          let p = sel.getPropByUri(payload.prop);
          if (!p) {
            p = sel.newProp();
            p.addUri(payload.prop);
            p.mkConst();
          }
          this.addEdge(p, d);
          this.setSelected(sel);
        } else {
          this.setSelected(d);
        }
        break;
      }
      case 'prop': {
        const sel = this.getSelected();
        if (sel instanceof Node) {
          let p = sel.getPropByUri(payload.prop);
          if (!p) {
            p = sel.newProp();
            p.addUri(payload.prop);
            p.mkConst();
          }
          const target = this.addNode();
          target.setPosition(at.x, at.y);
          target.mkVariable();
          this.addEdge(p, target);
          this.setSelected(sel);
        }
        break;
      }
      case 'literal': {
        const sel = this.getSelected();
        if (sel instanceof Node) {
          const selNode = sel;
          let p = selNode.getPropByUri(payload.prop);
          if (!p) {
            p = selNode.newProp();
            p.addUri(payload.prop);
            p.mkConst();
          }
          p.mkLiteral();
        }
        break;
      }
      case 'search': {
        let d = this.getNodeByUri(payload.uri);
        if (!d) {
          d = this.addNode();
          if (payload.uri) {
            d.addUri(payload.uri);
            d.mkConst();
          }
        }
        d.setPosition(at.x, at.y);

        d.variable.setAlias(payload.alias, this);
        const p = d.newProp();
        p.addUri('http://www.w3.org/2000/01/rdf-schema#label');
        p.mkConst();
        p.mkLiteral();
        const litVar = p.getLiteral();
        if (litVar) {
          litVar.setAlias(payload.alias + 'Label', this);
          litVar.addFilter('lang', { language: 'en' }, this);
          litVar.addFilter('text', { keyword: payload.alias }, this);
        }
        this.setSelected(d);
        break;
      }
    }
  }

  private applyExampleDrop(
    type: 'cats' | 'w3c' | 'mosquito' | 'cancer',
    at: { x: number; y: number },
  ): void {
    switch (type) {
      case 'cats':
        createCatsExample(this, at.x, at.y);
        break;
      case 'w3c':
        createW3cExample(this, at.x, at.y);
        break;
      case 'mosquito':
        createMosquitoExample(this, at.x, at.y);
        break;
      case 'cancer':
        createCancerExample(this, at.x, at.y);
        break;
    }
  }

  reset(): void {
    this.selected = null;
    this.nodes.length = 0;
    this.edges.length = 0;
    this.ids = new IdAllocator();
    this.usedAliases.clear();
    this.uriToNode.clear();
  }

  getQueriesForGraph(): { queries: Query[]; emptyVars: RDFResource[] } {
    const queries: Query[] = [];
    const emptyVars: RDFResource[] = [];
    const visited = new Set<RDFResource>();

    for (const node of this.nodes) {
      if (node.isVariable() && !visited.has(node)) {
        const q = new Query(this, node);
        if (q.triples.length === 0) {
          emptyVars.push(node);
        } else {
          queries.push(q);
          for (const dep of q.dep) {
            visited.add(dep);
          }
        }
      }
    }

    return { queries, emptyVars };
  }
}
