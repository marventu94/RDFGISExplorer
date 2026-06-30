import { ApplicationConfig, provideBrowserGlobalErrorListeners, APP_INITIALIZER } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';

import { routes } from './app.routes';
import { AppConfigService } from './core/services/app-config.service';
import { SettingsService } from './core/settings.service';

function initializeAppConfig(): (appConfig: AppConfigService, settings: SettingsService) => () => Promise<void> {
  return (appConfig: AppConfigService, settings: SettingsService) =>
    () =>
      firstValueFrom(appConfig.load()).then((cfg) => {
        settings.initFromConfig(cfg);
      });
}

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),
    provideHttpClient(),
    {
      provide: APP_INITIALIZER,
      useFactory: initializeAppConfig(),
      deps: [AppConfigService, SettingsService],
      multi: true,
    },
  ]
};
