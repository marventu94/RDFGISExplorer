import { describe, expect, it, vi } from 'vitest';
import { closePanelFlow } from './panel-close';

describe('closePanelFlow', () => {
  it('closes a clean panel without prompting', async () => {
    const confirm = vi.fn<() => Promise<boolean>>();
    const close = vi.fn();
    expect(await closePanelFlow(false, confirm, close)).toBe(true);
    expect(confirm).not.toHaveBeenCalled();
    expect(close).toHaveBeenCalledOnce();
  });

  it('prompts for a dirty panel and keeps it when cancelled', async () => {
    const confirm = vi.fn().mockResolvedValue(false);
    const close = vi.fn();
    expect(await closePanelFlow(true, confirm, close)).toBe(false);
    expect(confirm).toHaveBeenCalledOnce();
    expect(close).not.toHaveBeenCalled();
  });

  it('removes a dirty panel when discard is confirmed', async () => {
    const confirm = vi.fn().mockResolvedValue(true);
    const close = vi.fn();
    expect(await closePanelFlow(true, confirm, close)).toBe(true);
    expect(confirm).toHaveBeenCalledOnce();
    expect(close).toHaveBeenCalledOnce();
  });
});
