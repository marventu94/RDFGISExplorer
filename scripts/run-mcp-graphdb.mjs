#!/usr/bin/env node
// Wrapper que lee .env.graphdb y arranca el MCP server de GraphDB.
// Asume SPARQL_ENDPOINT_URL = http://host:port/repositories/<repo>

import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ENV_FILE = process.env.ENV_FILE || resolve(__dirname, '..', '.env.graphdb');

let content;
try {
  content = readFileSync(ENV_FILE, 'utf8');
} catch (err) {
  console.error(`ERROR: no se pudo leer ${ENV_FILE}:`, err.message);
  process.exit(1);
}

const env = {};
for (const line of content.split(/\r?\n/)) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) continue;
  const match = trimmed.match(/^([^=]+)=(.*)$/);
  if (!match) continue;
  const key = match[1].trim();
  let value = match[2].trim();
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1);
  }
  env[key] = value;
}

if (!env.SPARQL_ENDPOINT_URL) {
  console.error('ERROR: SPARQL_ENDPOINT_URL no está definido en', ENV_FILE);
  process.exit(1);
}

const url = env.SPARQL_ENDPOINT_URL;
const repositoriesIndex = url.indexOf('/repositories/');
if (repositoriesIndex === -1) {
  console.error('ERROR: SPARQL_ENDPOINT_URL debe tener el formato http://host:port/repositories/<repo>');
  process.exit(1);
}

const graphDbEndpoint = url.slice(0, repositoriesIndex);
const graphDbRepository = url.slice(repositoriesIndex + '/repositories/'.length);

const childEnv = {
  ...process.env,
  GRAPHDB_ENDPOINT: graphDbEndpoint,
  GRAPHDB_REPOSITORY: graphDbRepository,
};

if (env.SPARQL_USERNAME) childEnv.GRAPHDB_USERNAME = env.SPARQL_USERNAME;
if (env.SPARQL_PASSWORD) childEnv.GRAPHDB_PASSWORD = env.SPARQL_PASSWORD;

console.error(`>> MCP GraphDB: ${graphDbEndpoint} / ${graphDbRepository}`);

const serverPath = resolve(__dirname, '..', 'mcp-server-graphdb/dist/index.js');
spawn('node', [serverPath], {
  env: childEnv,
  stdio: 'inherit',
});
