import type { Response } from 'express';

/** Express response close also fires on success; only premature closes cancel work. */
export async function withRequestCancellation<T>(
  response: Response,
  task: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  const controller = new AbortController();
  const close = () => {
    if (!response.writableEnded) controller.abort();
  };
  response.once('close', close);
  if (response.destroyed) controller.abort();
  try {
    return await task(controller.signal);
  } finally {
    response.removeListener('close', close);
  }
}
