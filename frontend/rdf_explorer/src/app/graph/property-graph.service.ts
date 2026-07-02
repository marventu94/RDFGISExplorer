import { Injectable, signal, computed, inject, effect } from '@angular/core';
import { SettingsService } from '../core/settings.service';
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
  private readonly settings = inject(SettingsService);
  private readonly request = inject(RequestService);
  private readonly log = inject(LogService);
  private readonly appConfig = inject(AppConfigService);

  readonly revision = signal(0);

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
    const cfg = this.appConfig.config();
    if (!cfg) return [];
    return Object.entries(cfg.defaultPrefixes).map(([prefix, uri]) => ({
      prefix,
      uri,
    }));
  });

  constructor() {
    const settingsVal = this.settings.app();

    const retriever: QueryRetriever = {
      execQuery: (query, opts) =>
        this.request.execQuery(query, opts),
      labelCache: this.request.labelCache(),
    };

    this.graphRef = new PropertyGraph({
      labelUri: settingsVal.labelUri,
      lang: settingsVal.lang,
      prefixes: this.prefixes() as readonly Prefix[],
      endpointAdapter: settingsVal.wikibaseAdapter ? new WikidataAdapter() : new GenericAdapter(),
      labelProvider: this.request,
      retriever,
    });

    this.graphRef.log = (msg: string) => this.log.add(msg);

    effect(() => {
      const s = this.settings.app();
      this.graphRef.labelUri = s.labelUri;
      this.graphRef.lang = s.lang;
      this.graphRef.endpointAdapter = s.wikibaseAdapter
        ? new WikidataAdapter()
        : new GenericAdapter();
    });

    effect(() => {
      this.graphRef.prefixes = this.prefixes();
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
  }
}
