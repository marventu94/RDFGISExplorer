import { describe, it, expect } from 'vitest';
import { Filter } from '../filter';
import type { FilterType } from '../filter';
import { Variable } from '../variable';
import type { VariableContext } from '../variable';
import { GenericAdapter } from '../endpoint/generic-adapter';

function makeContext(): VariableContext {
  return { usedAliases: new Set(), log: () => {} };
}

function makeVariable(alias?: string): Variable {
  const ctx = makeContext();
  const ids = { varResCounter: 0, varPropCounter: 0, varUnboundCounter: 0 };
  const v = new Variable(ctx, null, ids);
  if (alias) v.setAlias(alias, ctx);
  return v;
}

const adapter = new GenericAdapter();

describe('Filter', () => {
  describe('serialize', () => {
    it('lang filter', () => {
      const v = makeVariable('label');
      const f = new Filter(v, 'lang', { language: 'en' });
      expect(f.serialize(adapter)).toBe('FILTER (lang(?label) = "en")\n');
    });

    it('lang filter with var ID', () => {
      const v = makeVariable();
      const f = new Filter(v, 'lang', { language: 'fr' });
      expect(f.serialize(adapter)).toBe('FILTER (lang(?0) = "fr")\n');
    });

    it('text filter delegates to adapter', () => {
      const v = makeVariable('q');
      const f = new Filter(v, 'text', { keyword: 'Einstein' });
      const result = f.serialize(adapter);
      expect(result).toContain('?q');
      expect(result).toContain('Einstein');
      expect(result).toContain('FILTER regex');
      expect(result).toContain('"i"');
      expect(result.endsWith('\n')).toBe(true);
    });

    it('regex filter', () => {
      const v = makeVariable('x');
      const f = new Filter(v, 'regex', { regex: '^test' });
      expect(f.serialize(adapter)).toBe('FILTER regex(?x, "^test", "i")\n');
    });

    it('leq filter', () => {
      const v = makeVariable('age');
      const f = new Filter(v, 'leq', { number: 100 });
      expect(f.serialize(adapter)).toBe('FILTER (?age < 100)\n');
    });

    it('geq filter', () => {
      const v = makeVariable('count');
      const f = new Filter(v, 'geq', { number: 5 });
      expect(f.serialize(adapter)).toBe('FILTER (?count > 5)\n');
    });

    it('isuri filter', () => {
      const v = makeVariable('x');
      const f = new Filter(v, 'isuri', {});
      expect(f.serialize(adapter)).toBe('FILTER isIRI(?x)\n');
    });

    it('isliteral filter', () => {
      const v = makeVariable('x');
      const f = new Filter(v, 'isliteral', {});
      expect(f.serialize(adapter)).toBe('FILTER isLiteral(?x)\n');
    });
  });
});
