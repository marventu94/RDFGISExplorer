import { Injectable, computed, inject } from '@angular/core';
import { AppConfigService } from './app-config.service';

const DEFAULT_COLOR = '#607D8B';

@Injectable({ providedIn: 'root' })
export class EntityColorService {
  private readonly appConfig = inject(AppConfigService);

  readonly effective = computed<Record<string, string>>(() => {
    return this.appConfig.config()?.classColors ?? {};
  });

  /** Color por URI de clase RDF (`classColors` viene keyed por URI de clase). */
  colorForClass(classUri: string | undefined): string {
    if (!classUri) return DEFAULT_COLOR;
    return this.effective()[classUri] ?? DEFAULT_COLOR;
  }
}
