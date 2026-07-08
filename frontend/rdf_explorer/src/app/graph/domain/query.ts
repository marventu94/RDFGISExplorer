import { RDFResource, curieLocal } from './rdf-resource';
import type { GraphContext } from './rdf-resource';
import { Variable } from './variable';
import { Filter } from './filter';
import { Node } from './node';
import { Property } from './property';
import { Literal } from './literal';
import type { SparqlBinding } from './variable';
import type { Prefix } from '../../core/services/app-config.service';

export interface QueryRetrieveConfig {
  canceller?: AbortSignal;
  callback?: () => void;
  onError?: (error: unknown) => void;
  varFilter?: string;
  limit?: number;
  offset?: number;
  appendResults?: boolean;
}

export interface QueryRetriever {
  execQuery(query: string, opts?: { signal?: AbortSignal }): Promise<{ results: { bindings: Array<Record<string, SparqlBinding>> } }>;
  labelCache: ReadonlyMap<string, string>;
}

export class Query {
  select: RDFResource[] = [];
  triples: RDFResource[][] = [];
  optionals: RDFResource[][][] = [];
  dep = new Set<RDFResource>();
  limit = 0;
  offset = 0;
  private cache: string | null = null;

  constructor(
    private readonly ctx: GraphContext,
    resource: RDFResource,
  ) {
    this.select = [resource];
    this.update(resource);
  }

  update(resource: RDFResource): void {
    const dep = new Set<RDFResource>();
    const queue: RDFResource[] = [];
    const triples: RDFResource[][] = [];
    const optTriples: RDFResource[][] = [];

    const enqueue = (x: RDFResource): boolean => {
      if (x.isVariable() && !dep.has(x)) {
        dep.add(x);
        queue.push(x);
        return true;
      }
      return false;
    };

    const addTriple = (s: RDFResource, p: RDFResource, o: RDFResource): boolean => {
      if (triples.some(e => e[0] === s && e[1] === p && e[2] === o))
        return false;
      if (optTriples.some(e => e[0] === s && e[1] === p && e[2] === o))
        return false;
      if (p.optional) {
        optTriples.push([s, p, o]);
      } else {
        triples.push([s, p, o]);
      }
      [s, p, o].forEach(r => { enqueue(r); });
      return true;
    };

    const addEdgeTriple = (e: { source: Property; target: Node }): void => {
      addTriple(e.source.parentNode, e.source, e.target);
    };

    enqueue(resource);

    while (queue.length > 0) {
      const cur = queue.pop()!;
      if (cur instanceof Node) {
        const node = cur as Node;
        this.ctx.edges
          .filter(e => e.source.parentNode === node || e.target === node)
          .forEach(e => { addEdgeTriple(e); });
        node.literalRelations().forEach(r => { addTriple(node, r, r.literal!); });
      } else if (cur instanceof Property) {
        const prop = cur as Property;
        if (prop.isLiteral()) {
          addTriple(prop.parentNode, prop, prop.literal!);
        } else {
          this.ctx.edges
            .filter(e => e.source === prop)
            .forEach(e => { addEdgeTriple(e); });
        }
      } else if (cur instanceof Literal) {
        const lit = cur as Literal;
        addTriple(lit.parent.parentNode, lit.parent, lit);
      }
    }
    this.dep = dep;
    this.triples = triples;
    this.optionals = optTriples.map(t => [t]);
    this.cache = null;
  }

