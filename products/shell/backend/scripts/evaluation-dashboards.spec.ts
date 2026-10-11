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
  const queries = () => buildEvaluationQueries().map(item => item.query);

  it('creates exactly five ordered Explorer workspaces, each with one matching tab', () => {
    const rows = buildEvaluationRows();
    expect(rows.map(row => row.id)).toEqual([1, 2, 3, 4, 5].map(n => `eval-explorer-d${n}`));
    expect(rows.every(row => row.kind === 'explorer')).toBe(true);
    rows.forEach((row, i) => {
      const panels = row.payload.panels as Array<{ name: string }>;
      expect(panels).toHaveLength(1);
      expect(panels[0].name).toBe(row.name);
      expect(row.name).toMatch(new RegExp(`^D${i + 1} ·`));
    });
  });

  it('audits the exact full projection produced by handoff after loading each graph', () => {
    const prefixes = JSON.parse(fs.readFileSync(path.resolve(__dirname,
      '../../../../packages/explorer-backend/config/prefixes.graphdb.example.json'), 'utf8')) as Record<string, string>;
    buildEvaluationRows().forEach((row, i) => {
      const graph = new PropertyGraph({ labelUri: 'http://www.w3.org/2000/01/rdf-schema#label',
        lang: 'es', prefixes: Object.entries(prefixes).map(([prefix, uri]) => ({ prefix, uri })),
        endpointAdapter: new GenericAdapter() });
      const panel = (row.payload.panels as Array<{ graph: Parameters<typeof deserializeGraph>[1]; generatedQuery: string }>)[0];
      deserializeGraph(graph, panel.graph);
      const built = graph.getQueriesForGraph().queries;
      expect(built).toHaveLength(1);
      expect(built[0].toSparql()).toBe(panel.generatedQuery);
      expect(built[0].toSparqlFullProjection()).toBe(queries()[i]);
      expect(queries()[i]).not.toMatch(/\bLIMIT\b/);
    });
  });

  it('keeps the administrative scope and mandatory geometry in all scenarios', () => {
    queries().forEach((q, i) => {
      expect(q).toContain('geo:asWKT ?wkt');
      if (i === 3) expect(q).toContain('regex(?barrioLabel, "^city bell$", "i")');
      else {
        expect(q).toContain(`<${inm}city> ?ciudad`);
        expect(q).toContain('regex(?ciudadLabel, "^berisso$", "i")');
      }
      expect(q).toContain(`<${inm}hasOrigin> ?origenDireccion`);
    });
  });

  it('gives D2 and D3 the same clean dataset, one publication date and explicit age provenance', () => {
    const [, d2, d3] = queries();
    expect(d2).toBe(d3);
    expect(d3).toContain('<http://purl.org/dc/elements/1.1/date> ?fechaPublicacion');
    expect(d3).toContain(`?featureAntiguedad <${inm}hasOrigin> ?origenAntiguedad`);
    expect(d3).not.toContain('?fechaLectura');
    expect(d3).not.toMatch(/OPTIONAL\s*\{[^}]*date>/s);
  });

  it('restricts D4 measurements to surfaces, without calling every area covered', () => {
    const d4 = queries()[3];
    expect(d4).toContain(`?surfaceFeature rdf:type <${inm}Surface>`);
    expect(d4).toContain('?superficie');
    expect(d4).not.toContain('?superficieCubierta');
  });

  it('starts D5 with a bounded sale/house/location pattern ready to extend with price', () => {
    const d5 = queries()[4];
    expect(d5).toContain(`<${inm}House>`);
    expect(d5).toContain('<http://purl.org/goodrelations/v1#Sell>');
    expect(d5).not.toContain('?precio');
    expect(queries()[0]).toContain('?precio');
  });

  it('resets legacy and manual dashboards atomically to five scenarios on the live connection', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rdfgis-scenarios-'));
    const dbPath = path.join(dir, 'evaluation.sqlite');
    try {
      seedEvaluationDatabase(dbPath);
      const live = new Database(dbPath);
      try {
        live.prepare('INSERT INTO dashboards VALUES (?, ?, ?, ?, ?, ?)').run('personal', 'gis', 'Mi tablero', '{}', 'old', 'old');
        for (const id of ['eval-c1', 'eval-c5', 'draft-explorer-c3'])
          live.prepare('INSERT INTO dashboards VALUES (?, ?, ?, ?, ?, ?)').run(id, 'gis', 'Legacy', '{}', 'old', 'old');
        seedEvaluationDatabase(dbPath);
        seedEvaluationDatabase(dbPath);
        const rows = live.prepare('SELECT id, kind, json_valid(payload) AS valid FROM dashboards').all() as Array<{id: string; kind: string; valid: number}>;
        expect(rows).toHaveLength(5);
        expect(rows.filter(row => row.kind === 'explorer')).toHaveLength(5);
        expect(rows.some(row => row.id === 'personal')).toBe(false);
        expect(rows.every(row => row.valid === 1)).toBe(true);
      } finally { live.close(); }
    } finally { fs.rmSync(dir, {recursive: true, force: true}); }
  });
});
