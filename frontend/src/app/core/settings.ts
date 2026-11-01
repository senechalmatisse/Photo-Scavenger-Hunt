import { InjectionToken } from '@angular/core';

export interface AppSettings {
  readonly production: boolean;
  readonly apiBaseUrl: string;
  readonly map: {
    readonly tileUrl: string;
    readonly attribution: string;
  };
}

/** Paramètres d'environnement injectables (substituables en test). */
export const APP_SETTINGS = new InjectionToken<AppSettings>('AppSettings');
