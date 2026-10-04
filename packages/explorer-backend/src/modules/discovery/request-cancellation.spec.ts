import { EventEmitter } from 'node:events';
import type { Response } from 'express';
import { withRequestCancellation } from './request-cancellation';

function response() {
  return Object.assign(new EventEmitter(), {
    writableEnded: false,
    destroyed: false,
  });
}
describe('discovery HTTP cancellation', () => {
  it('aborts work on a premature response close and removes the listener', async () => {
    const res = response();
    const work = withRequestCancellation(
      res as unknown as Response,
      (signal) =>
        new Promise<void>((_, reject) => {
          signal.addEventListener('abort', () =>
            reject(new DOMException('cancelled', 'AbortError')),
          );
        }),
    );
    const cancelled = expect(work).rejects.toMatchObject({
      name: 'AbortError',
    });
    res.emit('close');
    await cancelled;
    expect(res.listenerCount('close')).toBe(0);
  });
  it('does not cancel a normally completed response', async () => {
    const res = response();
    const result = await withRequestCancellation(
      res as unknown as Response,
      (signal) => {
        res.writableEnded = true;
        res.emit('close');
        expect(signal.aborted).toBe(false);
        return Promise.resolve(1);
      },
    );
    expect(result).toBe(1);
    expect(res.listenerCount('close')).toBe(0);
  });
});
