import { Injectable, computed, inject } from '@angular/core';
import { AppConfigService } from './app-config.service';

const DEFAULT_COLOR = '#607D8B';

@Injectable({ providedIn: 'root' })
export class EntityColorService {
  private readonly appConfig = inject(AppConfigService);

  readonly effective = computed<Record<string, string>>(() => {
    return this.appConfig.config()?.classColors ?? {};
  });

  colorForType(type: string | undefined): string {
    if (!type) return DEFAULT_COLOR;
    return this.effective()[type] ?? DEFAULT_COLOR;
  }
}
