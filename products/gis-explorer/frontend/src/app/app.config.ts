import { ApplicationConfig, provideBrowserGlobalErrorListeners, APP_INITIALIZER } from '@angular/core';
import { provideAnimations } from '@angular/platform-browser/animations';
import { provideHttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { AppConfigService } from '@core/services/app-config.service';

// Solo corre cuando la app arranca standalone; como remote del shell la
// config se carga async (App.ngOnInit / AppConfigService.load con shareReplay).
function initializeApp(): (appConfig: AppConfigService) => () => Promise<void> {
  return (appConfig: AppConfigService) => async () => {
    await firstValueFrom(appConfig.load());
  };
}

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideAnimations(),
    provideHttpClient(),
    {
      provide: APP_INITIALIZER,
      useFactory: initializeApp(),
      deps: [AppConfigService],
      multi: true,
    },
  ],
};
