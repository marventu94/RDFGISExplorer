import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import Database from 'better-sqlite3';
import { PropertyGraph } from '../../../frontend/rdf_explorer/src/app/graph/domain/graph';
import { deserializeGraph } from '../../../frontend/rdf_explorer/src/app/graph/domain/graph-serializer';
import { GenericAdapter } from '../../../frontend/rdf_explorer/src/app/graph/domain/endpoint/generic-adapter';
import {
  buildEvaluationRows,
  seedEvaluationDatabase,
} from '../../scripts/evaluation-dashboards';

describe('evaluation dashboards seed', () => {
  it('builds four GIS cases plus DRAFT Explorer workspaces for C1-C4 and C5', () => {
    const rows = buildEvaluationRows();

    expect(rows.map((row) => row.id)).toEqual([
      'eval-c1',
      'eval-c2',
      'eval-c3',
      'eval-c4',
      'draft-explorer-c1',
      'draft-explorer-c2',
      'draft-explorer-c3',
      'draft-explorer-c4',
      'eval-c5',
    ]);
    expect(rows.filter((row) => row.kind === 'gis')).toHaveLength(4);
    expect(rows.filter((row) => row.kind === 'explorer')).toHaveLength(5);
    expect(rows.map((row) => row.name)).toEqual([
      'C1 · Casas en venta en Berisso',
      'C2 · Producto típico de City Bell',
      'C3 · Departamentos a estrenar y usados en Berisso',
      'C4 · Fechas de publicación y tandas de lectura',
      'DRAFT · C1 · Casas en venta en Berisso',
      'DRAFT · C2 · Producto típico de City Bell',
      'DRAFT · C3 · Departamentos a estrenar y usados en Berisso',
      'DRAFT · C4 · Fechas de publicación y tandas de lectura',
      'C5 · Construcción visual y handoff',
    ]);
  });

  it('derives every GIS C1-C4 query from its RDF Explorer graph', () => {
    const rows = buildEvaluationRows();

    for (const suffix of ['c1', 'c2', 'c3', 'c4']) {
      const explorer = rows.find(
        (row) => row.id === `draft-explorer-${suffix}`,
      );
      const gis = rows.find((row) => row.id === `eval-${suffix}`);
      expect(explorer?.kind).toBe('explorer');
      expect(gis?.kind).toBe('gis');

      const panel = (
        explorer!.payload as {
          panels: Array<{ graph: { nodes: never[]; edges: never[] } }>;
        }
      ).panels[0];
      const prefixes = JSON.parse(
        fs.readFileSync(
          path.resolve(__dirname, '../../config/prefixes.graphdb.json'),
          'utf8',
        ),
      ) as Record<string, string>;
      const graph = new PropertyGraph({
        labelUri: 'http://www.w3.org/2000/01/rdf-schema#label',
        lang: 'es',
        prefixes: Object.entries(prefixes).map(([prefix, uri]) => ({
          prefix,
          uri,
        })),
        endpointAdapter: new GenericAdapter(),
      });
      deserializeGraph(graph, panel.graph);
      const queries = graph.getQueriesForGraph().queries;
      expect(queries).toHaveLength(1);
      const handoff = queries[0].toSparqlFullProjection({ limit: 500 });
      expect((gis!.payload as { query: string }).query).toBe(handoff);
    }
  });

  it('requires publication date in the C3 Explorer graph and GIS handoff', () => {
    const rows = buildEvaluationRows();
    const c3 = rows.find((row) => row.id === 'eval-c3');
    const query = (c3!.payload as { query: string }).query;

    expect(query).toContain('dc:date ?fechaPublicacion');
    expect(query).not.toMatch(
      /OPTIONAL\s*\{[^}]*dc:date\s+\?fechaPublicacion/s,
    );
  });

  it('uses typed date bounds rather than regex for C4 read dates', () => {
    const rows = buildEvaluationRows();
    const c4 = rows.find((row) => row.id === 'eval-c4');
    const query = (c4!.payload as { query: string }).query;

    expect(query).toContain('?fechaLectura >=');
    expect(query).toContain('?fechaLectura <=');
    expect(query).not.toContain('regex(?fechaLectura');
  });

  it('recreates the target database with only the nine evaluation dashboards', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rdfgis-eval-'));
    const dbPath = path.join(dir, 'evaluation.sqlite');
    const initial = new Database(dbPath);
    initial.exec(`
      CREATE TABLE dashboards (
        id TEXT PRIMARY KEY,
        kind TEXT NOT NULL,
        name TEXT NOT NULL,
        payload TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      INSERT INTO dashboards VALUES ('extra', 'gis', 'extra', '{}', 'x', 'x');
    `);
    initial.close();

    seedEvaluationDatabase(dbPath);
    seedEvaluationDatabase(dbPath);

    const db = new Database(dbPath, { readonly: true });
    const rows = db
      .prepare(
        'SELECT id, kind, name, json_valid(payload) AS valid FROM dashboards ORDER BY id',
      )
      .all() as Array<{
      id: string;
      kind: string;
      name: string;
      valid: number;
    }>;
    db.close();

    expect(rows).toHaveLength(9);
    expect(rows.every((row) => row.valid === 1)).toBe(true);
    expect(rows.map((row) => row.id)).toEqual([
      'draft-explorer-c1',
      'draft-explorer-c2',
      'draft-explorer-c3',
      'draft-explorer-c4',
      'eval-c1',
      'eval-c2',
      'eval-c3',
      'eval-c4',
      'eval-c5',
    ]);
  });
});
