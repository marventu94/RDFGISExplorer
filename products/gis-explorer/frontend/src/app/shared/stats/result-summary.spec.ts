import {
  classifyVariables,
  computeLocalSummary,
  MAX_CATEGORICAL_DISTINCT,
  TOP_CATEGORICAL_VALUES,
} from './result-summary';
import type { BindingValue, QueryResult, ResultBinding } from '@shared/models';

const XSD = 'http://www.w3.org/2001/XMLSchema#';

function num(n: number, datatype = `${XSD}integer`): BindingValue {
  return { type: 'literal', value: String(n), datatype };
}

function uri(u: string): BindingValue {
  return { type: 'uri', value: u };
}

function text(s: string): BindingValue {
  return { type: 'literal', value: s };
}

function date(iso: string): BindingValue {
  return { type: 'date', value: iso, raw: iso };
}

function makeResult(
  variables: string[],
  bindings: ResultBinding[],
  truncated = false,
): QueryResult {
  return {
    variables,
    bindings,
    nodes: [],
    edges: [],
    meta: { durationMs: 0, truncated, limitApplied: 2000, backend: 'wikidata' },
  };
}

describe('classifyVariables', () => {
  it('classifies a variable with >=90% numeric literals as numeric', () => {
    const result = makeResult(
      ['price'],
      [num(1), num(2), num(3), num(4), num(5), num(6), num(7), num(8), num(9)].map((v) => ({
        price: v,
      })),
    );
    expect(classifyVariables(result).numeric).toEqual(['price']);
  });

  it('accepts untyped literals whose text parses fully as a number', () => {
    const result = makeResult(
      ['score'],
      [{ score: text('1.5') }, { score: text('-3') }, { score: text('2e3') }],
    );
    expect(classifyVariables(result).numeric).toEqual(['score']);
  });

  it('does not classify a dirty variable (<90% numeric) as numeric', () => {
    // 8 de 10 numéricos: por debajo del umbral del 90%.
    const rows: ResultBinding[] = [
      { v: num(1) }, { v: num(2) }, { v: num(3) }, { v: num(4) }, { v: num(5) },
      { v: num(6) }, { v: num(7) }, { v: num(8) }, { v: text('n/a') }, { v: text('?') },
    ];
    const result = makeResult(['v'], rows);
    const classification = classifyVariables(result);
    expect(classification.numeric).toEqual([]);
  });

  it('classifies a variable with normalized date values as temporal', () => {
    const result = makeResult(
      ['inception'],
      [{ inception: date('1990-01-01T00:00:00Z') }, { inception: date('2001-06-15T00:00:00Z') }],
    );
    expect(classifyVariables(result).temporal).toEqual(['inception']);
  });

  it('ignores null/unbound values when computing the numeric ratio', () => {
    const rows: ResultBinding[] = [
      { v: num(1) }, { v: num(2) }, { v: num(3) }, { v: num(4) }, { v: num(5) },
      { v: num(6) }, { v: num(7) }, { v: num(8) }, { v: num(9) },
      {}, // fila sin valor para ?v: no cuenta ni a favor ni en contra
    ];
    const result = makeResult(['v'], rows);
    expect(classifyVariables(result).numeric).toEqual(['v']);
  });

  it('classifies a low-cardinality uri variable as categorical', () => {
    const rows: ResultBinding[] = [
      { city: uri('http://www.wikidata.org/entity/Q1486') },
      { city: uri('http://www.wikidata.org/entity/Q649') },
      { city: uri('http://www.wikidata.org/entity/Q1486') },
    ];
    const result = makeResult(['city'], rows);
    expect(classifyVariables(result).categorical).toEqual(['city']);
  });

  it('classifies short literals as categorical', () => {
    const result = makeResult(
      ['kind'],
      [{ kind: text('casa') }, { kind: text('depto') }, { kind: text('casa') }],
    );
    expect(classifyVariables(result).categorical).toEqual(['kind']);
  });

  it('does not classify a variable with >20 distinct values as categorical', () => {
    const rows: ResultBinding[] = [];
    for (let i = 0; i <= MAX_CATEGORICAL_DISTINCT; i++) {
      rows.push({ label: text(`valor ${i}`) });
    }
    const result = makeResult(['label'], rows);
    expect(classifyVariables(result).categorical).toEqual([]);
  });

  it('does not classify long free text as categorical', () => {
    const long = 'x'.repeat(200);
    const result = makeResult(['desc'], [{ desc: text(long) }, { desc: text(long) }]);
    expect(classifyVariables(result).categorical).toEqual([]);
  });

  it('skips variables with no non-null values', () => {
    const result = makeResult(['ghost'], [{}]);
    const classification = classifyVariables(result);
    expect(classification).toEqual({ numeric: [], temporal: [], categorical: [] });
  });

  it('caps the number of variables per kind', () => {
    const numericVars = ['n1', 'n2', 'n3', 'n4'];
    const rows: ResultBinding[] = [Object.fromEntries(numericVars.map((v) => [v, num(1)]))];
    const result = makeResult(numericVars, rows);
    expect(classifyVariables(result).numeric).toEqual(['n1', 'n2', 'n3']);

    const temporalVars = ['t1', 't2', 't3'];
    const tRows: ResultBinding[] = [
      Object.fromEntries(temporalVars.map((v) => [v, date('2000-01-01T00:00:00Z')])),
    ];
    const tResult = makeResult(temporalVars, tRows);
    expect(classifyVariables(tResult).temporal).toEqual(['t1', 't2']);
  });
});

