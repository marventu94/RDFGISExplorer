import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/** Error del backend explorer con su cuerpo, para devolvérselo legible al agente. */
export class ExplorerApiError extends Error {
  constructor(
    readonly status: number,
    readonly body: unknown,
  ) {
    super(`Explorer API ${status}: ${JSON.stringify(body)}`);
  }
}

/**
 * Cliente HTTP del backend explorer (el de GIS por defecto: las queries que arma
 * el agente terminan en tableros GIS). El Shell no ejecuta SPARQL: reusa los
 * endpoints existentes, con sus límites, timeouts y validaciones.
 */
@Injectable()
export class ExplorerApiClient {
  private readonly baseUrl: string;
  private readonly timeoutMs: number;

  constructor(config: ConfigService) {
    this.baseUrl = (
      config.get<string>('MCP_EXPLORER_API_URL') ?? 'http://localhost:3002/api'
    ).replace(/\/+$/, '');
    const timeout = parseInt(config.get<string>('MCP_EXPLORER_TIMEOUT_MS') ?? '', 10);
    this.timeoutMs = Number.isInteger(timeout) && timeout > 0 ? timeout : 120_000;
  }

  get<T>(path: string, query: Record<string, string | number | undefined> = {}): Promise<T> {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== '') params.set(key, String(value));
    }
    const suffix = params.size > 0 ? `?${params.toString()}` : '';
    return this.request<T>(`${path}${suffix}`, { method: 'GET' });
  }

  post<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  private async request<T>(path: string, init: RequestInit): Promise<T> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    const text = await response.text();
    let body: unknown = text;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      // Respuesta no JSON (p. ej. un proxy caído): se devuelve como texto.
    }
    if (!response.ok) throw new ExplorerApiError(response.status, body);
    return body as T;
  }
}