  toSparql(): string | null {
    if (this.cache) return this.cache;
    if (this.triples.length === 0) return null;
    const self = this;
    const values = new Set<RDFResource>();
    const prefixes = new Set<Prefix>();

    const writeTriple = (t: RDFResource[]): string => {
      return t.map(r => {
        if (r.isVariable()) return String(r.variable);
        else {
          if (r.uris.length === 1) {
            if (r instanceof Literal) {
              return '"' + r.getUri() + '"';
            } else {
              const uri = r.getUri()!;
              const [curie, pre] = curieLocal(uri, this.ctx.prefixes);
              if (pre) prefixes.add(pre);
              if (r.star) return curie + '*';
              else return curie;
            }
          } else {
            if (r instanceof Property) {
              const txt = '(' + r.uris.map(u => {
                const [c, pre] = curieLocal(u, this.ctx.prefixes);
                if (pre) prefixes.add(pre);
                return c;
              }).join('|') + ')';
              if (r.star) return txt + '*';
              else return txt;
            } else {
              values.add(r);
              return String(r.variable);
            }
          }
        }
      }).join(' ') + ' .\n';
    };

    const labelSvc = this.ctx.endpointAdapter.labelService?.(this.ctx.lang) ?? null;
    const selectVars = [...new Set(self.select.filter(r => !r.hide).map(r => String(r.variable)))];
    const selectWithLabels = labelSvc
      ? [...new Set([...selectVars, ...selectVars.filter(v => !v.endsWith('Label')).map(v => v + 'Label')])]
      : selectVars;
    let q = 'SELECT DISTINCT ' + selectWithLabels.join(' ') + ' WHERE {\n';

    self.triples.forEach(t => {
      q += '  ' + writeTriple(t);
      const allFilters: Filter[] = [];
      t.filter(r => r.isVariable()).forEach(r => {
        r.variable.filters.forEach(f => allFilters.push(f));
      });
      allFilters.forEach(f => { q += '  ' + f.serialize(this.ctx.endpointAdapter); });
      if (t[1].isVariable() && t[2].isVariable()) {
        const nf = t[2] instanceof Literal
          ? new Filter(t[2].variable, 'isliteral', {})
          : new Filter(t[2].variable, 'isuri', {});
        q += '  ' + nf.serialize(this.ctx.endpointAdapter);
      }
    });

    self.optionals.forEach(opt => {
      q += '  OPTIONAL {\n';
      opt.forEach(t => {
        q += '    ' + writeTriple(t);
        const allFilters: Filter[] = [];
        t.filter(r => r.isVariable()).forEach(r => {
          r.variable.filters.forEach(f => allFilters.push(f));
        });
        allFilters.forEach(f => { q += '    ' + f.serialize(this.ctx.endpointAdapter); });
        if (t[1].isVariable() && t[2].isVariable()) {
          const nf = t[2] instanceof Literal
            ? new Filter(t[2].variable, 'isliteral', {})
            : new Filter(t[2].variable, 'isuri', {});
          q += '    ' + nf.serialize(this.ctx.endpointAdapter);
        }
      });
      q += '  }\n';
    });

    for (const v of values) {
      q += '  VALUES ' + String(v.variable) + ' {';
      const parent = (v as unknown as Literal).parent;
      const mapped = parent
        ? v.uris.map(u => { return '"' + u + '"'; })
        : v.uris.map(u => {
            const [c, pre] = curieLocal(u, this.ctx.prefixes);
            if (pre) prefixes.add(pre);
            return c;
          });
      q += mapped.join(' ') + '}\n';
    }

    if (labelSvc) {
      q += '  ' + labelSvc + '\n';
      for (const p of this.ctx.prefixes) {
        if (p.prefix === 'wikibase' || p.prefix === 'bd') {
          prefixes.add(p);
        }
      }
    }

    q += '}';
    if (self.limit) q += ' LIMIT ' + self.limit;
    if (self.offset) q += ' OFFSET ' + self.offset;

    let h = '';
    for (const p of prefixes) {
      h += 'PREFIX ' + p.prefix + ': <' + p.uri + '>\n';
    }
    q = h + q;
    this.cache = q;
    return q;
  }

  createTripleLabel(resource: RDFResource): RDFResource[] {
    if (!resource.isVariable())
      throw new Error('Resource is not a variable');
    if (resource instanceof Literal)
      throw new Error('Resource is a literal');
    const p = new (class extends RDFResource {
      constructor() { super(null); }
    })();
    p.mkConst();
    p.addUri(this.ctx.labelUri);
    const o = new (class extends RDFResource {
      constructor() { super(null); }
    })();
    o.variable.alias = resource.variable.getName() + 'Label';
    o.variable.addFilter('lang', { language: this.ctx.lang }, this.ctx);
    return [resource, p, o];
  }

  addLabel(resource: RDFResource): RDFResource | null {
    const t = this.createTripleLabel(resource);
    if (this.triples.some(e => e[0] === t[0] && e[1] === t[1] && e[2] === t[2]))
      return null;
    this.triples.push(t);
    this.select.push(t[2]);
    this.cache = null;
    return t[2];
  }

  addOptLabel(resource: RDFResource): RDFResource {
    const t = this.createTripleLabel(resource);
    this.optionals.push([t]);
    this.select.push(t[2]);
    this.cache = null;
    return t[2];
  }

  addLabels(): RDFResource[] {
    const labels: RDFResource[] = [];
    this.select.forEach(r => {
      if (r instanceof Node || r instanceof Property) {
        const lbl = this.addLabel(r);
        if (lbl) labels.push(lbl);
      }
    });
    return labels;
  }

  selectAll(): void {
    this.select = Array.from(this.dep);
    this.cache = null;
  }

  retrieve(config: QueryRetrieveConfig): void {
    const ctx = this.ctx as GraphContext & { retriever: QueryRetriever };
    const retriever = ctx.retriever;
    if (!retriever) {
      if (config.callback) config.callback();
      return;
    }
    const cfg = config;
    if (typeof cfg.limit === 'number') this.limit = cfg.limit;
    if (typeof cfg.offset === 'number') this.offset = cfg.offset;
    const q = this.toSparql();
    const isAppend = cfg.appendResults && (this.offset > 0);
    const n = this.select.filter(r => r.variable.isBinded() && (isAppend || r.variable.query !== q)).length;
    if (q && n > 0) {
      retriever.execQuery(q, { signal: cfg.canceller }).then(data => {
        if (data.results.bindings.length > 0) {
          this.select.forEach(r => {
            const variable = r.variable;
            const name = variable.getName();
            const newResults = data.results.bindings.filter(d => d[name]).map(d => d[name]);
            if (isAppend) {
              const existing = new Set(variable.results.map(d => d.value));
              variable.results = [...variable.results, ...newResults.filter(d => !existing.has(d.value))];
            } else {
              const values = new Set<string>();
              variable.results = newResults.filter(d => (!values.has(d.value) && !!values.add(d.value)));
            }
            variable.query = q;
          });
        } else {
          if (!isAppend) {
            this.select.forEach(r => {
              r.variable.results = [];
              r.variable.query = q;
            });
          }
        }
        if (cfg.callback) cfg.callback();
      }).catch((err: unknown) => {
        if (cfg.onError) cfg.onError(err);
        if (cfg.callback) cfg.callback();
      });
    } else {
      if (cfg.callback) cfg.callback();
    }
  }
}
