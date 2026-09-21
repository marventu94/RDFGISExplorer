'use strict';

const { spawnSync } = require('node:child_process');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const guard = path.join(__dirname, 'ci-test-guard.cjs');
const inheritedNodeOptions = process.env.NODE_OPTIONS?.trim();
const guardedEnv = {
  ...process.env,
  CI: 'true',
  NODE_OPTIONS: [inheritedNodeOptions, `--require=${guard}`].filter(Boolean).join(' '),
};

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    env: options.env || guardedEnv,
    encoding: 'utf8',
    stdio: options.capture ? 'pipe' : 'inherit',
  });
  if (result.error) throw result.error;
  return result;
}

function verifyGuard(label, source) {
  const result = run(process.execPath, ['-e', source], { capture: true });
  const output = `${result.stdout || ''}${result.stderr || ''}`;
  if (result.status === 0 || !output.includes('[ci-test-guard]')) {
    process.stderr.write(output);
    throw new Error(`CI guard probe did not block ${label}`);
  }
  process.stdout.write(`CI guard verified: ${label}\n`);
}

verifyGuard(
  'better-sqlite3',
  `const r=require('node:module').createRequire(${JSON.stringify(path.join(root, 'products/shell/backend/package.json'))}); new (r('better-sqlite3'))(':memory:')`,
);
verifyGuard('real network', "require('node:net').connect(9, '127.0.0.1')");
verifyGuard(
  'seed commands',
  "require('node:child_process').spawnSync('pnpm', ['run', 'seed:demo'])",
);

const packages = [
  '@rdfgis/explorer-backend',
  '@rdfgis/shell-backend',
  '@rdfgis/shell-frontend',
  '@rdfgis/rdf-explorer-frontend',
  '@rdfgis/gis-explorer-frontend',
];

for (const packageName of packages) {
  const result = run('pnpm', ['--filter', packageName, 'test:ci']);
  if (result.status !== 0) process.exit(result.status || 1);
}
