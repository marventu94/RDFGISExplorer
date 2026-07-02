import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  provideHttpClientTesting,
  HttpTestingController,
} from '@angular/common/http/testing';
import { ThemeService, THEME_STORAGE_KEY } from './theme.service';

function clearDom(): void {
  document.documentElement.removeAttribute('data-theme');
}

function makeService(): { service: ThemeService; httpMock: HttpTestingController } {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [provideHttpClient(), provideHttpClientTesting(), ThemeService],
  });
  return {
    service: TestBed.inject(ThemeService),
    httpMock: TestBed.inject(HttpTestingController),
  };
}

describe('ThemeService', () => {
  beforeEach(() => {
    localStorage.clear();
    clearDom();
  });

  afterEach(() => {
    localStorage.clear();
    clearDom();
    vi.restoreAllMocks();
  });

  it('falls back to light when localStorage is empty', () => {
    const { service } = makeService();
    expect(service.theme()).toBe('light');
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
  });

  it('reads theme from localStorage on construction', () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'dark');
    const { service } = makeService();
    expect(service.theme()).toBe('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });

  it('survives a corrupted localStorage value', () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'rainbow');
    const { service } = makeService();
    expect(service.theme()).toBe('light');
  });

  it('toggle() switches theme and updates localStorage + document attribute', () => {
    const { service } = makeService();
    expect(service.theme()).toBe('light');
    service.toggle();
    TestBed.flushEffects();
    expect(service.theme()).toBe('dark');
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');

    service.toggle();
    TestBed.flushEffects();
    expect(service.theme()).toBe('light');
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('light');
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
  });

  it('setTheme() ignores invalid values', () => {
    const { service } = makeService();
    service.setTheme('auto' as never);
    expect(service.theme()).toBe('light');
  });

  it('syncFromBackend() adopts the backend theme if it differs from local', () => {
    const { service } = makeService();
    service.syncFromBackend('dark');
    TestBed.flushEffects();
    expect(service.theme()).toBe('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });

  it('syncFromBackend() ignores undefined (settings load failed)', () => {
    const { service } = makeService();
    service.setTheme('dark');
    service.syncFromBackend(undefined);
    expect(service.theme()).toBe('dark');
  });

  it('persists to /api/settings on change after backend sync', () => {
    const { service, httpMock } = makeService();
    service.syncFromBackend('light');
    TestBed.flushEffects();
    service.setTheme('dark');
    TestBed.flushEffects();
    const req = httpMock.expectOne('/api/settings');
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual({ theme: 'dark' });
    req.flush({ theme: 'dark' });
  });

  it('isDark computed reflects the current theme', () => {
    const { service } = makeService();
    expect(service.isDark()).toBe(false);
    service.setTheme('dark');
    expect(service.isDark()).toBe(true);
  });

  it('nextLabel returns human-friendly action label', () => {
    const { service } = makeService();
    expect(service.nextLabel()).toBe('Modo oscuro');
    service.setTheme('dark');
    expect(service.nextLabel()).toBe('Modo claro');
  });
});
