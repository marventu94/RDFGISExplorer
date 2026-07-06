import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';

export type Theme = 'light' | 'dark';

export const THEME_STORAGE_KEY = 'platform.theme';
export const THEME_EVENT = 'platform:theme-changed';

const VALID_THEMES: ReadonlySet<Theme> = new Set(['light', 'dark']);
const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365; // 1 year

function isValidTheme(value: string | null | undefined): value is Theme {
  return value !== null && value !== undefined && (VALID_THEMES as Set<string>).has(value);
}

function readCookie(name: string): string | null {
  try {
    if (typeof document === 'undefined') return null;
    const re = new RegExp('(?:^|;\\s*)' + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '=([^;]*)');
    const m = document.cookie.match(re);
    return m ? decodeURIComponent(m[1]) : null;
  } catch {
    return null;
  }
}

function writeCookie(name: string, value: string, maxAgeSeconds: number): void {
  try {
    if (typeof document === 'undefined') return;
    document.cookie = `${name}=${encodeURIComponent(value)};path=/;max-age=${maxAgeSeconds};SameSite=Lax`;
  } catch {
    /* cookies may be disabled; the document attribute still applies */
  }
}

function systemPrefersDark(): boolean {
  try {
    return (
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-color-scheme: dark)').matches
    );
  } catch {
    return false;
  }
}

function readStoredTheme(): Theme {
  const fromCookie = readCookie(THEME_STORAGE_KEY);
  if (isValidTheme(fromCookie)) return fromCookie;
  return systemPrefersDark() ? 'dark' : 'light';
}

function writeStoredTheme(theme: Theme): void {
  writeCookie(THEME_STORAGE_KEY, theme, COOKIE_MAX_AGE_SECONDS);
}

function applyTheme(theme: Theme): void {
  if (typeof document !== 'undefined') {
    document.documentElement.setAttribute('data-theme', theme);
  }
}

@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly http = inject(HttpClient);
  private readonly _theme = signal<Theme>(readStoredTheme());
  private backendSynced = false;

  readonly theme = this._theme.asReadonly();
  readonly isDark = computed(() => this._theme() === 'dark');
  readonly nextLabel = computed(() => (this.isDark() ? 'Modo claro' : 'Modo oscuro'));

  constructor() {
    applyTheme(this._theme());

    // Local side effects only — apply CSS attribute and persist to cookie.
    // The remote PUT is handled in setTheme/toggle so we don't fire on every
    // backendSynced flip.
    effect(() => {
      const t = this._theme();
      applyTheme(t);
      writeStoredTheme(t);
    });
  }

  toggle(): void {
    this._theme.update((t) => (t === 'dark' ? 'light' : 'dark'));
    this.broadcastAndPersist();
  }

  setTheme(theme: Theme): void {
    if (!VALID_THEMES.has(theme)) return;
    if (theme === this._theme()) return;
    this._theme.set(theme);
    this.broadcastAndPersist();
  }

  syncFromBackend(theme: Theme | undefined): void {
    this.backendSynced = true;
    if (theme && VALID_THEMES.has(theme) && theme !== this._theme()) {
      this._theme.set(theme);
    }
  }

  private broadcastAndPersist(): void {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent(THEME_EVENT, { detail: this._theme() }),
      );
    }
    if (this.backendSynced) {
      this.persistToBackend(this._theme());
    }
  }

  private persistToBackend(theme: Theme): void {
    this.http
      .put('/api/settings', { theme })
      .subscribe({ error: () => {/* best-effort; the cookie is the source of truth at boot */} });
  }
}
