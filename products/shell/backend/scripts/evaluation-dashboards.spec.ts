import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import Database from 'better-sqlite3';
import { PropertyGraph } from '../../../rdf-explorer/frontend/src/app/graph/domain/graph';
import { deserializeGraph } from '../../../rdf-explorer/frontend/src/app/graph/domain/graph-serializer';
import { GenericAdapter } from '../../../rdf-explorer/frontend/src/app/graph/domain/endpoint/generic-adapter';
import { buildEvaluationRows, buildEvaluationQueries, seedEvaluationDatabase } from './evaluation-dashboards';

describe('evaluation scenario seed', () => {
  const inm = 'http://www.semanticweb.org/luciana/ontologies/2024/8/inmontology#';
  const rdfs = 'http://www.w3.org/2000/01/rdf-schema#';
  const rdf = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#';
  const queries = () => buildEvaluationQueries().map(item => item.query);
  const prefixes = () => Object.entries(JSON.parse(fs.readFileSync(path.resolve(__dirname,
    '../../../../packages/explorer-backend/config/prefixes.graphdb.example.json'), 'utf8')) as Record<string, string>)
    .map(([prefix, uri]) => ({ prefix, uri }));
  const loadGraph = (row: ReturnType<typeof buildEvaluationRows>[number]) => {
    const graph = new PropertyGraph({ labelUri: `${rdfs}label`, lang: 'es', prefixes: prefixes(),
      endpointAdapter: new GenericAdapter() });
    const panel = (row.payload.panels as Array<{ graph: Parameters<typeof deserializeGraph>[1]; generatedQuery: string }>)[0];
    deserializeGraph(graph, panel.graph);
    return { graph, panel };
  };

  it('seeds D1/D5 RDF, direct D2 GIS and the separate T1/T2 tutorial', () => {
    const rows = buildEvaluationRows();
    expect(rows.map(row => row.id)).toEqual(['eval-explorer-d1', 'eval-gis-d2', 'eval-explorer-d5', 'eval-explorer-t1', 'eval-gis-t2']);
    expect(rows.map(row => row.kind)).toEqual(['explorer', 'gis', 'explorer', 'explorer', 'gis']);
    expect(rows[0].name).toBe('D1 · Exploración inicial');
    expect(rows.map(row => row.name.slice(0, 4))).toEqual(['D1 ·', 'D2 ·', 'D5 ·', 'T1 ·', 'T2 ·']);
    rows.filter(row => row.kind === 'explorer').forEach(row => {
      const panels = row.payload.panels as Array<{ name: string }>;
      expect(panels).toHaveLength(1);
      expect(panels[0].name).toBe(row.name);
    });
  });

  it('audits the exact full projection produced by handoff after loading each graph', () => {
    buildEvaluationRows().forEach((row, i) => {
      if (row.kind === 'gis') { expect(row.payload.query).toBe(queries()[i]); return; }
      const { graph, panel } = loadGraph(row);
      const built = graph.getQueriesForGraph().queries;
      expect(built).toHaveLength(1);
      expect(built[0].toSparql()).toBe(panel.generatedQuery);
      expect(built[0].toSparqlFullProjection()).toBe(queries()[i]);
      expect(queries()[i]).not.toMatch(/\bLIMIT\b/);
    });
  });

  it('keeps the La Plata house, map, date and optional neighborhood base in D1 and D2', () => {
    const [d1, d2] = queries();
    for (const q of [d1, d2]) {
      expect(q).toContain(`rdf:type <${inm}House>`);
      expect(q).toContain('regex(?ciudadLabel, "^la plata$", "i")');
      expect(q).toContain('<http://purl.org/dc/elements/1.1/date> ?fechaPublicacion');
      expect(q).toContain('geo:asWKT ?wkt');
      expect(q).toContain(`<${inm}hasOrigin> ?origenDireccion`);
      // Barrio opcional y con su etiqueta dentro del mismo OPTIONAL: fuera de él,
      // `?neighborhood rdfs:label ?barrio` uniría cualquier recurso etiquetado.
      expect(q).toMatch(new RegExp(`OPTIONAL \\{\\s*\\?locationValue <${inm}neighborhood> \\?neighborhood \\.\\s*\\?neighborhood rdfs:label \\?barrio \\.\\s*\\}`));
      expect(q).not.toMatch(/\?superficie|\?antiguedad|Apartment/);
    }
    expect(d1).not.toMatch(/\?precio|\?moneda|\?priceFeature|\?direccion/);
  });

  it('keeps every D2 USD price observation identifiable and the detail editable in the canvas', () => {
    const d2 = buildEvaluationRows()[1];
    const handoff = d2.payload.query as string;
    const panel = { generatedQuery: handoff };
    expect(d2.payload.primaryVariable).toBe('listing');
    expect(d2.payload.layout).toEqual({ slotsCount: 3, preset: 'triple-v-inv', editorCollapsed: true,
      slots: ['graph', 'map', 'timeline'].map((view, i) => ({ id: `slot-${i}`, view })),
    });
    expect(buildEvaluationRows()[4].payload.layout).toMatchObject({ slotsCount: 4, preset: 'quad' });
    expect(d2.name).toContain('precio USD');
    expect(panel.generatedQuery).toContain('?precio');
    expect(panel.generatedQuery).toContain('?direccion');
    expect(handoff).toContain('?listing ?realEstate ?priceFeature');
    expect(handoff).toContain('?priceSpecification');
    expect(handoff).toContain('?origenPrecio');
    expect(handoff).toContain('?geometry ?wkt');
    expect(handoff).toContain('<http://purl.org/goodrelations/v1#hasCurrencyValue> ?precio');
    expect(handoff).toContain('STR(?moneda) = "USD"');
    expect(handoff).not.toContain('inXSDDateTimeStamp');
    expect(handoff).not.toMatch(/\bLIMIT\b/);
  });

  it('bounds D1 to ten days inside the four months of D2, by publication date and without LIMIT', () => {
    const [d1, d2] = queries();
    expect(d1).toContain('FILTER (?fechaPublicacion >= "2023-09-01T00:00:00"^^xsd:dateTime)');
    expect(d1).toContain('FILTER (?fechaPublicacion <= "2023-09-10T23:59:59"^^xsd:dateTime)');
    expect(d2).toContain('FILTER (?fechaPublicacion >= "2023-09-01T00:00:00"^^xsd:dateTime)');
    expect(d2).toContain('FILTER (?fechaPublicacion <= "2023-12-31T23:59:59"^^xsd:dateTime)');
  });

  it('leaves D5 as a real construction task starting from House', () => {
    const d5 = buildEvaluationRows()[2];
    const { graph, panel } = loadGraph(d5);
    expect(panel.generatedQuery).toContain(`?casa rdf:type <${inm}House>`);
    expect(panel.generatedQuery).not.toMatch(/hasFeature|city|label/);

    // La solución esperada se puede construir con las mismas operaciones del canvas.
    const constProp = (node: ReturnType<typeof graph.addNode>, uri: string) => {
      const prop = node.newProp(); prop.addUri(uri); prop.mkConst(); return prop;
    };
    const varNode = (alias: string, show = false) => {
      const node = graph.addNode(); node.variable.setAlias(alias, graph); node.variable.options.show = show; return node;
    };
    const house = graph.nodes.find(node => node.variable.alias === 'casa')!;
    house.variable.options.show = false;
    const feature = varNode('direccion');
    graph.addEdge(constProp(house, `${inm}hasFeature`), feature);
    const addressClass = graph.addNode(); addressClass.addUri(`${inm}Address`); addressClass.mkConst();
    graph.addEdge(constProp(feature, `${rdf}type`), addressClass);
    const value = varNode('valor');
    graph.addEdge(constProp(feature, `${inm}hasValue`), value);
    const city = varNode('ciudad');
    graph.addEdge(constProp(value, `${inm}city`), city);
    const label = constProp(city, `${rdfs}label`);
    const literal = label.mkLiteral()!;
    label.getLiteral()?.setAlias('localidad', graph);
    // El panel derecho («Possible results») consulta con raíz en el recurso
    // seleccionado: seleccionar la etiqueta lista localidades distintas.
    const preview = literal.createQuery({ limit: 10 });
    const solution = preview!.toSparql();
    expect(solution).toContain('SELECT DISTINCT ?localidad WHERE');
    expect(solution).toMatch(/LIMIT 10\b/);
    expect(solution).toContain(`?direccion rdf:type <${inm}Address>`);
    expect(solution).toContain(`?valor <${inm}city> ?ciudad`);
  });

  it('uses identical tutorial queries, a different property type and a different city', () => {
    const q = queries();
    expect(q[3]).toBe(q[4]);
    expect(q[3]).toContain(`${inm}Apartment`);
    expect(q[3]).toContain('^berisso$');
    expect(q[3]).toContain('2023-10-01T00:00:00');
    expect(q[3]).toContain('?precio');
    expect(q[3]).toContain('?wkt');
  });

  it('backs up the live database, replaces retired D2 and preserves unrelated dashboards', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rdfgis-scenarios-'));
    const dbPath = path.join(dir, 'evaluation.sqlite');
    try {
      expect(seedEvaluationDatabase(dbPath).backupPath).toBeNull();
      const live = new Database(dbPath);
      try {
        live.pragma('journal_mode = WAL');
        live.prepare('INSERT INTO dashboards VALUES (?, ?, ?, ?, ?, ?)').run('personal', 'gis', 'Mi tablero', '{"kept":true}', 'old', 'old');
        live.prepare('INSERT INTO dashboards VALUES (?, ?, ?, ?, ?, ?)').run('eval-explorer-d2', 'explorer', 'Legacy D2', '{}', 'old', 'old');
        const result = seedEvaluationDatabase(dbPath);
        expect(result.backupPath).toBeTruthy();
        const backup = new Database(result.backupPath!, { readonly: true });
        try {
          expect(backup.prepare('SELECT name FROM dashboards WHERE id = ?').get('eval-explorer-d2')).toEqual({name:'Legacy D2'});
          expect(backup.prepare('SELECT payload FROM dashboards WHERE id = ?').get('personal')).toEqual({payload:'{"kept":true}'});
        } finally { backup.close(); }
        expect(live.prepare('SELECT * FROM dashboards WHERE id = ?').get('eval-explorer-d2')).toBeUndefined();
        expect(live.prepare('SELECT payload, updated_at FROM dashboards WHERE id = ?').get('personal')).toEqual({payload:'{"kept":true}', updated_at:'old'});
        expect(live.prepare('SELECT COUNT(*) AS n FROM dashboards').get()).toEqual({n:6});
        expect(live.prepare('SELECT kind FROM dashboards WHERE id = ?').get('eval-gis-d2')).toEqual({kind:'gis'});
      } finally { live.close(); }
    } finally { fs.rmSync(dir, {recursive:true, force:true}); }
  });
});
