import { Injectable, signal } from '@angular/core';
import {
  clearPendingHandoff,
  readPendingHandoff,
  subscribeHandoffChanges,
  writePendingHandoff,
} from '@rdfgis/platform-bridge';
import type { HandoffPayload, HandoffPayloadInput } from '@rdfgis/platform-bridge';

// El contrato (clave de storage, TTL, nombre del evento) y la logica de
// lectura/escritura viven en @rdfgis/platform-bridge, compartidos con el otro
// remote. Este servicio es solo el envoltorio en signals: cada remote necesita
// su propia instancia de Angular, pero no su propia copia del contrato.
export type { HandoffPayload, HandoffPayloadInput };
export { getAutoRunHandoff, setAutoRunHandoff } from '@rdfgis/platform-bridge';

@Injectable({ providedIn: 'root' })
export class QueryHandoffService {
  private readonly _pending = signal<HandoffPayload | null>(null);

  readonly pending = this._pending.asReadonly();

  constructor() {
    this.sync();
    subscribeHandoffChanges(() => this.sync());
  }

  publish(input: HandoffPayloadInput): void {
    this._pending.set(writePendingHandoff(input));
  }

  consume(): HandoffPayload | null {
    const payload = this.peek();
    if (!payload) return null;

    this._pending.set(null);
    clearPendingHandoff();
    return payload;
  }

  peek(): HandoffPayload | null {
    this.sync();
    return this._pending();
  }

  private sync(): void {
    this._pending.set(readPendingHandoff());
  }
}
