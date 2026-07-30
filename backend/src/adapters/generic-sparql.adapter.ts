import axios, { AxiosError } from 'axios';
import {
  SparqlEndpoint,
  ExecuteOptions,
  TimeoutError,
  UpstreamError,
} from './sparql-endpoint.interface';
import {
  BindingValue,
  Coordinate,
  NormalizedEdge,
  NormalizedNode,
  QueryResult,
  ResultBinding,
  TemporalEvent,
} from '../shared/dto/query-result.dto';
import { extractQueryTopology, type QueryTopology } from './query-topology';

const DEFAULT_SPARQL_URL = 'https://query.wikidata.org/sparql';
const DEFAULT_TIMEOUT_MS = 10_000;
export const DEFAULT_USER_AGENT =
  'rdf-gis-explorer/0.1 (https://github.com/marventu94/RDFGISExplorer; mailto:mar_venturino@hotmail.com)';
const RETRY_DELAYS_MS = [500, 1500, 4500];
const DEFAULT_PREDICATE_CACHE_TTL_MS = 3_600_000;
const XSD_DATE = 'http://www.w3.org/2001/XMLSchema#date';
const XSD_DATE_TIME = 'http://www.w3.org/2001/XMLSchema#dateTime';
const GEOSPARQL_WKT = 'http://www.opengis.net/ont/geosparql#wktLiteral';

type WikidataRawBinding = Record<
  string,
  { type: string; value: string; 'xml:lang'?: string; datatype?: string }
>;

interface WikidataRawResponse {
  head: { vars: string[] };
  results: { bindings: WikidataRawBinding[] };
}

export class GenericSparqlAdapter implements SparqlEndpoint {
  constructor(readonly backendName: string = 'wikidata') {}

  private predicateCache: string[] | null = null;
  private predicateCacheAt = 0;

  async execute(query: string, opts: ExecuteOptions): Promise<QueryResult> {
    const t0 = Date.now();
    const timeoutMs = opts.timeoutMs > 0 ? opts.timeoutMs : DEFAULT_TIMEOUT_MS;
    const userAgent = this.resolveUserAgent();

    // La topología declarada por la consulta es la fuente de las aristas del grafo.
    // Si hay nodos intermedios sin proyectar (los bnodes de dirección, feature o
    // geometría que el modelo interpone entre entidades), se agregan al SELECT para
    // poder dibujarlos; la tabla sigue mostrando sólo las columnas originales.
    // En modo raw (export paginado) no hace falta grafo ni reescritura: se ejecuta
    // la query tal cual y se devuelven solo los bindings.
    const topology = opts.raw
      ? { links: [], projected: null, intermediates: [] }
      : extractQueryTopology(query);
    const upstreamQuery = topology.rewritten ?? query;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    if (opts.signal) {
      if (opts.signal.aborted) {
        clearTimeout(timer);
        controller.abort();
      } else {
        opts.signal.addEventListener('abort', () => controller.abort(), {
          once: true,
        });
      }
    }

    let lastErr: unknown;

    for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
      try {
        const response = await axios.post<WikidataRawResponse>(
          this.resolveEndpointUrl(),
          new URLSearchParams({ query: upstreamQuery }),
          {
            headers: {
              'User-Agent': userAgent,
              Accept: 'application/sparql-results+json',
              'Content-Type': 'application/x-www-form-urlencoded',
            },
            auth: this.resolveAuth(),
            signal: controller.signal,
          },
        );

        clearTimeout(timer);

        const rawBindings: WikidataRawBinding[] =
          response.data?.results?.bindings ?? [];
        const allVars: string[] = response.data?.head?.vars ?? [];

        // Columnas que ve el usuario: las que pidió, sin los intermedios agregados.
        const exposedVars: string[] = topology.projected
          ? topology.projected.filter((v) => allVars.includes(v))
          : allVars;

        const truncated = opts.limit > 0 && rawBindings.length >= opts.limit;

        // Filas completas (con intermedios) para armar el grafo...
        const fullRows: ResultBinding[] = rawBindings
          .slice(0, opts.limit)
          .map((raw) => this.normalizeRow(raw, allVars));

        // ...y filas recortadas a la proyección original para la tabla.
        const bindings: ResultBinding[] = topology.rewritten
          ? fullRows.map((row) => this.pickVariables(row, exposedVars))
          : fullRows;

        const { nodes, edges } = opts.raw
          ? { nodes: [], edges: [] }
          : this.buildGraph(fullRows, exposedVars, topology);

        return {
          variables: exposedVars,
          bindings,
          nodes,
          edges,
          meta: {
            durationMs: Date.now() - t0,
            truncated,
            limitApplied: opts.limit,
            backend: this.backendName,
          },
        };
      } catch (err) {
        clearTimeout(timer);

        if (controller.signal.aborted) {
          throw new TimeoutError(timeoutMs);
        }

        lastErr = err;

        if (!this.isAxiosError(err)) {
          throw err;
        }

        const status = err.response?.status ?? 0;
        if (status === 429 && attempt < RETRY_DELAYS_MS.length) {
          await this.delay(RETRY_DELAYS_MS[attempt]);
          continue;
        }
        const upstreamBody = JSON.stringify(err.response?.data ?? {});
        if (status === 429) {
          throw new UpstreamError(
            429,
            `Retries exhausted (body: ${upstreamBody})`,
          );
        }
        if (status >= 500) {
          throw new UpstreamError(
            status,
            `${err.message} (body: ${upstreamBody})`,
          );
        }
        throw new UpstreamError(
          status,
          `${err.message} (body: ${upstreamBody})`,
        );
      }
    }

