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
  it('shows only the structured root variable', () => {
    expect(queryExportLabel(0, queryWithRoot('?listing'))).toBe('?listing');
  });

  it('keeps a useful label when the root has no variable', () => {
    expect(queryExportLabel(1, queryWithRoot('?ignored', false))).toBe('Query 2');
  });

  it('preserves long variable names so the UI can clip them visually', () => {
    expect(queryExportLabel(9, queryWithRoot('?variable_raiz_muy_larga')))
      .toBe('?variable_raiz_muy_larga');
  });
});
