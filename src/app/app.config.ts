// src/app/app.config.ts
import {
  ApplicationConfig,
  inject,
  isDevMode,
  provideAppInitializer,
  provideBrowserGlobalErrorListeners,
} from '@angular/core';
import { provideRouter, withViewTransitions } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { routes } from './app.routes';
import { LogStore } from './sandboxes/devtools/log-store';
import { installConsoleCapture } from './sandboxes/devtools/console-capture';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes, withViewTransitions()),
    provideHttpClient(),
    provideAppInitializer(() => {
      if (isDevMode()) {
        installConsoleCapture(inject(LogStore));
      }
    }),
  ],
};
