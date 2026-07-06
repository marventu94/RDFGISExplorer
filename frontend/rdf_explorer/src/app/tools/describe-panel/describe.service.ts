import { Injectable, signal, inject } from '@angular/core';
import { RequestService } from '../../core/request.service';
import { SettingsService } from '../../core/settings.service';
import { LogService } from '../../core/log.service';
import {
  queryGetProperties,
  queryCountValuesType,
  queryGetPropUri,
  queryGetPropDatatype,
  queryGetPropObject,
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
  private readonly settings = inject(SettingsService);
  private readonly log = inject(LogService);
  private readonly graph = inject(PropertyGraphService);
  private readonly appConfig = inject(AppConfigService);

  private cache: CachedResource[] = [];

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

    const query = queryGetProperties(uri, this.settings.queryContext());
    this.log.add('Describe ' + uri + ' | wikibase=' + this.settings.queryContext().wikibaseAdapter);
    console.debug('[DescribeService] load:', uri);
    console.debug('[DescribeService] query:\n', query);

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

    this.current.set(selected);

    this.request.execQuery(query).then(data => {
      const cfg = this.describeCfg();
      const properties = data.results.bindings.filter(r =>
        !cfg.exclude.includes(r['property'].value),
      );

      for (const r of properties) {
        const obj: DescribeBucketItem = { uri: r['property'].value };
        if (r['propertyLabel']) obj.label = r['propertyLabel'].value;

        if (cfg.image.includes(obj.uri)) {
          selected.image.push(obj);
          this.loadPropUri(selected, obj.uri);
        } else if (cfg.external.includes(obj.uri)) {
          selected.external.push(obj);
          this.loadPropUri(selected, obj.uri);
        } else if (cfg.text.includes(obj.uri)) {
          selected.text.push(obj);
          this.loadDatatype(selected, obj.uri);
        } else if (cfg.objects.includes(obj.uri) || r['kind'].value === '1') {
          selected.objects.push(obj);
          this.loadObject(selected, obj.uri);
        } else if (cfg.datatype.includes(obj.uri) || r['kind'].value === '2') {
          selected.datatype.push(obj);
          this.loadDatatype(selected, obj.uri);
        } else if (r['kind'].value === '0') {
          this.request.execQuery(queryCountValuesType(selected.uri, obj.uri)).then(d => {
            if (d.results.bindings.length > 0) {
              const uriCount = Number(d.results.bindings[0]['uris'].value);
              const litCount = Number(d.results.bindings[0]['lits'].value);
              if (uriCount > litCount) {
                selected.objects.push(obj);
                this.loadObject(selected, obj.uri);
              } else {
                selected.datatype.push(obj);
                this.loadDatatype(selected, obj.uri);
              }
            }
          });
        }
      }
      this.sort();
    }).catch((err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[DescribeService] execQuery failed for', uri, ':', msg);
      console.error('[DescribeService] failed query:\n', query);
    });

    this.cache.push(selected);
    if (this.cache.length > 10) this.cache.splice(0, 1);
  }

  private loadPropUri(selected: CachedResource, prop: string): void {
    this.request.execQuery(queryGetPropUri(selected.uri, prop)).then(data => {
      selected.results[prop] = data.results.bindings.map(s => s['uri'].value);
      this.bump();
    });
  }

  private loadDatatype(selected: CachedResource, prop: string): void {
    this.request.execQuery(queryGetPropDatatype(selected.uri, prop, this.settings.queryContext())).then(data => {
      selected.results[prop] = data.results.bindings.map(s => s['lit'].value);
      this.bump();
    });
  }

  private loadObject(selected: CachedResource, prop: string): void {
    this.request.execQuery(queryGetPropObject(selected.uri, prop, this.settings.queryContext())).then(data => {
      selected.results[prop] = data.results.bindings.map(s => {
        const obj: { uri: string; label?: string } = { uri: s['uri'].value };
        if (s['uriLabel']) obj.label = s['uriLabel'].value;
        return obj;
      });
      this.bump();
    });
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
