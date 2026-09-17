import * as path from 'node:path';
import {
  buildEvaluationRows,
  seedEvaluationDatabase,
} from './evaluation-dashboards';

const target = path.resolve(
  process.env['DASHBOARDS_SQLITE_PATH'] ?? './data/evaluation.sqlite',
);
seedEvaluationDatabase(target);
const rows = buildEvaluationRows();
const gisCount = rows.filter((row) => row.kind === 'gis').length;
const explorerCount = rows.filter((row) => row.kind === 'explorer').length;
process.stdout.write(`Entorno de evaluación creado: ${target}\n`);
process.stdout.write(
  `${rows.length} tableros: ${gisCount} GIS + ${explorerCount} RDF Explorer\n`,
);
