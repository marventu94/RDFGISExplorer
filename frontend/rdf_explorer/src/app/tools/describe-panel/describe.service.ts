import { Injectable, signal, inject } from '@angular/core';
import { RequestService } from '../../core/request.service';
import { LogService } from '../../core/log.service';
import {
  queryGetProperties,
  queryCountValuesType,
  queryGetPropUri,
  queryGetPropDatatype,
  queryGetPropObject,
  querySearchProperty,
} from '../../core/query.service';
import type { RDFResource } from '../../graph/domain';
import { PropertyGraphService } from '../../graph/property-graph.service';
import { AppConfigService } from '../../core/services/app-config.service';
import type { DescribeConfig } from '../../core/services/app-config.service';

export interface DescribeBucketItem {
  uri: string;
  label?: string;
}

export interface DescribeObjectItem {
  uri: string;
  label?: string;
}

export interface DescribedResource {
  uri: string;
  source: RDFResource | null;
  objects: DescribeBucketItem[];
  datatype: DescribeBucketItem[];
  text: DescribeBucketItem[];
  external: DescribeBucketItem[];
  image: DescribeBucketItem[];
  results: Record<string, unknown[]>;
  getUri(): string;
}

interface CachedResource extends DescribedResource {
  realUri: string;
}

@Injectable({ providedIn: 'root' })
export class DescribeService {
  private readonly request = inject(RequestService);
  private readonly log = inject(LogService);
  private readonly graph = inject(PropertyGraphService);
  private readonly appConfig = inject(AppConfigService);

  private cache: CachedResource[] = [];

  private readonly PROPERTY_PAGE_SIZE = 50;

  private describeCfg(): DescribeConfig {
    return (
      this.appConfig.config()?.describe ?? {
        exclude: [],
        objects: [],
        datatype: [],
        text: [],
        image: [],
        external: [],
      }
    );
  }

  readonly current = signal<DescribedResource | null>(null);
  readonly loading = signal(false);
  readonly hasMoreProperties = signal(false);
  private pending = 0;
  private propertyPage = 0;

  describe(uri: string, source?: RDFResource): void {
    if (!uri) return;

    if (this.current() && this.current()!.uri === uri) return;
    this.load(uri, source ?? undefined);
  }

  next(): void {
    const cur = this.current();
    if (!cur?.source) return;

    const source = cur.source;
    if (source.isVariable() && source.variable.results.length > 0) {
      const results = source.variable.results;
      const i = results.findIndex(el => el.value === cur.uri);
      const nextIdx = i >= 0 ? (i + 1) % results.length : 0;
      this.describe(results[nextIdx].value, source);
    } else if (!source.isVariable()) {
      const nextUri = source.nextUri();
      if (nextUri) this.describe(nextUri, source);
    }
    this.graph.refresh();
  }

  prev(): void {
    const cur = this.current();
    if (!cur?.source) return;

    const source = cur.source;
    if (source.isVariable() && source.variable.results.length > 0) {
      const results = source.variable.results;
      const i = results.findIndex(el => el.value === cur.uri);
      const prevIdx = i > 0 ? i - 1 : results.length - 1;
      this.describe(results[prevIdx].value, source);
    } else if (!source.isVariable()) {
      const prevUri = source.prevUri();
      if (prevUri) this.describe(prevUri, source);
    }
    this.graph.refresh();
  }

  loadMoreProperties(): void {
    const selected = this.current() as CachedResource | null;
    if (!selected) return;

    this.propertyPage++;
    this.loading.set(true);

    const query = queryGetProperties(
      selected.uri,
      this.appConfig.queryContext(),
      this.propertyPage,
      this.PROPERTY_PAGE_SIZE,
    );

    this.request.execQuery(query).then(data => {
      this.processProperties(selected, data.results.bindings);
      this.hasMoreProperties.set(data.results.bindings.length >= this.PROPERTY_PAGE_SIZE);
      this.sort();
      this.checkDone();
    }).catch(() => {
      this.loading.set(false);
      this.pending = 0;
    });
  }

  searchAndLoadProperty(searchText: string): void {
    const selected = this.current() as CachedResource | null;
    if (!selected || !searchText.trim()) return;

    const query = querySearchProperty(
      selected.uri,
      searchText.trim(),
      this.appConfig.queryContext(),
    );

    this.loading.set(true);

    this.request.execQuery(query).then(data => {
      this.processProperties(selected, data.results.bindings);
      this.sort();
      this.checkDone();
    }).catch(() => {
      this.loading.set(false);
      this.pending = 0;
    });
  }

