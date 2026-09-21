'use strict';

const Module = require('node:module');
const childProcess = require('node:child_process');
const net = require('node:net');
const tls = require('node:tls');

const PREFIX = '[ci-test-guard]';

function forbidden(action) {
  return new Error(`${PREFIX} forbidden during CI tests: ${action}`);
}

if (/seed/i.test(process.env.npm_lifecycle_event || '')) {
  throw forbidden(`seed lifecycle ${process.env.npm_lifecycle_event}`);
}

const originalLoad = Module._load;
Module._load = function guardedLoad(request, parent, isMain) {
  const loaded = originalLoad.apply(this, arguments);
  if (request !== 'better-sqlite3') return loaded;

  return new Proxy(loaded, {
    apply() {
      throw forbidden('opening better-sqlite3');
    },
    construct() {
      throw forbidden('opening better-sqlite3');
    },
  });
};

function blockedConnection() {
  throw forbidden('real network connection');
}

net.connect = blockedConnection;
net.createConnection = blockedConnection;
net.Socket.prototype.connect = blockedConnection;
tls.connect = blockedConnection;

function commandText(command, args) {
  return [command, ...(Array.isArray(args) ? args : [])].join(' ');
}

for (const method of ['exec', 'execFile', 'execFileSync', 'execSync', 'spawn', 'spawnSync']) {
  const original = childProcess[method];
  childProcess[method] = function guardedChildProcess(command, args) {
    if (/\bseed(?::|\b)/i.test(commandText(command, args))) {
      throw forbidden(`seed command: ${commandText(command, args)}`);
    }
    return original.apply(this, arguments);
  };
}
