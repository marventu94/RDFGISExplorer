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
    this.optionals = groupOptionals(optTriples, triples);
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
    // Los filtros de fecha serializan `^^xsd:dateTime` sin pasar por
    // curieLocal, así que el prefix xsd nunca entra al set: sin declararlo,
    // sparqljs (backend y GIS) rechaza la query con "Unknown prefix: xsd".
    if (q.includes('xsd:')) {
      h = 'PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>\n' + h;
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

  /**
   * SPARQL con proyección completa (todas las variables del componente),
   * pensado para el handoff al GIS: si solo se proyecta la semilla, el
   * backend no puede adjuntar coordenadas, eventos temporales ni aristas
   * al grafo normalizado (mapa/timeline vacíos, grafo sin edges).
   * No muta el estado: restaura `select` e invalida el cache al salir.
   * Las columnas `?<literal>Label` (siempre vacías, son literales) se
   * eliminan del SELECT, igual que hace el seed de dashboards demo.
   * `opts.limit` agrega un LIMIT explícito si la query no tiene uno: el
   * backend recorta las filas DESPUÉS de recibirlas, así que sin LIMIT el
   * endpoint materializa el resultado completo y la ejecución en el GIS
   * puede quedar colgada varios minutos.
   */
  toSparqlFullProjection(opts?: { limit?: number }): string | null {
    const prevSelect = this.select;
    const prevLimit = this.limit;
    this.selectAll();
    if (!this.limit && opts?.limit && opts.limit > 0) this.limit = opts.limit;
    let q = this.toSparql();
    this.select = prevSelect;
    this.limit = prevLimit;
    this.cache = null;
    if (!q) return null;
    for (const r of this.dep) {
      if (r instanceof Literal) {
        q = q.replaceAll(` ?${r.variable.getName()}Label`, '');
      }
    }
    return q;
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

/**
 * Agrupa los triples opcionales en bloques `OPTIONAL { }` conectados, en vez
 * de emitir uno por triple.
 *
 * Un triple por bloque no es solo verboso: cambia la semántica. Con
 * `OPTIONAL { ?a p ?b } OPTIONAL { ?b q ?c }`, si el primer bloque no matchea,
 * ?b queda sin ligar y el segundo se evalúa igual con ?b libre — o sea que
 * matchea CUALQUIER ?b del grafo y multiplica filas que no tienen nada que ver
 * con ?a. Encadenados en un solo bloque (`OPTIONAL { ?a p ?b . ?b q ?c }`) el
 * patrón matchea completo o no matchea, que es lo que se dibujó en el canvas.
 *
 * Criterio de agrupamiento: dos triples opcionales van al mismo bloque si
 * comparten una variable que el patrón obligatorio NO liga (es decir, una
 * variable que solo existe dentro del OPTIONAL). Las ramas opcionales que solo
 * comparten variables ya ligadas afuera —dos propiedades opcionales distintas
 * del mismo nodo— siguen siendo bloques separados, que es lo correcto: cada
 * una matchea o no de forma independiente.
 */
function groupOptionals(
  optTriples: RDFResource[][],
  triples: RDFResource[][],
): RDFResource[][][] {
  if (optTriples.length <= 1) return optTriples.map(t => [t]);

  // Variables que el patrón obligatorio ya deja ligadas.
  const bound = new Set<RDFResource>();
  for (const t of triples) {
    for (const r of t) {
      if (r.isVariable()) bound.add(r);
    }
  }

  // Union-find sobre los índices de los triples opcionales.
  const parent = optTriples.map((_, i) => i);
  const find = (i: number): number => {
    let root = i;
    while (parent[root] !== root) root = parent[root];
    while (parent[i] !== root) {
      const next = parent[i];
      parent[i] = root;
      i = next;
    }
    return root;
  };
  const union = (a: number, b: number): void => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[rb] = ra;
  };

  const firstSeen = new Map<RDFResource, number>();
  optTriples.forEach((t, i) => {
    for (const r of t) {
      if (!r.isVariable() || bound.has(r)) continue;
      const prev = firstSeen.get(r);
      if (prev === undefined) firstSeen.set(r, i);
      else union(prev, i);
    }
  });

  const groups = new Map<number, RDFResource[][]>();
  optTriples.forEach((t, i) => {
    const root = find(i);
    const group = groups.get(root);
    if (group) group.push(t);
    else groups.set(root, [t]);
  });

  return [...groups.values()].map(g => orderOptionalGroup(g, bound));
}

/**
 * Ordena los triples de un bloque OPTIONAL para que cada uno aparezca después
 * del que liga a su sujeto: primero los que arrancan de algo ya ligado
 * (constante o variable del patrón obligatorio) y después la cadena. El
 * resultado es idéntico para el endpoint pero mucho más legible, y es el orden
 * en que están escritas las queries de referencia.
 */
function orderOptionalGroup(
  group: RDFResource[][],
  bound: ReadonlySet<RDFResource>,
): RDFResource[][] {
  const ordered: RDFResource[][] = [];
  const pending = [...group];
  const reachable = new Set<RDFResource>(bound);

  let progress = true;
  while (pending.length > 0 && progress) {
    progress = false;
    for (let i = 0; i < pending.length; i++) {
      const t = pending[i];
      const subject = t[0];
      if (subject.isVariable() && !reachable.has(subject)) continue;
      ordered.push(t);
      pending.splice(i, 1);
      i--;
      for (const r of t) {
        if (r.isVariable()) reachable.add(r);
      }
      progress = true;
    }
  }

  // Sujetos que nunca se ligan (o ciclos): se emiten igual, al final.
  ordered.push(...pending);
  return ordered;
}
