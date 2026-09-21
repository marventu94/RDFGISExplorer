import { describe, expect, it } from 'vitest';

import {
  buildRowIndex,
  emptyRowIndex,
  firstRowWith,
  pickRowEntity,
  relatedUris,
  rowUris,
} from './row-index';
import type { NormalizedNode, QueryResult, ResultBinding } from '@shared/models';

function makeResult(bindings: ResultBinding[]): QueryResult {
  return {
    variables: Object.keys(bindings[0] ?? {}),
    bindings,
    nodes: [],
    edges: [],
    meta: { durationMs: 1, truncated: false, limitApplied: 500, backend: 'custom' },
  };
}

const uri = (value: string) => ({ type: 'uri' as const, value });
const literal = (value: string) => ({ type: 'literal' as const, value });

/** Typical spatiotemporal query row containing several entities. */
const row1: ResultBinding = {
  listing: uri('urn:listing/1'),
  realEstate: uri('urn:casa/1'),
  label: literal('Casa 1'),
  geometry: uri('urn:geo/1'),
};
const row2: ResultBinding = {
  listing: uri('urn:listing/2'),
  realEstate: uri('urn:casa/2'),
  label: literal('Casa 2'),
  geometry: uri('urn:geo/2'),
};

describe('row-index', () => {
  describe('rowUris', () => {
    it('collects every uri of the row, ignoring literals', () => {
      expect(rowUris(row1)).toEqual(['urn:listing/1', 'urn:casa/1', 'urn:geo/1']);
    });

    it('normalizes bnodes the way the graph identifies them', () => {
      expect(rowUris({ x: { type: 'bnode', value: 'b0' } })).toEqual(['_:b0']);
      expect(rowUris({ x: { type: 'bnode', value: '_:b0' } })).toEqual(['_:b0']);
    });

    it('does not repeat an entity that appears in two columns', () => {
      expect(rowUris({ a: uri('urn:x'), b: uri('urn:x') })).toEqual(['urn:x']);
    });
  });

  describe('buildRowIndex', () => {
    it('returns an empty index for a missing or empty result', () => {
      expect(buildRowIndex(null)).toEqual(emptyRowIndex());
      expect(buildRowIndex(makeResult([]))).toEqual(emptyRowIndex());
    });

    it('indexes each entity by the rows it appears in', () => {
      const index = buildRowIndex(makeResult([row1, row2]));

      expect(index.rowsByUri.get('urn:casa/1')).toEqual([0]);
      expect(index.rowsByUri.get('urn:geo/2')).toEqual([1]);
      expect(index.urisByRow[0]).toEqual(['urn:listing/1', 'urn:casa/1', 'urn:geo/1']);
    });

    it('keeps every row of an entity shared by several rows', () => {
      const shared = uri('urn:ciudad/berisso');
      const index = buildRowIndex(
        makeResult([
          { ...row1, city: shared },
          { ...row2, city: shared },
        ]),
      );

      expect(index.rowsByUri.get('urn:ciudad/berisso')).toEqual([0, 1]);
    });
  });

  describe('relatedUris', () => {
    it('is empty for no selection', () => {
      expect(relatedUris(buildRowIndex(makeResult([row1])), null).size).toBe(0);
    });

    it('groups the entities that share a row', () => {
      const index = buildRowIndex(makeResult([row1, row2]));

      // Clicking map geometry must let the table reach the related notice.
      expect([...relatedUris(index, 'urn:geo/1')].sort()).toEqual([
        'urn:casa/1',
        'urn:geo/1',
        'urn:listing/1',
      ]);
    });

    it('does not mix entities of other rows', () => {
      const index = buildRowIndex(makeResult([row1, row2]));
      expect(relatedUris(index, 'urn:casa/1').has('urn:casa/2')).toBe(false);
    });

    it('returns the entity itself when the result does not mention it', () => {
      const index = buildRowIndex(makeResult([row1]));
      expect([...relatedUris(index, 'urn:desconocida')]).toEqual(['urn:desconocida']);
    });

    it('caps how many rows of a very shared entity are expanded', () => {
      const shared = uri('urn:ciudad/berisso');
      const bindings = Array.from({ length: 10 }, (_, i) => ({
        city: shared,
        listing: uri(`urn:listing/${i}`),
      }));
      const index = buildRowIndex(makeResult(bindings));

      const related = relatedUris(index, 'urn:ciudad/berisso', 3);

      expect(related.has('urn:listing/0')).toBe(true);
      expect(related.has('urn:listing/2')).toBe(true);
      expect(related.has('urn:listing/3')).toBe(false);
    });
  });

  describe('firstRowWith', () => {
    it('finds the first row of an entity, or -1', () => {
      const index = buildRowIndex(makeResult([row1, row2]));
      expect(firstRowWith(index, 'urn:casa/2')).toBe(1);
      expect(firstRowWith(index, 'urn:nada')).toBe(-1);
      expect(firstRowWith(index, null)).toBe(-1);
    });
  });

  describe('pickRowEntity', () => {
    const structural: NormalizedNode = {
      uri: 'urn:geo/1',
      label: 'Geometría',
      attributes: {},
    };
    const withCoordinate: NormalizedNode = {
      uri: 'urn:casa/1',
      label: 'Casa 1',
      attributes: {},
      coordinate: { lat: -34.87, lng: -57.89 },
    };
    const withDates: NormalizedNode = {
      uri: 'urn:listing/1',
      label: 'Aviso 1',
      attributes: {},
      temporalEvents: [{ field: 'fecha', isoDate: '2023-05-01T00:00:00Z' }],
    };

    function index(nodes: NormalizedNode[]): Map<string, NormalizedNode> {
      return new Map(nodes.map((n) => [n.uri, n]));
    }

    it('prefers an entity with data of its own over a structural node', () => {
      const picked = pickRowEntity(
        ['urn:geo/1', 'urn:casa/1'],
        index([structural, withCoordinate]),
      );
      expect(picked).toBe(withCoordinate);
    });

    it('accepts temporal events as data of its own', () => {
      const picked = pickRowEntity(['urn:geo/1', 'urn:listing/1'], index([structural, withDates]));
      expect(picked).toBe(withDates);
    });

    it('falls back to the first known entity when none has data of its own', () => {
      const picked = pickRowEntity(['urn:geo/1'], index([structural]));
      expect(picked).toBe(structural);
    });

    it('returns null when the row has no entity in the result', () => {
      expect(pickRowEntity(['urn:otra'], index([structural]))).toBeNull();
      expect(pickRowEntity([], index([structural]))).toBeNull();
    });
  });
});