    if (lastErr instanceof UpstreamError) {
      throw lastErr;
    }
    throw new UpstreamError(0, 'Retries exhausted');
  }

  async getPredicates(): Promise<string[]> {
    const now = Date.now();
    if (
      this.predicateCache &&
      now - this.predicateCacheAt < this.predicateCacheTtlMs()
    ) {
      return this.predicateCache;
    }

    const userAgent = this.resolveUserAgent();
    const query = 'SELECT DISTINCT ?p WHERE { ?s ?p ?o } LIMIT 1000';

    const response = await axios.post<WikidataRawResponse>(
      this.resolveEndpointUrl(),
      new URLSearchParams({ query }),
      {
        headers: {
          'User-Agent': userAgent,
          Accept: 'application/sparql-results+json',
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        auth: this.resolveAuth(),
      },
    );

    const rawBindings: WikidataRawBinding[] =
      response.data?.results?.bindings ?? [];
    const predicates = rawBindings
      .map((b) => b['p']?.value)
      .filter((v): v is string => typeof v === 'string');

    this.predicateCache = predicates;
    this.predicateCacheAt = now;

    return predicates;
  }

  private resolveEndpointUrl(): string {
    const url = process.env['SPARQL_ENDPOINT_URL'];
    if (url) return url;
    console.warn(
      'SPARQL_ENDPOINT_URL not set, using default Wikidata endpoint',
    );
    return DEFAULT_SPARQL_URL;
  }

  private resolveAuth(): { username: string; password: string } | undefined {
    const username = process.env['SPARQL_USERNAME'];
    const password = process.env['SPARQL_PASSWORD'];
    if (username && password) {
      return { username, password };
    }
    return undefined;
  }

  private resolveUserAgent(): string {
    const ua = process.env['SPARQL_USER'];
    if (!ua) {
      console.warn('SPARQL_USER not set, using default');
      return DEFAULT_USER_AGENT;
    }
    return ua;
  }

  /** TTL del cache de predicados: env SPARQL_PREDICATE_CACHE_TTL_MS (default 1h). */
  private predicateCacheTtlMs(): number {
    const parsed = parseInt(
      process.env['SPARQL_PREDICATE_CACHE_TTL_MS'] ?? '',
      10,
    );
    return Number.isInteger(parsed) && parsed > 0
      ? parsed
      : DEFAULT_PREDICATE_CACHE_TTL_MS;
  }

  private normalizeRow(
    raw: WikidataRawBinding,
    variables: string[],
  ): ResultBinding {
    const row: ResultBinding = {};
    for (const v of variables) {
      const cell = raw[v];
      if (!cell) continue;
      row[v] = this.normalizeValue(cell);
    }
    return row;
  }

  private normalizeValue(raw: {
    type: string;
    value: string;
    'xml:lang'?: string;
    datatype?: string;
  }): BindingValue {
    if (raw.type === 'uri') {
      return { type: 'uri', value: raw.value };
    }

    if (raw.type === 'bnode') {
      return { type: 'bnode', value: raw.value };
    }

    if (raw['xml:lang']) {
      return { type: 'literal', value: raw.value, lang: raw['xml:lang'] };
    }

    const dt = raw.datatype ?? '';

    if (dt === XSD_DATE || dt === XSD_DATE_TIME) {
      return { type: 'date', value: raw.value, raw: raw.value };
    }

    if (dt === GEOSPARQL_WKT || raw.value.startsWith('Point(')) {
      const coord = this.parseWktPoint(raw.value);
      if (coord) {
        return { type: 'coordinate', value: coord, raw: raw.value };
      }
      // WKT inválido (p.ej. datos sucios como "POINT(None None)"): se degrada
      // a literal plano en vez de abortar toda la query.
      return {
        type: 'literal',
        value: raw.value,
        ...(dt ? { datatype: dt } : {}),
      };
    }

    return {
      type: 'literal',
      value: raw.value,
      ...(dt ? { datatype: dt } : {}),
    };
  }

  private parseWktPoint(raw: string): Coordinate | null {
    // Soporta WKT simple (Point(lng lat)) y GeoSPARQL 1.1 con CRS opcional
    // (<http://www.opengis.net/def/crs/EPSG/0/4326> Point(lng lat)).
    const m = /^(?:<[^>]+>\s*)?Point\s*\(\s*(-?[\d.]+)\s+(-?[\d.]+)\s*\)/i.exec(
      raw,
    );
    if (!m) {
      return null;
    }
    return { lat: parseFloat(m[2]), lng: parseFloat(m[1]) };
  }

  /**
   * Construye el grafo de resultados a partir de las relaciones que declara la consulta.
   *
   * Antes se armaba una estrella: todas las URIs de una fila colgaban de la primera
   * variable URI, con el nombre de la variable como predicado. Eso inventaba aristas
   * inexistentes (`real_estate --[agente]--> agent_X`, cuando el triple real es
   * `listing foaf:maker agent_X`) y aplanaba las jerarquías, que es justo lo que hace
   * interesante a un grafo.
   *
   * Ahora cada arista corresponde a un patrón `?s <p> ?o` de la consulta, con su
   * predicado y su dirección reales, y los nodos intermedios del modelo se dibujan
   * como nodos propios.
   */
  private buildGraph(
    rows: ResultBinding[],
    exposedVars: string[],
    topology: QueryTopology,
  ): { nodes: NormalizedNode[]; edges: NormalizedEdge[] } {
    const nodeMap = new Map<string, NormalizedNode>();
    const edgeSet = new Set<string>();
    const edges: NormalizedEdge[] = [];

    for (const row of rows) {
      // Nodos de las variables que pidió el usuario y de los intermedios del modelo.
      for (const v of exposedVars) this.ensureNode(nodeMap, row, v);
      for (const v of topology.intermediates) this.ensureNode(nodeMap, row, v);

      for (const link of topology.links) {
        const source = this.ensureNode(nodeMap, row, link.subject);
        const target = this.ensureNode(nodeMap, row, link.object);
        if (!source || !target) continue;

        let predicate = link.predicate;
        let predicateLabel = link.predicateLabel;

        // Consultas tipo `?s ?p ?o`: el predicado real viene en los bindings.
        if (link.predicateVar) {
          const bound = row[link.predicateVar];
          if (bound?.type !== 'uri') continue;
          predicate = String(bound.value);
          predicateLabel = this.uriFragment(predicate);
        }
        if (!predicate) continue;

        const edgeId = `${source.uri}|${predicate}|${target.uri}`;
        if (edgeSet.has(edgeId)) continue;
        edgeSet.add(edgeId);
        edges.push({
          id: edgeId,
          source: source.uri,
          target: target.uri,
          predicate,
          ...(predicateLabel ? { predicateLabel } : {}),
        });
      }

      // Los literales, la coordenada y los eventos temporales se cuelgan del nodo
      // ancla: la primera variable URI de la proyección original. Es a propósito:
      // el mapa y la timeline los buscan ahí, y si se los asignáramos al sujeto
      // inmediato del literal (el bnode de geometría, por ejemplo) el mapa dibujaría
      // bnodes en lugar de inmuebles.
      const anchorVar = exposedVars.find((v) => row[v]?.type === 'uri');
      if (!anchorVar) continue;
      const anchor = this.ensureNode(nodeMap, row, anchorVar);
      if (!anchor) continue;

      Object.assign(
        anchor.attributes,
        this.collectAttributes(row, exposedVars),
      );

      const coord = this.findCoordinate(row, exposedVars);
      if (coord && !anchor.coordinate) anchor.coordinate = coord;

      for (const ev of this.findTemporalEvents(row, exposedVars)) {
        const already = anchor.temporalEvents?.some(
          (e) => e.field === ev.field && e.isoDate === ev.isoDate,
        );
        if (!already) {
          anchor.temporalEvents = [...(anchor.temporalEvents ?? []), ev];
        }
      }
    }

    return { nodes: [...nodeMap.values()], edges };
  }

  /**
   * Devuelve (creando si hace falta) el nodo de una variable en una fila.
   * Sólo las URIs y los bnodes son nodos; un literal no lo es.
   */
  private ensureNode(
    nodeMap: Map<string, NormalizedNode>,
    row: ResultBinding,
    varName: string,
  ): NormalizedNode | null {
    const cell = row[varName];
    if (!cell) return null;
    if (cell.type !== 'uri' && cell.type !== 'bnode') return null;

    const value = String(cell.value);
    // Los bnodes se prefijan para no colisionar con una URI y para que en la vista se
    // lean como lo que son: nodos anónimos del modelo.
    const id = cell.type === 'bnode' ? `_:${value}` : value;

    const labelCell = row[`${varName}Label`];
    const labelFromRow =
      labelCell?.type === 'literal' ? String(labelCell.value) : '';

    const existing = nodeMap.get(id);
    if (existing) {
      // Si la etiqueta aparece en una fila posterior, se aprovecha.
      if (labelFromRow && existing.label === this.uriFragment(id)) {
        existing.label = labelFromRow;
      }
      return existing;
    }

    const node: NormalizedNode = {
      uri: id,
      label:
        labelFromRow ||
        (cell.type === 'bnode' ? varName : this.uriFragment(value)),
      type: varName,
      attributes: {},
    };
    nodeMap.set(id, node);
    return node;
  }

  private pickVariables(row: ResultBinding, vars: string[]): ResultBinding {
    const out: ResultBinding = {};
    for (const v of vars) {
      if (row[v]) out[v] = row[v];
    }
    return out;
  }

  private uriFragment(uri: string): string {
    // Se corta por '#' o por '/', el que esté más a la derecha: las ontologías del OVS
    // usan URIs con '#' y cortando sólo por '/' quedaba "inmontology#real_estate_...".
    const idx = Math.max(uri.lastIndexOf('#'), uri.lastIndexOf('/'));
    return idx >= 0 && idx < uri.length - 1 ? uri.slice(idx + 1) : uri;
  }

  private findCoordinate(
    row: ResultBinding,
    variables: string[],
  ): Coordinate | undefined {
    for (const v of variables) {
      const val = row[v];
      if (val?.type === 'coordinate') {
        return val.value;
      }
    }
    return undefined;
  }

  private findTemporalEvents(
    row: ResultBinding,
    variables: string[],
  ): TemporalEvent[] {
    const events: TemporalEvent[] = [];
    for (const v of variables) {
      const val = row[v];
      if (val?.type === 'date') {
        const d = new Date(val.value);
        events.push({
          field: v,
          isoDate: val.value,
          numericValue: isNaN(d.getTime()) ? undefined : d.getFullYear(),
        });
      }
    }
    return events;
  }

  private collectAttributes(
    row: ResultBinding,
    variables: string[],
  ): Record<string, BindingValue> {
    const attrs: Record<string, BindingValue> = {};
    for (const v of variables) {
      if (row[v] && row[v].type !== 'uri') {
        attrs[v] = row[v];
      }
    }
    return attrs;
  }

  private isAxiosError(err: unknown): err is AxiosError {
    return (
      typeof err === 'object' &&
      err !== null &&
      'isAxiosError' in err &&
      err['isAxiosError'] === true
    );
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
