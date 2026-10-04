import { DiscoveryQueue } from './discovery-queue';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error | DOMException) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
const flush = () => new Promise<void>((resolve) => setImmediate(resolve));

describe('DiscoveryQueue load protection', () => {
  it('shares identical work, runs one job at a time and rejects overflow', async () => {
    const queue = new DiscoveryQueue(1, 1);
    const first = deferred<number>();
    const task = jest.fn(() => first.promise);
    const secondTask = jest.fn(() => Promise.resolve(2));
    const a = queue.run('a', task);
    const duplicate = queue.run('a', task);
    const b = queue.run('b', secondTask);
    await expect(queue.run('overflow', secondTask)).rejects.toMatchObject({
      status: 429,
    });
    await flush();
    expect(task).toHaveBeenCalledTimes(1);
    expect(secondTask).not.toHaveBeenCalled();
    first.resolve(1);
    expect(await Promise.all([a, duplicate, b])).toEqual([1, 1, 2]);
    expect(secondTask).toHaveBeenCalledTimes(1);
  });

  it('removes an abandoned queued job without sending it upstream', async () => {
    const queue = new DiscoveryQueue(1, 1);
    const first = deferred<number>();
    const a = queue.run('active', () => first.promise);
    const controller = new AbortController();
    const task = jest.fn(() => Promise.resolve(2));
    const abandoned = queue.run('queued', task, controller.signal, true);
    const cancelled = expect(abandoned).rejects.toMatchObject({
      name: 'AbortError',
    });
    controller.abort();
    await cancelled;
    const replacement = queue.run('replacement', () => Promise.resolve(3));
    first.resolve(1);
    await Promise.all([a, replacement]);
    expect(task).not.toHaveBeenCalled();
  });

  it('keeps shared work until its last consumer leaves, then aborts upstream', async () => {
    const queue = new DiscoveryQueue(1, 1);
    const first = new AbortController();
    const second = new AbortController();
    let upstream!: AbortSignal;
    const task = jest.fn((signal: AbortSignal) => {
      upstream = signal;
      return new Promise<number>((_, reject) => {
        signal.addEventListener('abort', () =>
          reject(new DOMException('cancelled', 'AbortError')),
        );
      });
    });
    const a = queue.run('shared', task, first.signal);
    const b = queue.run('shared', task, second.signal);
    await flush();
    const cancelledA = expect(a).rejects.toMatchObject({ name: 'AbortError' });
    first.abort();
    await cancelledA;
    expect(upstream.aborted).toBe(false);
    const cancelledB = expect(b).rejects.toMatchObject({ name: 'AbortError' });
    second.abort();
    await cancelledB;
    expect(upstream.aborted).toBe(true);
    await flush();
  });

  it('holds the active slot after cancellation until the server execution settles', async () => {
    const queue = new DiscoveryQueue(1, 1);
    const server = deferred<number>();
    const controller = new AbortController();
    let upstream!: AbortSignal;
    const active = queue.run(
      'Casa',
      (signal) => {
        upstream = signal;
        return server.promise;
      },
      controller.signal,
    );
    await flush();
    const cancelled = expect(active).rejects.toMatchObject({
      name: 'AbortError',
    });
    controller.abort();
    await cancelled;
    expect(upstream.aborted).toBe(true);
    const nextTask = jest.fn(() => Promise.resolve(2));
    const next = queue.run('House', nextTask);
    await flush();
    expect(nextTask).not.toHaveBeenCalled();
    server.reject(new DOMException('cancelled', 'AbortError'));
    expect(await next).toBe(2);
    expect(nextTask).toHaveBeenCalledTimes(1);
  });

  it('finishes one active inventory load even if the typing caller detaches', async () => {
    const queue = new DiscoveryQueue(1, 1);
    const load = deferred<number>();
    const controller = new AbortController();
    let upstream!: AbortSignal;
    const task = jest.fn((signal: AbortSignal) => {
      upstream = signal;
      return load.promise;
    });
    const a = queue.run('inventory', task, controller.signal, true);
    await flush();
    const cancelledA = expect(a).rejects.toMatchObject({ name: 'AbortError' });
    controller.abort();
    await cancelledA;
    const nextText = queue.run('inventory', task);
    expect(upstream.aborted).toBe(false);
    load.resolve(1);
    expect(await nextText).toBe(1);
    expect(task).toHaveBeenCalledTimes(1);
  });
});
