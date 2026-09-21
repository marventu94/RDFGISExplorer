import { describe, it, expect, vi } from 'vitest';
import { copyToClipboard } from './clipboard.util';

describe('copyToClipboard', () => {
  it('calls navigator.clipboard.writeText', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });

    await copyToClipboard('hello');

    expect(writeText).toHaveBeenCalledWith('hello');
  });
});
