import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';

export type Theme = 'light' | 'dark';

export const THEME_STORAGE_KEY = 'platform.theme';
export const THEME_EVENT = 'platform:theme-changed';

const VALID_THEMES: ReadonlySet<Theme> = new Set(['light', 'dark']);

function isValidTheme(value: string | null): value is Theme {
  return value !== null && (VALID_THEMES as Set<string>).has(value);
}

function readStoredTheme(): Theme {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    return isValidTheme(stored) ? stored : 'light';
  } catch {
    return 'light';
  }
}

function writeStoredTheme(theme: Theme): void {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    /* localStorage may be disabled; the document attribute still applies */
  }
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

    // Local side effects only — apply CSS attribute and persist to localStorage.
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
      .subscribe({ error: () => {/* best-effort; localStorage is the source of truth at boot */} });
  }
}
