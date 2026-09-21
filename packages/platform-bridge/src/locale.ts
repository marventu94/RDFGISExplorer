export const SUPPORTED_LANGUAGES = ['es', 'en'] as const;
export type Language = (typeof SUPPORTED_LANGUAGES)[number];

export const DEFAULT_LANGUAGE: Language = 'es';
export const LANGUAGE_STORAGE_KEY = 'platform.language';
export const LANGUAGE_EVENT = 'platform-language-change';

export interface LanguageChangeDetail {
  language: Language;
}

export function isLanguage(value: unknown): value is Language {
  return value === 'es' || value === 'en';
}

export function getLanguage(): Language {
  if (typeof window === 'undefined') return DEFAULT_LANGUAGE;
  try {
    const stored = window.localStorage.getItem(LANGUAGE_STORAGE_KEY);
    return isLanguage(stored) ? stored : DEFAULT_LANGUAGE;
  } catch {
    return DEFAULT_LANGUAGE;
  }
}

export function setLanguage(language: Language): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
  } catch {
    // Runtime selection must still work when storage is unavailable.
  }
  window.dispatchEvent(
    new CustomEvent<LanguageChangeDetail>(LANGUAGE_EVENT, { detail: { language } }),
  );
}

export function onLanguageChange(listener: (language: Language) => void): () => void {
  if (typeof window === 'undefined') return () => undefined;
  const custom = (event: Event) => {
    const language = (event as CustomEvent<LanguageChangeDetail>).detail?.language;
    if (isLanguage(language)) listener(language);
  };
  const storage = (event: StorageEvent) => {
    if (event.key === LANGUAGE_STORAGE_KEY && isLanguage(event.newValue)) listener(event.newValue);
  };
  window.addEventListener(LANGUAGE_EVENT, custom);
  window.addEventListener('storage', storage);
  return () => {
    window.removeEventListener(LANGUAGE_EVENT, custom);
    window.removeEventListener('storage', storage);
  };
}

export type TranslationCatalog<Key extends string = string> = Readonly<
  Record<Key, Readonly<Record<Language, string>>>
>;

export function translate<Key extends string>(
  catalog: TranslationCatalog<Key>,
  key: Key,
  language: Language,
  params: Readonly<Record<string, string | number>> = {},
): string {
  const template = catalog[key]?.[language] ?? catalog[key]?.[DEFAULT_LANGUAGE] ?? key;
  return template.replace(/\{([\w.-]+)\}/g, (match, name: string) =>
    Object.prototype.hasOwnProperty.call(params, name) ? String(params[name]) : match,
  );
}
