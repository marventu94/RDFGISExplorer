import { Injectable, signal } from '@angular/core';
import { tap, type MonoTypeOperatorFunction } from 'rxjs';

/**
 * Mensaje del backend cuando no llegó al endpoint SPARQL (sin VPN, host
 * caído): Node lo reporta como `connect ECONNECTTIMEOUT host:port`,
 * `connect ECONNREFUSED ...` o `getaddrinfo ENOTFOUND ...`. Devuelve ese
 * mensaje, o `null` si el error es de otro tipo.
 */
export function connectionFailure(error: unknown): string | null {
  const message = (error as { error?: { message?: unknown } } | null)?.error?.message;
  return typeof message === 'string' && /^(connect|getaddrinfo) E[A-Z_]+/.test(message)
    ? message
    : null;
}

/**
 * Punto único donde las consultas avisan que no se llega al servidor: una
 * acción del explorer dispara varias en paralelo (resultados, labels,
 * búsqueda) y el popup tiene que ser uno solo.
 */
@Injectable({ providedIn: 'root' })
export class EndpointStatusService {
  readonly failure = signal<{ detail: string; at: number } | null>(null);

  report(error: unknown): void {
    const detail = connectionFailure(error);
    if (detail) this.failure.set({ detail, at: Date.now() });
  }

  /** Operador para observables HTTP: reporta y deja pasar el error. */
  watch<T>(): MonoTypeOperatorFunction<T> {
    return tap({ error: (error: unknown) => this.report(error) });
  }
}
