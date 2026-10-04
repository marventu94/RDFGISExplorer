import { HttpException, HttpStatus } from '@nestjs/common';

export function cancelled(): DOMException {
  return new DOMException('Discovery request cancelled', 'AbortError');
}
interface Job {
  key: string;
  controller: AbortController;
  promise: Promise<unknown>;
  task: (signal: AbortSignal) => Promise<unknown>;
  resolve: (value: unknown) => void;
  reject: (reason: unknown) => void;
  consumers: Set<symbol>;
  keepAlive: boolean;
  started: boolean;
}

/** Bounded per-runtime queue. Identical active/queued work shares one upstream request. */
export class DiscoveryQueue {
  private readonly jobs = new Map<string, Job>();
  private readonly waiting: Job[] = [];
  private active = 0;
  constructor(
    private readonly concurrency: number,
    private readonly queueLimit: number,
  ) {}

  run<T>(
    key: string,
    task: (signal: AbortSignal) => Promise<T>,
    signal?: AbortSignal,
    keepAlive = false,
  ): Promise<T> {
    if (signal?.aborted) return Promise.reject(cancelled());
    let job = this.jobs.get(key);
    if (job?.controller.signal.aborted) job = undefined;
    if (!job) {
      if (
        this.active >= this.concurrency &&
        this.waiting.length >= this.queueLimit
      ) {
        return Promise.reject(
          new HttpException(
            {
              error: 'DISCOVERY_BUSY',
              message: 'Discovery queue is full. Retry later.',
            },
            HttpStatus.TOO_MANY_REQUESTS,
          ),
        );
      }
      let resolve!: Job['resolve'];
      let reject!: Job['reject'];
      const promise = new Promise<unknown>((yes, no) => {
        resolve = yes;
        reject = no;
      });
      job = {
        key,
        controller: new AbortController(),
        promise,
        task,
        resolve,
        reject,
        consumers: new Set(),
        keepAlive,
        started: false,
      };
      this.jobs.set(key, job);
      this.waiting.push(job);
    }
    const result = this.subscribe<T>(job, signal);
    this.drain();
    return result;
  }

  private subscribe<T>(job: Job, signal?: AbortSignal): Promise<T> {
    const consumer = Symbol();
    job.consumers.add(consumer);
    return new Promise<T>((resolve, reject) => {
      const cleanup = () => {
        job.consumers.delete(consumer);
        signal?.removeEventListener('abort', abort);
      };
      const abort = () => {
        cleanup();
        reject(cancelled());
        if (!job.consumers.size && (!job.keepAlive || !job.started)) {
          job.controller.abort();
          if (!job.started) {
            const index = this.waiting.indexOf(job);
            if (index >= 0) this.waiting.splice(index, 1);
            if (this.jobs.get(job.key) === job) this.jobs.delete(job.key);
            job.reject(cancelled());
          }
        }
      };
      signal?.addEventListener('abort', abort, { once: true });
      job.promise.then(
        (value) => {
          cleanup();
          resolve(value as T);
        },
        (error) => {
          cleanup();
          reject(
            error instanceof Error || error instanceof DOMException
              ? error
              : new Error(String(error)),
          );
        },
      );
    });
  }

  private drain(): void {
    while (this.active < this.concurrency && this.waiting.length) {
      const job = this.waiting.shift()!;
      job.started = true;
      this.active++;
      void Promise.resolve()
        .then(() => {
          if (job.controller.signal.aborted) throw cancelled();
          return job.task(job.controller.signal);
        })
        .then(job.resolve, job.reject)
        .finally(() => {
          this.active--;
          if (this.jobs.get(job.key) === job) this.jobs.delete(job.key);
          this.drain();
        });
    }
  }
}
