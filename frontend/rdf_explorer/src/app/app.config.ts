import { ApplicationConfig, provideBrowserGlobalErrorListeners, APP_INITIALIZER } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';

import { routes } from './app.routes';
import { AppConfigService } from './core/services/app-config.service';

function initializeApp(): (appConfig: AppConfigService) => () => Promise<void> {
  return (appConfig: AppConfigService) =>
    async () => {
      await firstValueFrom(appConfig.load());
    };
}

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),
    provideHttpClient(),
    {
      provide: APP_INITIALIZER,
      useFactory: initializeApp(),
      deps: [AppConfigService],
      multi: true,
    },
  ]
};
