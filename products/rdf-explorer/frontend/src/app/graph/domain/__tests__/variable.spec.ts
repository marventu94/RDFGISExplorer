import { describe, it, expect } from 'vitest';
import { Variable } from '../variable';
import type { VariableContext } from '../variable';

function makeContext(aliases?: string[]): VariableContext {
  const set = new Set(aliases ?? []);
  return { usedAliases: set, log: () => {} };
}

describe('Variable', () => {
  describe('id generation', () => {
    it('generates sequential IDs for unbound variables', () => {
      const ctx = makeContext();
      const ids = { varResCounter: 0, varPropCounter: 0, varUnboundCounter: 0 };
      const v1 = new Variable(ctx, null, ids);
      const v2 = new Variable(ctx, null, ids);
      expect(v1.id).toBe('0');
      expect(v2.id).toBe('1');
      expect(v1.toString()).toBe('?0');
      expect(v2.toString()).toBe('?1');
    });
  });

  describe('setAlias', () => {
    it('sets alias and updates usedAliases', () => {
      const ctx = makeContext();
      const ids = { varResCounter: 0, varPropCounter: 0, varUnboundCounter: 0 };
      const v = new Variable(ctx, null, ids);
      expect(v.setAlias('myVar', ctx)).toBe(true);
      expect(v.alias).toBe('myVar');
      expect(v.toString()).toBe('?myVar');
      expect(ctx.usedAliases.has('myVar')).toBe(true);
    });

    it('returns false on collision', () => {
      const ctx = makeContext(['taken']);
      const ids = { varResCounter: 0, varPropCounter: 0, varUnboundCounter: 0 };
      const v = new Variable(ctx, null, ids);
      expect(v.setAlias('taken', ctx)).toBe(false);
      expect(v.alias).toBe('');
    });

    it('replaces existing alias', () => {
      const ctx = makeContext();
      const ids = { varResCounter: 0, varPropCounter: 0, varUnboundCounter: 0 };
      const v = new Variable(ctx, null, ids);
      v.setAlias('first', ctx);
      expect(ctx.usedAliases.has('first')).toBe(true);
      v.setAlias('second', ctx);
      expect(ctx.usedAliases.has('first')).toBe(false);
      expect(ctx.usedAliases.has('second')).toBe(true);
      expect(v.alias).toBe('second');
    });

    it('no global state leak between contexts', () => {
      const ctx1 = makeContext();
      const ctx2 = makeContext();
      const ids = { varResCounter: 0, varPropCounter: 0, varUnboundCounter: 0 };
      const v1 = new Variable(ctx1, null, ids);
      const v2 = new Variable(ctx2, null, { ...ids });
      v1.setAlias('shared', ctx1);
      v2.setAlias('shared', ctx2);
      expect(v1.alias).toBe('shared');
      expect(v2.alias).toBe('shared');
      expect(ctx1.usedAliases.has('shared')).toBe(true);
      expect(ctx2.usedAliases.has('shared')).toBe(true);
    });

    it('replaces spaces with underscores', () => {
      const ctx = makeContext();
      const ids = { varResCounter: 0, varPropCounter: 0, varUnboundCounter: 0 };
      const v = new Variable(ctx, null, ids);
      v.setAlias('my var name', ctx);
      expect(v.alias).toBe('my_var_name');
    });
  });

  describe('filters', () => {
    it('addFilter creates and returns a Filter', () => {
      const ctx = makeContext();
      const ids = { varResCounter: 0, varPropCounter: 0, varUnboundCounter: 0 };
      const v = new Variable(ctx, null, ids);
      const f = v.addFilter('lang', { language: 'en' }, ctx);
      expect(v.filters.length).toBe(1);
      expect(f.type).toBe('lang');
      expect(f.variable).toBe(v);
    });

    it('removeFilter works', () => {
      const ctx = makeContext();
      const ids = { varResCounter: 0, varPropCounter: 0, varUnboundCounter: 0 };
      const v = new Variable(ctx, null, ids);
      const f = v.addFilter('regex', { regex: 'test' }, ctx);
      expect(v.removeFilter(f)).toBe(true);
      expect(v.filters.length).toBe(0);
      expect(v.removeFilter(f)).toBe(false);
    });
  });

  describe('isBinded', () => {
    it('returns false for unbound variable', () => {
      const ctx = makeContext();
      const ids = { varResCounter: 0, varPropCounter: 0, varUnboundCounter: 0 };
      const v = new Variable(ctx, null, ids);
      expect(v.isBinded()).toBe(false);
    });
  });

  describe('getName', () => {
    it('returns alias when set', () => {
      const ctx = makeContext();
      const ids = { varResCounter: 0, varPropCounter: 0, varUnboundCounter: 0 };
      const v = new Variable(ctx, null, ids);
      v.setAlias('test', ctx);
      expect(v.getName()).toBe('test');
    });

    it('returns id when no alias', () => {
      const ctx = makeContext();
      const ids = { varResCounter: 0, varPropCounter: 0, varUnboundCounter: 0 };
      const v = new Variable(ctx, null, ids);
      expect(v.getName()).toBe('0');
    });
  });
});
