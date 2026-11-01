import { describe, expect, it } from 'vitest';
import { isCalendarDay, validTemporalRange, temporalRangeContains } from './temporal-range';

describe('precise calendar-day filters', () => {
  it('validates actual dates and ordered bounds', () => {
    expect(isCalendarDay('2023-02-29')).toBe(false);
    expect(isCalendarDay('2024-02-29')).toBe(true);
    expect(validTemporalRange('2023-11-30', '2023-10-01')).toBe(false);
    expect(validTemporalRange('2023-10-01', '2023-10-01')).toBe(true);
  });
  it('includes the entire final day for dates, unzoned times, fractions and offsets without browser-zone shifts', () => {
    for (const value of ['2023-10-01', '2023-10-01T00:00:00+14:00', '2023-11-30', '2023-11-30T23:59:59.999999', '2023-11-30T23:59:59.999-03:00']) {
      expect(temporalRangeContains(value, '2023-10-01', '2023-11-30'), value).toBe(true);
    }
    for (const value of ['2023-09-30T23:59:59-03:00', '2023-12-01T00:00:00+14:00']) {
      expect(temporalRangeContains(value, '2023-10-01', '2023-11-30'), value).toBe(false);
    }
  });
  it('compares visual/legacy ranges as instants, including date-only and timezone-less data', () => {
    expect(temporalRangeContains('2023-11-30T23:00:00-03:00', '2023-12-01T01:00:00Z', '2023-12-01T03:00:00Z')).toBe(true);
    expect(temporalRangeContains('2023-10-01', '2023-10-01T00:00:00.000Z', '2023-10-01T00:00:00.000Z')).toBe(true);
    expect(temporalRangeContains('2023-10-01T00:00:00', '2023-10-01T00:00:00.000Z', '2023-10-01T00:00:00.000Z')).toBe(true);
  });
});
