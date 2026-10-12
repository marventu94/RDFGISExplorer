import { EventEmitter } from 'node:events';
import http from 'node:http';
import https from 'node:https';
import {
  CONNECT_TIMEOUT_CODE,
  connectTimeoutAgents,
  connectTimeoutMs,
  DEFAULT_CONNECT_TIMEOUT_MS,
} from './connect-timeout';

// Sin sockets reales (el guard de CI bloquea la red): createConnection del
// agente base devuelve un socket falso que nunca termina de conectar.
function fakeSocket() {
  return Object.assign(new EventEmitter(), {
    connecting: true,
    destroy: jest.fn(),
  });
}

describe('connect timeout agents', () => {
  const previous = process.env['SPARQL_CONNECT_TIMEOUT_MS'];

  beforeEach(() => jest.useFakeTimers());
  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
    if (previous === undefined) delete process.env['SPARQL_CONNECT_TIMEOUT_MS'];
    else process.env['SPARQL_CONNECT_TIMEOUT_MS'] = previous;
  });

  it('reads SPARQL_CONNECT_TIMEOUT_MS and falls back to the default', () => {
    process.env['SPARQL_CONNECT_TIMEOUT_MS'] = '1500';
    expect(connectTimeoutMs()).toBe(1500);
    process.env['SPARQL_CONNECT_TIMEOUT_MS'] = 'abc';
    expect(connectTimeoutMs()).toBe(DEFAULT_CONNECT_TIMEOUT_MS);
  });

  it.each([
    ['http', http.Agent, 'httpAgent'],
    ['https', https.Agent, 'httpsAgent'],
  ] as const)(
    'destroys a %s socket that does not connect in time',
    (_proto, Base, key) => {
      process.env['SPARQL_CONNECT_TIMEOUT_MS'] = '1000';
      const socket = fakeSocket();
      jest
        .spyOn(Base.prototype, 'createConnection')
        .mockReturnValue(socket as never);

      connectTimeoutAgents()[key].createConnection({});
      jest.advanceTimersByTime(999);
      expect(socket.destroy).not.toHaveBeenCalled();
      jest.advanceTimersByTime(1);
      expect(socket.destroy).toHaveBeenCalledWith(
        expect.objectContaining({ code: CONNECT_TIMEOUT_CODE }),
      );
    },
  );

  it('leaves connected sockets alone, however long the query takes', () => {
    process.env['SPARQL_CONNECT_TIMEOUT_MS'] = '1000';
    const socket = fakeSocket();
    jest
      .spyOn(http.Agent.prototype, 'createConnection')
      .mockReturnValue(socket as never);

    connectTimeoutAgents().httpAgent.createConnection({});
    socket.emit('connect');
    jest.advanceTimersByTime(60_000);
    expect(socket.destroy).not.toHaveBeenCalled();
  });
});
