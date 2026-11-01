import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthStore } from './auth-store';

/** Routes du jeu : une session (compte ou invité) est requise. */
export const authGuard: CanActivateFn = (_route, state) => {
  if (inject(AuthStore).isAuthenticated()) {
    return true;
  }
  return inject(Router).createUrlTree(['/connexion'], { queryParams: { retour: state.url } });
};

/** Administration : rôle ADMIN requis (le backend le vérifie aussi, cette garde ne fait qu'orienter). */
export const adminGuard: CanActivateFn = () => inject(AuthStore).isAdmin() || inject(Router).createUrlTree(['/']);

/** Pages de connexion : inutiles pour un joueur déjà connecté (sauf un invité qui crée son compte). */
export const visitorGuard: CanActivateFn = () => {
  const auth = inject(AuthStore);
  return !auth.isAuthenticated() || auth.isGuest() || inject(Router).createUrlTree(['/']);
};
