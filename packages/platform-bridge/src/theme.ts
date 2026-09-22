export const THEMES = ['light', 'dark'] as const;
export type Theme = (typeof THEMES)[number];

export const DEFAULT_THEME: Theme = 'light';
export const THEME_STORAGE_KEY = 'platform.theme';
export const THEME_EVENT = 'platform-theme-change';

export interface ThemeChangeDetail {
  theme: Theme;
}

export function isTheme(value: unknown): value is Theme {
  return value === 'light' || value === 'dark';
}

export function getTheme(): Theme {
  if (typeof window === 'undefined') return DEFAULT_THEME;
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    return isTheme(stored) ? stored : DEFAULT_THEME;
  } catch {
    return DEFAULT_THEME;
  }
}

/** Applies the theme to the shared document. Safe to call before Angular starts. */
export function applyTheme(theme: Theme): void {
  if (typeof document === 'undefined') return;
  document.documentElement.dataset['theme'] = theme;
  document.documentElement.style.colorScheme = theme;
}

export function setTheme(theme: Theme): void {
  applyTheme(theme);
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Runtime selection must still work when storage is unavailable.
  }
  window.dispatchEvent(new CustomEvent<ThemeChangeDetail>(THEME_EVENT, { detail: { theme } }));
}

export function onThemeChange(listener: (theme: Theme) => void): () => void {
  if (typeof window === 'undefined') return () => undefined;
  const custom = (event: Event) => {
    const theme = (event as CustomEvent<ThemeChangeDetail>).detail?.theme;
    if (isTheme(theme)) {
      applyTheme(theme);
      listener(theme);
    }
  };
  const storage = (event: StorageEvent) => {
    if (event.key === THEME_STORAGE_KEY && isTheme(event.newValue)) {
      applyTheme(event.newValue);
      listener(event.newValue);
    }
  };
  window.addEventListener(THEME_EVENT, custom);
  window.addEventListener('storage', storage);
  return () => {
    window.removeEventListener(THEME_EVENT, custom);
    window.removeEventListener('storage', storage);
  };
}
