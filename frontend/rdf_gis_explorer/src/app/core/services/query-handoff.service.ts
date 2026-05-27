import { Injectable, signal } from '@angular/core';

const AUTO_RUN_KEY = 'platform.handoff.autoRun';

export function getAutoRunHandoff(): boolean {
  const val = localStorage.getItem(AUTO_RUN_KEY);
  return val === null ? true : val === 'true';
}

export function setAutoRunHandoff(value: boolean): void {
  localStorage.setItem(AUTO_RUN_KEY, String(value));
}

export interface HandoffPayload {
  query: string;
  backend: 'wikidata' | 'millenniumdb';
  source: { workspaceId?: string; panelId?: string };
  publishedAt: string;
}

export interface HandoffPayloadInput {
  query: string;
  backend: 'wikidata' | 'millenniumdb';
  source: { workspaceId?: string; panelId?: string };
}

const STORAGE_KEY = 'platform.handoff.pending';
const TTL_MS = 5 * 60 * 1000;
const CUSTOM_EVENT = 'query-handoff';

function isExpired(publishedAt: string): boolean {
  return Date.now() - new Date(publishedAt).getTime() > TTL_MS;
}

@Injectable({ providedIn: 'root' })
export class QueryHandoffService {
  private readonly _pending = signal<HandoffPayload | null>(null);

  readonly pending = this._pending.asReadonly();

  constructor() {
    this.syncFromStorage();

    window.addEventListener(CUSTOM_EVENT, () => this.syncFromStorage());
    window.addEventListener('storage', (e) => {
      if (e.key === STORAGE_KEY) this.syncFromStorage();
    });
  }

  publish(input: HandoffPayloadInput): void {
    const payload: HandoffPayload = {
      ...input,
      publishedAt: new Date().toISOString(),
    };

    this._pending.set(payload);
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    window.dispatchEvent(new CustomEvent(CUSTOM_EVENT, { detail: payload }));
  }

  consume(): HandoffPayload | null {
    const payload = this.peek();
    if (!payload) return null;

    this._pending.set(null);
    sessionStorage.removeItem(STORAGE_KEY);
    return payload;
  }

  peek(): HandoffPayload | null {
    this.syncFromStorage();
    const p = this._pending();
    if (p && isExpired(p.publishedAt)) {
      this._pending.set(null);
      sessionStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return this._pending();
  }

  private syncFromStorage(): void {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) {
      this._pending.set(null);
      return;
    }
    try {
      const p: HandoffPayload = JSON.parse(raw);
      if (isExpired(p.publishedAt)) {
        sessionStorage.removeItem(STORAGE_KEY);
        this._pending.set(null);
        return;
      }
      this._pending.set(p);
    } catch {
      sessionStorage.removeItem(STORAGE_KEY);
      this._pending.set(null);
    }
  }
}
