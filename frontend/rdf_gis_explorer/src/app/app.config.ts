import { ApplicationConfig, provideBrowserGlobalErrorListeners, APP_INITIALIZER } from '@angular/core';
import { provideAnimations } from '@angular/platform-browser/animations';
import { provideHttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { AppConfigService } from '@core/services/app-config.service';

function initializeAppConfig(): (appConfig: AppConfigService) => () => Promise<void> {
  return (appConfig: AppConfigService) =>
    () =>
      firstValueFrom(appConfig.load()).then(() => {
        // config loaded and cached
      });
}

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideAnimations(),
    provideHttpClient(),
    {
      provide: APP_INITIALIZER,
      useFactory: initializeAppConfig(),
      deps: [AppConfigService],
      multi: true,
    },
  ],
};
