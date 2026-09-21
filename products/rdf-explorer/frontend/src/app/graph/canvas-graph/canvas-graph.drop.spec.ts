import { describe, it, expect } from 'vitest';
import { parseDropPayload } from './canvas-graph.drop';

describe('parseDropPayload', () => {
  function makeDataTransfer(data: Record<string, string>): DataTransfer {
    return {
      getData: (key: string) => data[key] ?? '',
    } as DataTransfer;
  }

  it('parses example drop', () => {
    const dt = makeDataTransfer({ special: 'example', type: 'cats' });
    const result = parseDropPayload(dt);
    expect(result).toEqual({ kind: 'example', exampleType: 'cats' });
  });

  it('parses search drop', () => {
    const dt = makeDataTransfer({
      special: 'search',
      uri: 'http://example.com/Q1',
      alias: 'test',
    });
    const result = parseDropPayload(dt);
    expect(result).toEqual({
      kind: 'search',
      uri: 'http://example.com/Q1',
      alias: 'test',
    });
  });

  it('parses literal drop', () => {
    const dt = makeDataTransfer({ special: 'literal', prop: 'http://example.com/P1' });
    const result = parseDropPayload(dt);
    expect(result).toEqual({ kind: 'literal', prop: 'http://example.com/P1' });
  });

  it('parses uri+prop drop', () => {
    const dt = makeDataTransfer({ uri: 'http://example.com/Q1', prop: 'http://example.com/P1' });
    const result = parseDropPayload(dt);
    expect(result).toEqual({ kind: 'uri+prop', uri: 'http://example.com/Q1', prop: 'http://example.com/P1' });
  });

  it('parses prop only drop', () => {
    const dt = makeDataTransfer({ prop: 'http://example.com/P1' });
    const result = parseDropPayload(dt);
    expect(result).toEqual({ kind: 'prop', prop: 'http://example.com/P1' });
  });

  it('parses uri only drop', () => {
    const dt = makeDataTransfer({ uri: 'http://example.com/Q1' });
    const result = parseDropPayload(dt);
    expect(result).toEqual({ kind: 'uri', uri: 'http://example.com/Q1' });
  });

  it('returns null for empty data', () => {
    const dt = makeDataTransfer({});
    expect(parseDropPayload(dt)).toBeNull();
  });

  it('returns null for unrecognized special', () => {
    const dt = makeDataTransfer({ special: 'unknown' });
    expect(parseDropPayload(dt)).toBeNull();
  });
});