describe('computeLocalSummary', () => {
  it('computes totals and numeric aggregates over all rows', () => {
    const result = makeResult(
      ['price'],
      [{ price: num(10) }, { price: num(20) }, { price: num(30) }, {}],
    );
    const summary = computeLocalSummary(result, classifyVariables(result));

    expect(summary.totalRows).toBe(4);
    expect(summary.numeric).toEqual([
      { variable: 'price', count: 3, min: 10, max: 30, avg: 20 },
    ]);
    expect(summary.failed).toEqual({ total: false, numeric: [], temporal: [], categorical: [] });
    expect(summary.meta.backend).toBe('wikidata');
  });

  it('computes temporal ranges', () => {
    const result = makeResult(
      ['date'],
      [
        { date: date('2020-05-01T00:00:00Z') },
        { date: date('1999-12-31T00:00:00Z') },
        { date: date('2024-01-01T00:00:00Z') },
      ],
    );
    const summary = computeLocalSummary(result, classifyVariables(result));
    expect(summary.temporal).toEqual([
      { variable: 'date', min: '1999-12-31T00:00:00Z', max: '2024-01-01T00:00:00Z' },
    ]);
  });

  it('computes categorical top values ordered by count', () => {
    const rows: ResultBinding[] = [];
    for (let i = 0; i < 5; i++) rows.push({ city: uri('http://x/a') });
    for (let i = 0; i < 3; i++) rows.push({ city: uri('http://x/b') });
    rows.push({ city: uri('http://x/c') });
    const result = makeResult(['city'], rows);
    const summary = computeLocalSummary(result, classifyVariables(result));

    expect(summary.categorical).toEqual([
      {
        variable: 'city',
        values: [
          { value: 'http://x/a', count: 5 },
          { value: 'http://x/b', count: 3 },
          { value: 'http://x/c', count: 1 },
        ],
      },
    ]);
  });

  it('keeps at most TOP_CATEGORICAL_VALUES values per categorical variable', () => {
    const rows: ResultBinding[] = [];
    // 15 valores distintos (<= 20, sigue siendo categórica) con conteos decrecientes.
    for (let v = 0; v < 15; v++) {
      for (let i = 0; i < 15 - v; i++) rows.push({ k: text(`valor${v}`) });
    }
    const result = makeResult(['k'], rows);
    const summary = computeLocalSummary(result, classifyVariables(result));

    expect(summary.categorical).toHaveLength(1);
    expect(summary.categorical[0].values).toHaveLength(TOP_CATEGORICAL_VALUES);
    expect(summary.categorical[0].values[0]).toEqual({ value: 'valor0', count: 15 });
  });
});
