import { Injectable, computed, inject } from '@angular/core';
import { AppConfigService } from './app-config.service';
import { SettingsService } from './settings.service';

const DEFAULT_COLOR = '#607D8B';

@Injectable({ providedIn: 'root' })
export class EntityColorService {
  private readonly appConfig = inject(AppConfigService);
  private readonly settings = inject(SettingsService);

  readonly effective = computed<Record<string, string>>(() => {
    const defaults = this.appConfig.config()?.classColors ?? {};
    const overrides = this.settings.app().classColorOverrides ?? {};
    return { ...defaults, ...overrides };
  });

  colorForType(type: string | undefined): string {
    if (!type) return DEFAULT_COLOR;
    return this.effective()[type] ?? DEFAULT_COLOR;
  }
}
