import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import * as path from 'path';
import { __testing } from './sqlite.provider';

const { resolveDashboardsPath, normalizeBackend } = __testing;

describe('sqlite.provider path resolution', () => {
  const ORIGINAL_ENV = { ...process.env };

  beforeEach(() => {
    delete process.env['DASHBOARDS_SQLITE_PATH'];
    delete process.env['SPARQL_BACKEND'];
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it('normalizes backend name safely', () => {
    expect(normalizeBackend(undefined)).toBe('wikidata');
    expect(normalizeBackend('wikidata')).toBe('wikidata');
    expect(normalizeBackend('GRAPHDB')).toBe('graphdb');
    expect(normalizeBackend('MillenniumDB')).toBe('millenniumdb');
    expect(normalizeBackend('with spaces')).toBe('withspaces');
    expect(normalizeBackend('../etc/passwd')).toBe('etcpasswd');
  });

  it('derives dashboards path from SPARQL_BACKEND by default', () => {
    process.env['SPARQL_BACKEND'] = 'graphdb';
    expect(resolveDashboardsPath()).toBe(path.resolve('./data/graphdb.sqlite'));
  });

  it('defaults to wikidata when no backend is set', () => {
    expect(resolveDashboardsPath()).toBe(
      path.resolve('./data/wikidata.sqlite'),
    );
  });

  it('respects explicit DASHBOARDS_SQLITE_PATH override', () => {
    process.env['DASHBOARDS_SQLITE_PATH'] = '/var/lib/custom.sqlite';
    expect(resolveDashboardsPath()).toBe('/var/lib/custom.sqlite');
  });

  it('ignores empty DASHBOARDS_SQLITE_PATH', () => {
    process.env['DASHBOARDS_SQLITE_PATH'] = '   ';
    expect(resolveDashboardsPath()).toBe(
      path.resolve('./data/wikidata.sqlite'),
    );
  });
});
