import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';

export interface ShellAppSettings {
  theme: 'light' | 'dark';
}

const FALLBACK: ShellAppSettings = {
  theme: 'light',
};

@Injectable({ providedIn: 'root' })
export class SettingsService {
  private readonly http = inject(HttpClient);

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
    } catch {
      /* use fallback */
    } finally {
      this._loaded.set(true);
    }
  }
}
