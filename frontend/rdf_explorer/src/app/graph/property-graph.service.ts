import { Injectable, signal, computed, inject, effect } from '@angular/core';
import { RequestService } from '../core/request.service';
import { LogService } from '../core/log.service';
import { AppConfigService } from '../core/services/app-config.service';
import type { Prefix } from '../core/services/app-config.service';
import {
  PropertyGraph,
  Node,
  Edge,
  Query,
  RDFResource,
  WikidataAdapter,
  GenericAdapter,
} from './domain';
import type { DropPayload } from './domain';
import type { QueryRetriever } from './domain';
import { serializeGraph, deserializeGraph, type ExplorerSerializedGraph } from './domain/graph-serializer';

@Injectable({ providedIn: 'root' })
export class PropertyGraphService {
  private readonly request = inject(RequestService);
  private readonly log = inject(LogService);
  private readonly appConfig = inject(AppConfigService);

  readonly revision = signal(0);
  readonly viewport = signal<{ zoom: number; pan: { x: number; y: number } } | null>(null);

  private readonly graphRef: PropertyGraph;

  readonly nodes = computed<Node[]>(() => {
    this.revision();
    return [...this.graphRef.nodes];
  });

  readonly edges = computed<Edge[]>(() => {
    this.revision();
    return [...this.graphRef.edges];
  });

  readonly selected = computed<RDFResource | null>(() => {
    this.revision();
    return this.graphRef.selected;
  });

  readonly prefixes = computed<readonly Prefix[]>(() => {
    const p = this.appConfig.defaultPrefixes();
    return Object.entries(p).map(([prefix, uri]) => ({
      prefix,
      uri,
    }));
  });

  constructor() {
    const app = this.appConfig.config();

    const retriever: QueryRetriever = {
      execQuery: (query, opts) =>
        this.request.execQuery(query, opts),
      labelCache: this.request.labelCache(),
    };

    this.graphRef = new PropertyGraph({
      labelUri: app?.labelUri ?? 'http://www.w3.org/2000/01/rdf-schema#label',
      lang: app?.defaults.lang ?? 'en',
      prefixes: this.prefixes() as readonly Prefix[],
      endpointAdapter: app?.supportsWikibaseLabel ? new WikidataAdapter() : new GenericAdapter(),
      labelProvider: this.request,
      retriever,
    });

    this.graphRef.log = (msg: string) => this.log.add(msg);

    effect(() => {
      const cfg = this.appConfig.config();
      if (!cfg) return;
      this.graphRef.labelUri = cfg.labelUri;
      this.graphRef.lang = cfg.defaults.lang;
      this.graphRef.endpointAdapter = cfg.supportsWikibaseLabel
        ? new WikidataAdapter()
        : new GenericAdapter();
    });

    effect(() => {
      const p = this.prefixes();
      this.graphRef.prefixes = p;
    });

    effect(() => {
      retriever.labelCache = this.request.labelCache();
    });
  }

  private bump(): void {
    this.revision.update(v => v + 1);
  }

  refresh(): void {
    this.bump();
  }

  addNode(): Node {
    const node = this.graphRef.addNode();
    this.bump();
    return node;
  }

  addEdge(source: Node | import('./domain').Property, target: Node): Edge | null {
    const edge = this.graphRef.addEdge(source, target);
    this.bump();
    return edge;
  }

  applyDrop(payload: DropPayload, at: { x: number; y: number }): void {
    this.graphRef.applyDrop(payload, at);
    this.bump();
  }

  setSelected(r: RDFResource | null): void {
    this.graphRef.setSelected(r);
    this.bump();
  }

  removeNode(node: Node): void {
    this.graphRef.removeNode(node);
    this.bump();
  }

  removeEdge(edge: Edge): void {
    this.graphRef.removeEdge(edge);
    this.bump();
  }

  reset(): void {
    this.graphRef.reset();
    this.bump();
  }

  getQueriesForGraph(): { queries: Query[]; emptyVars: RDFResource[] } {
    return this.graphRef.getQueriesForGraph();
  }

  getNodeByUri(uri: string): Node | null {
    return this.graphRef.getNodeByUri(uri);
  }

  serializeGraph(): ExplorerSerializedGraph {
    return serializeGraph(this.graphRef);
  }

  restoreGraph(snapshot: ExplorerSerializedGraph): void {
    deserializeGraph(this.graphRef, snapshot);
    this.bump();
    void this.prefetchLabels();
  }

  async prefetchLabels(): Promise<void> {
    const uris = this.collectConstantUris();
    if (uris.length === 0) return;

    const cfg = this.appConfig.config();
    if (!cfg) return;

    try {
      await this.request.prefetchLabels(uris, {
        labelUri: cfg.labelUri,
        lang: cfg.defaults.lang,
        supportsWikibaseLabel: cfg.supportsWikibaseLabel,
      });
    } catch (err) {
      console.error('[PropertyGraphService] prefetchLabels failed:', err);
    } finally {
      this.refresh();
    }
  }

  private collectConstantUris(): string[] {
    const uris = new Set<string>();
    for (const node of this.graphRef.nodes) {
      this.collectResourceUris(node, uris);
      for (const prop of node.properties) {
        this.collectResourceUris(prop, uris);
        if (prop.literal) {
          this.collectResourceUris(prop.literal, uris);
        }
      }
    }
    return [...uris];
  }

  private collectResourceUris(resource: RDFResource, target: Set<string>): void {
    if (resource.isVariable()) return;
    for (const uri of resource.uris) {
      target.add(uri);
    }
  }
}
