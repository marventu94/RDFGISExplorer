import { describe, expect, it, vi } from 'vitest';
import type { Query } from '../graph/domain';

import { queryExportLabel } from './query-export-label';

function queryWithRoot(variable: string, isVariable = true): Query {
  return {
    root: {
      isVariable: vi.fn().mockReturnValue(isVariable),
      variable: { toString: () => variable },
    },
  } as unknown as Query;
}

describe('queryExportLabel', () => {
  it('includes the panel, query number and structured root variable', () => {
    expect(queryExportLabel('Inmuebles', 0, queryWithRoot('?listing')))
      .toBe('Inmuebles · Query 1 (?listing)');
  });

  it('keeps a useful label when the root has no variable', () => {
    expect(queryExportLabel('Panel', 1, queryWithRoot('?ignored', false)))
      .toBe('Panel · Query 2');
  });

  it('preserves long names so the UI can expose the full value while clipping visually', () => {
    const panel = 'Panel con un nombre descriptivo muy largo';
    const label = queryExportLabel(panel, 9, queryWithRoot('?variable_raiz_muy_larga'));

    expect(label).toBe(`${panel} · Query 10 (?variable_raiz_muy_larga)`);
  });
});
