import { queryTimeout } from './query-timeout';

describe('global query timeout', () => {
  it('defaults to three minutes and caps configuration and explicit overrides', () => {
    expect(queryTimeout()).toBe(180000);
    expect(queryTimeout('invalid')).toBe(180000);
    expect(queryTimeout('300000', 600000)).toBe(180000);
    expect(queryTimeout('180000', 1000)).toBe(1000);
    expect(queryTimeout('10000', 180000)).toBe(10000);
  });
});
