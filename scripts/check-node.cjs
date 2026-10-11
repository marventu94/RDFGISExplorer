'use strict';

// Corta antes de instalar/arrancar si el Node activo no es el de .nvmrc.
// better-sqlite3 es nativo: compilado con un major y cargado con otro falla
// con NODE_MODULE_VERSION a mitad de los tests o del arranque.

const fs = require('node:fs');
const path = require('node:path');

const expected = fs
  .readFileSync(path.join(__dirname, '..', '.nvmrc'), 'utf8')
  .trim()
  .replace(/^v/, '');
const expectedMajor = expected.split('.')[0];
const currentMajor = process.versions.node.split('.')[0];

if (currentMajor !== expectedMajor) {
  process.stderr.write(
    `[check-node] Node ${process.versions.node} activo; el proyecto requiere Node ${expected} (.nvmrc).\n` +
      '[check-node] Ejecutar `nvm use` (o `nvm alias default ' +
      `${expected}\`) y reintentar.\n`,
  );
  process.exit(1);
}
