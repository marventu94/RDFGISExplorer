import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import type { AppSettings } from '../settings.types';

@Injectable({ providedIn: 'root' })
export class SettingsApiService {
  private readonly http = inject(HttpClient);

  get(): Observable<AppSettings> {
    return this.http.get<AppSettings>('/api/settings');
  }

  put(partial: Partial<AppSettings>): Observable<AppSettings> {
    return this.http.put<AppSettings>('/api/settings', partial);
  }
}
