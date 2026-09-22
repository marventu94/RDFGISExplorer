import { TestBed } from '@angular/core/testing';
import {
  THEME_EVENT,
  THEME_STORAGE_KEY,
  applyTheme,
  getTheme,
  onThemeChange,
  setTheme,
} from '@rdfgis/platform-bridge';
import { ThemeToggleComponent } from './theme-toggle.component';

describe('global theme', () => {
  beforeEach(() => {
    localStorage.clear();
    applyTheme('light');
  });

  it('persists, applies and publishes a theme change', () => {
    const listener = vi.fn();
    const stop = onThemeChange(listener);

    setTheme('dark');

    expect(getTheme()).toBe('dark');
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark');
    expect(document.documentElement.dataset['theme']).toBe('dark');
    expect(document.documentElement.style.colorScheme).toBe('dark');
    expect(listener).toHaveBeenCalledWith('dark');
    stop();
  });

  it('syncs a valid storage event and ignores invalid values', () => {
    const listener = vi.fn();
    const stop = onThemeChange(listener);

    window.dispatchEvent(new StorageEvent('storage', { key: THEME_STORAGE_KEY, newValue: 'dark' }));
    window.dispatchEvent(new StorageEvent('storage', { key: THEME_STORAGE_KEY, newValue: 'sepia' }));

    expect(listener).toHaveBeenCalledTimes(1);
    expect(document.documentElement.dataset['theme']).toBe('dark');
    stop();
  });

  it('falls back for an invalid persisted value and removes listeners cleanly', () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'sepia');
    expect(getTheme()).toBe('light');

    const listener = vi.fn();
    const stop = onThemeChange(listener);
    stop();
    window.dispatchEvent(new CustomEvent(THEME_EVENT, { detail: { theme: 'dark' } }));

    expect(listener).not.toHaveBeenCalled();
    expect(document.documentElement.dataset['theme']).toBe('light');
  });

  it('renders an accessible toggle and switches the shared preference', async () => {
    await TestBed.configureTestingModule({ imports: [ThemeToggleComponent] }).compileComponents();
    const fixture = TestBed.createComponent(ThemeToggleComponent);
    fixture.detectChanges();
    const button = fixture.nativeElement.querySelector('button') as HTMLButtonElement;

    expect(button.getAttribute('aria-label')).toContain('oscuro');
    button.click();
    fixture.detectChanges();

    expect(getTheme()).toBe('dark');
    expect(button.getAttribute('aria-label')).toContain('claro');
    expect(new CustomEvent(THEME_EVENT)).toBeTruthy();
  });
});
