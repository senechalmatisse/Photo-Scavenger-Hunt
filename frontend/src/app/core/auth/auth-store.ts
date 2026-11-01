import { Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { AuthApi } from '../api/api-clients';
import { AuthResult, Profile } from '../api/models';

export interface StoredSession {
  readonly token: string;
  readonly expiresAt: number;
  readonly user: Profile;
}

const STORAGE_KEY = 'psh.session';

/**
 * Persistance de la session navigateur. Tout accès est protégé : le stockage peut être
 * indisponible (navigation privée, cookies bloqués) sans casser l'application.
 */
@Injectable({ providedIn: 'root' })
export class SessionStorage {
  read(): StoredSession | null {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        return null;
      }
      const session = JSON.parse(raw) as StoredSession;
      if (session.expiresAt <= Date.now()) {
        localStorage.removeItem(STORAGE_KEY);
        return null;
      }
      return session;
    } catch {
      return null;
    }
  }

  write(session: StoredSession): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
    } catch {
      // Stockage indisponible : la session reste valable pour l'onglet courant.
    }
  }

  clear(): void {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // rien à effacer
    }
  }
}

/** État d'authentification (signaux) : source unique pour l'interface et les gardes. */
@Injectable({ providedIn: 'root' })
export class AuthStore {
  private readonly api = inject(AuthApi);
  private readonly storage = inject(SessionStorage);
  private readonly router = inject(Router);
  private readonly session = signal<StoredSession | null>(this.storage.read());

  readonly user = computed(() => this.session()?.user ?? null);
  readonly token = computed(() => this.session()?.token ?? null);
  readonly isAuthenticated = computed(() => this.session() !== null);
  readonly isAdmin = computed(() => this.user()?.role === 'ADMIN');
  readonly isGuest = computed(() => this.user()?.isGuest ?? false);

  async login(email: string, password: string): Promise<void> {
    this.open(await firstValueFrom(this.api.login({ email, password })));
  }

  /** Un invité connecté est converti en compte : le jeton courant accompagne la requête. */
  async register(input: { email: string; password: string; displayName: string }): Promise<void> {
    this.open(await firstValueFrom(this.api.register(input)));
  }

  async playAsGuest(): Promise<void> {
    this.open(await firstValueFrom(this.api.guest()));
  }

  updateUser(user: Profile): void {
    const current = this.session();
    if (current) {
      this.save({ ...current, user });
    }
  }

  logout(redirect = true): void {
    this.storage.clear();
    this.session.set(null);
    if (redirect) {
      void this.router.navigate(['/connexion']);
    }
  }

  private open(result: AuthResult): void {
    this.save({ token: result.accessToken, expiresAt: Date.now() + result.expiresIn * 1000, user: result.user });
  }

  private save(session: StoredSession): void {
    this.storage.write(session);
    this.session.set(session);
  }
}
