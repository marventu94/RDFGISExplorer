import { maxPayloadBytes } from './create-dashboard.dto';

describe('maxPayloadBytes (DASHBOARD_MAX_PAYLOAD_BYTES)', () => {
  afterEach(() => {
    delete process.env['DASHBOARD_MAX_PAYLOAD_BYTES'];
  });

  it('defaults to 1 MB when the env var is not set', () => {
    expect(maxPayloadBytes()).toBe(1024 * 1024);
  });

  it('reads the limit from env', () => {
    process.env['DASHBOARD_MAX_PAYLOAD_BYTES'] = '2048';
    expect(maxPayloadBytes()).toBe(2048);
  });

  it('falls back to the default on malformed values', () => {
    process.env['DASHBOARD_MAX_PAYLOAD_BYTES'] = 'abc';
    expect(maxPayloadBytes()).toBe(1024 * 1024);
    process.env['DASHBOARD_MAX_PAYLOAD_BYTES'] = '-10';
    expect(maxPayloadBytes()).toBe(1024 * 1024);
  });
});
