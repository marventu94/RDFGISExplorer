import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { ThemeService } from './theme.service';
import type { Theme } from './theme.service';

export interface ShellAppSettings {
  theme: Theme;
}

const FALLBACK: ShellAppSettings = {
  theme: 'light',
};

@Injectable({ providedIn: 'root' })
export class SettingsService {
  private readonly http = inject(HttpClient);
  private readonly theme = inject(ThemeService);

  private readonly _settings = signal<ShellAppSettings>(FALLBACK);
  private readonly _loaded = signal(false);

  readonly settings = this._settings.asReadonly();
  readonly loaded = this._loaded.asReadonly();

  async load(): Promise<void> {
    try {
      const remote = await firstValueFrom(
        this.http.get<ShellAppSettings>('/api/settings'),
      );
      this._settings.set(remote);
      this.theme.syncFromBackend(remote.theme);
    } catch {
      this.theme.syncFromBackend(undefined);
    } finally {
      this._loaded.set(true);
    }
  }
}
