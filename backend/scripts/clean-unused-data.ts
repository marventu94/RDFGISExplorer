import * as fs from 'fs';
import * as path from 'path';

const DEFAULT_DATA_DIR = path.resolve('./data');
const DEFAULT_PROTECTED = 'wikidata,graphdb';

interface CleanupCandidate {
  path: string;
  basename: string;
  reason: 'orphan-backend' | 'legacy-path' | 'unknown';
  siblings: string[];
}

function normalizeBackend(backend: string | undefined): string {
  if (!backend) return 'wikidata';
  const safe = backend.toLowerCase().replace(/[^a-z0-9_-]/g, '');
  return safe || 'wikidata';
}

function resolveDashboardsPath(): string {
  const explicit = process.env['DASHBOARDS_SQLITE_PATH'];
  if (explicit && explicit.trim() !== '') return path.resolve(explicit);
  const backend = normalizeBackend(process.env['SPARQL_BACKEND']);
  return path.resolve(`./data/${backend}.sqlite`);
}

function protectedBackends(): Set<string> {
  const raw = process.env['SPARQL_PROTECTED_BACKENDS'] ?? DEFAULT_PROTECTED;
  return new Set(
    raw
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean)
      .map(normalizeBackend),
  );
}

function isLegacyDefaultName(basename: string): boolean {
  return basename === 'dashboards.sqlite' || basename === 'settings.sqlite';
}

function listSqliteFiles(dataDir: string): string[] {
  if (!fs.existsSync(dataDir)) return [];
  return fs
    .readdirSync(dataDir)
    .filter(
      (f) =>
        (f.endsWith('.sqlite') || f.endsWith('.db')) &&
        !f.endsWith('-shm') &&
        !f.endsWith('-wal'),
    )
    .map((f) => path.join(dataDir, f));
}

function findSiblings(filePath: string): string[] {
  const out: string[] = [];
  for (const suffix of ['-shm', '-wal', '-journal']) {
    const sib = `${filePath}${suffix}`;
    if (fs.existsSync(sib)) out.push(sib);
  }
  return out;
}

function classify(
  filePath: string,
  activePath: string,
  protectedSet: Set<string>,
): CleanupCandidate | null {
  const resolved = path.resolve(filePath);
  const basename = path.basename(filePath);
  if (resolved === activePath) return null;

  const stem = basename.replace(/\.(sqlite|db)$/, '');

  if (isLegacyDefaultName(basename)) {
    return {
      path: filePath,
      basename,
      reason: 'legacy-path',
      siblings: findSiblings(filePath),
    };
  }

  if (protectedSet.has(stem)) return null;

  if (/^[a-z0-9_-]+$/.test(stem)) {
    return {
      path: filePath,
      basename,
      reason: 'orphan-backend',
      siblings: findSiblings(filePath),
    };
  }

  return {
    path: filePath,
    basename,
    reason: 'unknown',
    siblings: findSiblings(filePath),
  };
}

function removeFile(filePath: string): void {
  try {
    fs.unlinkSync(filePath);
    process.stdout.write(
      `  removed: ${path.relative(process.cwd(), filePath)}\n`,
    );
  } catch (err) {
    process.stderr.write(
      `  failed:  ${filePath} (${(err as Error).message})\n`,
    );
  }
}

export interface IdentifyOptions {
  dataDir?: string;
  activePath?: string;
  protectedBackends?: string[];
}

export interface IdentifyResult {
  activePath: string;
  protectedBackends: string[];
  candidates: CleanupCandidate[];
}

export function identify(options: IdentifyOptions = {}): IdentifyResult {
  const dataDir = options.dataDir ?? DEFAULT_DATA_DIR;
  const activePath = options.activePath ?? resolveDashboardsPath();
  const protectedSet = new Set(
    (options.protectedBackends ?? [...protectedBackends()]).map(
      normalizeBackend,
    ),
  );
  const files = listSqliteFiles(dataDir);
  const candidates: CleanupCandidate[] = [];
  for (const f of files) {
    const c = classify(f, activePath, protectedSet);
    if (c) candidates.push(c);
  }
  return {
    activePath,
    protectedBackends: [...protectedSet],
    candidates,
  };
}

export function run(force: boolean): number {
  const result = identify();
  const relActive = path.relative(process.cwd(), result.activePath);
  const relDataDir = path.relative(process.cwd(), DEFAULT_DATA_DIR);

  process.stdout.write(`Active dashboards SQLite: ${relActive}\n`);
  process.stdout.write(
    `Protected backends:        ${result.protectedBackends.join(', ')}\n`,
  );
  process.stdout.write(`\n`);

  if (result.candidates.length === 0) {
    process.stdout.write(`No unused SQLite files found in ${relDataDir}.\n`);
    return 0;
  }

  process.stdout.write(
    `Found ${result.candidates.length} candidate(s) for removal:\n`,
  );
  for (const c of result.candidates) {
    const tag =
      c.reason === 'legacy-path'
        ? 'legacy default path (pre-refactor)'
        : c.reason === 'orphan-backend'
          ? 'orphan backend'
          : 'unknown';
    process.stdout.write(
      `  - ${path.relative(process.cwd(), c.path)}  [${tag}]\n`,
    );
    for (const sib of c.siblings) {
      process.stdout.write(`      + ${path.relative(process.cwd(), sib)}\n`);
    }
  }

  if (!force) {
    process.stdout.write(`\nRe-run with --force to remove these files.\n`);
    return 1;
  }

  process.stdout.write(`\nRemoving...\n`);
  for (const c of result.candidates) {
    for (const sib of c.siblings) removeFile(sib);
    removeFile(c.path);
  }
  process.stdout.write(`Done.\n`);
  return 0;
}

if (
  require.main === module ||
  process.argv[1]?.endsWith('clean-unused-data.ts')
) {
  const force = process.argv.includes('--force');
  process.exit(run(force));
}
