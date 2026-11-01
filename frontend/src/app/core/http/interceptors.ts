import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError } from 'rxjs';
import { ApiErrorBody } from '../api/models';
import { AuthStore, SessionStorage } from '../auth/auth-store';
import { NotificationStore } from '../notifications/notification-store';

/** Erreur d'API normalisée : les écrans affichent `message` et réagissent au `code` stable. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
  }

  static from(error: HttpErrorResponse): ApiError {
    const body = error.error as Partial<ApiErrorBody> | null;
    if (error.status === 0) {
      return new ApiError(0, 'NETWORK', 'Connexion au serveur impossible. Vérifiez votre réseau puis réessayez.');
    }
    return new ApiError(error.status, body?.code ?? 'HTTP_ERROR', body?.message ?? 'Une erreur est survenue.', body?.details);
  }
}

/** Message d'erreur lisible, quelle que soit l'origine de l'erreur. */
export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Une erreur est survenue.';
}

/** Ajoute le jeton Bearer (lu dans le stockage pour éviter toute dépendance circulaire). */
export const authInterceptor: HttpInterceptorFn = (request, next) => {
  const token = inject(SessionStorage).read()?.token;
  return next(token ? request.clone({ setHeaders: { Authorization: `Bearer ${token}` } }) : request);
};

/**
 * Normalise les erreurs HTTP en ApiError ; session expirée → déconnexion ;
 * pannes serveur ou réseau → notification globale (les erreurs métier restent aux écrans).
 */
export const errorInterceptor: HttpInterceptorFn = (request, next) => {
  const auth = inject(AuthStore);
  const notifications = inject(NotificationStore);
  return next(request).pipe(
    catchError((error: unknown) => {
      if (!(error instanceof HttpErrorResponse)) {
        return throwError(() => error);
      }
      const apiError = ApiError.from(error);
      if (error.status === 401 && !request.url.includes('/auth/')) {
        auth.logout();
        notifications.show('Votre session a expiré : reconnectez-vous pour continuer.', 'info');
      } else if (error.status === 0 || error.status >= 500) {
        notifications.show(apiError.message, 'error');
      }
      return throwError(() => apiError);
    }),
  );
};
