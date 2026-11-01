import * as fs from 'node:fs';
import * as path from 'node:path';
import { buildEvaluationRows, seedEvaluationDatabase } from './evaluation-dashboards';

// Igual que start.sh: rutas de entorno y SQLite relativas a la raíz del repo.
const root = path.resolve(__dirname, '../../../..');
const args = process.argv.slice(2).filter(arg => arg !== '--');
const envIndex = args.indexOf('--env');
if (envIndex >= 0 && (!args[envIndex + 1] || args[envIndex + 1].startsWith('--'))) {
  throw new Error('Falta la ruta después de --env');
}
const envPath = path.resolve(root, envIndex >= 0 ? args[envIndex + 1] : '.env.evaluation.local');
if (fs.existsSync(envPath)) process.loadEnvFile(envPath);
else if (envIndex >= 0) throw new Error(`No existe el entorno: ${envPath}`);

const target = path.resolve(root,
  process.env['DASHBOARDS_SQLITE_PATH'] ?? 'products/shell/backend/data/evaluation.sqlite');
const rows = buildEvaluationRows();
if (args.includes('--dry-run')) {
  process.stdout.write(JSON.stringify({ target, dashboards: rows.map(({id, kind, name}) => ({id, kind, name})) }, null, 2) + '\n');
} else {
  const result = seedEvaluationDatabase(target);
  process.stdout.write(`Seed de evaluación actualizada: ${target}\n`);
  process.stdout.write(`${result.count} tableros RDF/GIS; guardados ajenos preservados.\n`);
  if (result.backupPath) process.stdout.write(`Respaldo SQLite: ${result.backupPath}\n`);
}
