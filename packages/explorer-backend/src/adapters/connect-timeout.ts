import http from 'node:http';
import https from 'node:https';
import type { Duplex } from 'node:stream';

export const DEFAULT_CONNECT_TIMEOUT_MS = 5_000;

/** Código de error del socket cuando la conexión TCP no se establece a tiempo. */
export const CONNECT_TIMEOUT_CODE = 'ECONNECTTIMEOUT';

export function connectTimeoutMs(): number {
  const raw = Number(process.env['SPARQL_CONNECT_TIMEOUT_MS']);
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_CONNECT_TIMEOUT_MS;
}

/**
 * Sin VPN los SYN se descartan en silencio y el sistema operativo recién
 * abandona la conexión a los ~2 minutos, así que la consulta parecía colgada.
 * Este timer corta solo el establecimiento de la conexión; una consulta lenta
 * con el socket ya conectado sigue gobernada por SPARQL_TIMEOUT_MS.
 */
function guardConnect<T extends Duplex | null | undefined>(
  socket: T,
  timeoutMs: number,
  target: { host?: string | null; port?: number | string | null },
): T {
  const pending = socket as (Duplex & { connecting?: boolean }) | null;
  if (!pending || pending.connecting === false) return socket;
  const timer = setTimeout(() => {
    const err = Object.assign(
      new Error(
        `connect ${CONNECT_TIMEOUT_CODE} ${target.host ?? ''}:${target.port ?? ''} (${timeoutMs}ms)`,
      ),
      { code: CONNECT_TIMEOUT_CODE },
    );
    pending.destroy(err);
  }, timeoutMs);
  const clear = () => clearTimeout(timer);
  pending.once('connect', clear);
  pending.once('close', clear);
  return socket;
}

type CreateConnectionArgs = Parameters<http.Agent['createConnection']>;

class ConnectTimeoutHttpAgent extends http.Agent {
  constructor(private readonly connectTimeout: number) {
    super({ keepAlive: true });
  }

  override createConnection(...args: CreateConnectionArgs) {
    return guardConnect(
      super.createConnection(...args),
      this.connectTimeout,
      args[0],
    );
  }
}

class ConnectTimeoutHttpsAgent extends https.Agent {
  constructor(private readonly connectTimeout: number) {
    super({ keepAlive: true });
  }

  override createConnection(...args: CreateConnectionArgs) {
    return guardConnect(
      super.createConnection(...args),
      this.connectTimeout,
      args[0],
    );
  }
}

let cached: { timeoutMs: number; http: http.Agent; https: https.Agent } | null =
  null;

/** Agentes para axios (`httpAgent`/`httpsAgent`) con timeout de conexión. */
export function connectTimeoutAgents(): {
  httpAgent: http.Agent;
  httpsAgent: https.Agent;
} {
  const timeoutMs = connectTimeoutMs();
  if (cached?.timeoutMs !== timeoutMs) {
    cached = {
      timeoutMs,
      http: new ConnectTimeoutHttpAgent(timeoutMs),
      https: new ConnectTimeoutHttpsAgent(timeoutMs),
    };
  }
  return { httpAgent: cached.http, httpsAgent: cached.https };
}