  private load(uriArg: string, sourceObject?: RDFResource): void {
    const realUri = uriArg;
    let uri = uriArg;

    if (uri.includes('prop/direct')) {
      uri = uri.replace('prop/direct', 'entity');
    }

    const cached = this.cache.find(s => s.uri === uri);
    if (cached) {
      this.current.set(cached);
      return;
    }

    this.propertyPage = 0;

    const query = queryGetProperties(
      uri,
      this.appConfig.queryContext(),
      0,
      this.PROPERTY_PAGE_SIZE,
    );
    this.log.add('Describe ' + uri);

    const selected: CachedResource = {
      uri,
      source: sourceObject ?? null,
      objects: [],
      datatype: [],
      text: [],
      external: [],
      image: [],
      results: {},
      getUri() { return this.realUri; },
      realUri,
    };

    this.loading.set(true);
    this.current.set(selected);
    this.pending = 0;

    this.request.execQuery(query).then(data => {
      const bindings = data.results.bindings;
      this.processProperties(selected, bindings);
      this.hasMoreProperties.set(bindings.length >= this.PROPERTY_PAGE_SIZE);
      this.sort();
      this.checkDone();
    }).catch((err: unknown) => {
      this.loading.set(false);
      this.pending = 0;
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[DescribeService] execQuery failed for', uri, ':', msg);
    });

    this.cache.push(selected);
    if (this.cache.length > 10) this.cache.splice(0, 1);
  }

  private processProperties(
    selected: CachedResource,
    bindings: Array<Record<string, { type: string; value: string }>>,
  ): void {
    const cfg = this.describeCfg();
    const properties = bindings.filter(r =>
      !cfg.exclude.includes(r['property'].value),
    );

    for (const r of properties) {
      const obj: DescribeBucketItem = { uri: r['property'].value };
      if (r['propertyLabel']) obj.label = r['propertyLabel'].value;

      if (cfg.image.includes(obj.uri) && !selected.image.some(p => p.uri === obj.uri)) {
        selected.image.push(obj);
        this.loadPropUri(selected, obj.uri);
      } else if (cfg.external.includes(obj.uri) && !selected.external.some(p => p.uri === obj.uri)) {
        selected.external.push(obj);
        this.loadPropUri(selected, obj.uri);
      } else if (cfg.text.includes(obj.uri) && !selected.text.some(p => p.uri === obj.uri)) {
        selected.text.push(obj);
        this.loadDatatype(selected, obj.uri);
      } else if (cfg.objects.includes(obj.uri) || r['kind'].value === '1') {
        if (!selected.objects.some(p => p.uri === obj.uri)) {
          selected.objects.push(obj);
          this.loadObject(selected, obj.uri);
        }
      } else if (cfg.datatype.includes(obj.uri) || r['kind'].value === '2') {
        if (!selected.datatype.some(p => p.uri === obj.uri)) {
          selected.datatype.push(obj);
          this.loadDatatype(selected, obj.uri);
        }
      } else if (r['kind'].value === '0') {
        if (selected.objects.some(p => p.uri === obj.uri) || selected.datatype.some(p => p.uri === obj.uri)) continue;
        this.pending++;
        this.request.execQuery(queryCountValuesType(selected.uri, obj.uri)).then(d => {
          if (d.results.bindings.length > 0) {
            const uriCount = Number(d.results.bindings[0]['uris'].value);
            const litCount = Number(d.results.bindings[0]['lits'].value);
            if (uriCount > litCount) {
              if (!selected.objects.some(p => p.uri === obj.uri)) {
                selected.objects.push(obj);
                this.loadObject(selected, obj.uri);
              }
            } else {
              if (!selected.datatype.some(p => p.uri === obj.uri)) {
                selected.datatype.push(obj);
                this.loadDatatype(selected, obj.uri);
              }
            }
          }
          this.decPending();
        }).catch(() => this.decPending());
      }
    }
  }

  private loadPropUri(selected: CachedResource, prop: string): void {
    this.pending++;
    this.request.execQuery(queryGetPropUri(selected.uri, prop)).then(data => {
      selected.results[prop] = data.results.bindings.map(s => s['uri'].value);
      this.bump();
      this.decPending();
    }).catch(() => this.decPending());
  }

  private loadDatatype(selected: CachedResource, prop: string): void {
    this.pending++;
    this.request.execQuery(queryGetPropDatatype(selected.uri, prop, this.appConfig.queryContext())).then(data => {
      selected.results[prop] = data.results.bindings.map(s => s['lit'].value);
      this.bump();
      this.decPending();
    }).catch(() => this.decPending());
  }

  private loadObject(selected: CachedResource, prop: string): void {
    this.pending++;
    this.request.execQuery(queryGetPropObject(selected.uri, prop, this.appConfig.queryContext())).then(data => {
      selected.results[prop] = data.results.bindings.map(s => {
        const obj: { uri: string; label?: string } = { uri: s['uri'].value };
        if (s['uriLabel']) obj.label = s['uriLabel'].value;
        return obj;
      });
      this.bump();
      this.decPending();
    }).catch(() => this.decPending());
  }

  private checkDone(): void {
    if (this.pending <= 0) {
      this.pending = 0;
      this.loading.set(false);
    }
  }

  private decPending(): void {
    this.pending--;
    this.checkDone();
  }

  private sort(): void {
    const cur = this.current() as CachedResource | null;
    if (!cur) return;
    const cfg = this.describeCfg();
    cur.objects.sort((a, b) => cfg.objects.indexOf(b.uri) - cfg.objects.indexOf(a.uri));
    this.bump();
  }

  private bump(): void {
    const cur = this.current();
    if (cur) this.current.set({ ...cur });
  }
}
