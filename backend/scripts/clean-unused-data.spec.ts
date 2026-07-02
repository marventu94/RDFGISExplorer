import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { identify } from './clean-unused-data';

describe('clean-unused-data identify()', () => {
  let tmpDir: string;
  const ORIGINAL_ENV = { ...process.env };

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'clean-data-test-'));
    delete process.env['DASHBOARDS_SQLITE_PATH'];
    delete process.env['SPARQL_PROTECTED_BACKENDS'];
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    process.env = { ...ORIGINAL_ENV };
  });

  function makeFile(name: string, content = 'x'): string {
    const full = path.join(tmpDir, name);
    fs.writeFileSync(full, content);
    return full;
  }

  it('returns no candidates when the directory is empty', () => {
    const result = identify({ dataDir: tmpDir, activePath: '/nope.sqlite' });
    expect(result.candidates).toEqual([]);
  });

  it('ignores the active dashboards file', () => {
    const active = makeFile('wikidata.sqlite');
    makeFile('graphdb.sqlite');
    const result = identify({ dataDir: tmpDir, activePath: active });
    expect(result.candidates.map((c) => c.basename)).toEqual([]);
  });

  it('keeps protected backends (default: wikidata, graphdb)', () => {
    const active = makeFile('millenniumdb.sqlite');
    makeFile('wikidata.sqlite');
    makeFile('graphdb.sqlite');
    makeFile('generic.sqlite');
    const result = identify({ dataDir: tmpDir, activePath: active });
    const names = result.candidates.map((c) => c.basename);
    expect(names).toContain('generic.sqlite');
    expect(names).not.toContain('wikidata.sqlite');
    expect(names).not.toContain('graphdb.sqlite');
  });

  it('honors custom protected backends via option', () => {
    const active = makeFile('wikidata.sqlite');
    makeFile('graphdb.sqlite');
    makeFile('generic.sqlite');
    const result = identify({
      dataDir: tmpDir,
      activePath: active,
      protectedBackends: ['graphdb', 'generic'],
    });
    const names = result.candidates.map((c) => c.basename);
    expect(names).toEqual([]);
  });

  it('flags legacy default names (dashboards.sqlite, settings.sqlite) as legacy-path', () => {
    const active = makeFile('wikidata.sqlite');
    makeFile('dashboards.sqlite');
    makeFile('settings.sqlite');
    const result = identify({ dataDir: tmpDir, activePath: active });
    const byBase = Object.fromEntries(
      result.candidates.map((c) => [c.basename, c.reason]),
    );
    expect(byBase['dashboards.sqlite']).toBe('legacy-path');
    expect(byBase['settings.sqlite']).toBe('legacy-path');
  });

  it('includes sibling -shm and -wal files in the cleanup candidate', () => {
    const active = makeFile('wikidata.sqlite');
    const orphan = makeFile('generic.sqlite');
    fs.writeFileSync(`${orphan}-shm`, 'shm');
    fs.writeFileSync(`${orphan}-wal`, 'wal');
    const result = identify({ dataDir: tmpDir, activePath: active });
    const candidate = result.candidates.find(
      (c) => c.basename === 'generic.sqlite',
    );
    expect(candidate).toBeDefined();
    expect(candidate!.siblings).toEqual(
      expect.arrayContaining([`${orphan}-shm`, `${orphan}-wal`]),
    );
  });

  it('ignores sibling files of the active database', () => {
    const active = makeFile('wikidata.sqlite');
    fs.writeFileSync(`${active}-shm`, 'shm');
    fs.writeFileSync(`${active}-wal`, 'wal');
    const result = identify({ dataDir: tmpDir, activePath: active });
    expect(result.candidates).toEqual([]);
  });

  it('handles .db files as orphan-backend candidates', () => {
    const active = makeFile('wikidata.sqlite');
    makeFile('curation.db');
    const result = identify({ dataDir: tmpDir, activePath: active });
    const names = result.candidates.map((c) => c.basename);
    expect(names).toContain('curation.db');
  });
});
