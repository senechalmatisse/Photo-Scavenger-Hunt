import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ChallengesApi, GameApi, PhotosApi } from '../../core/api/api-clients';
import { AttemptView, Photo, PhotoQuery, PublicChallenge, SessionView } from '../../core/api/models';
import { errorMessage } from '../../core/http/interceptors';
import { NotificationStore } from '../../core/notifications/notification-store';

type Busy = 'search' | 'submit' | 'hint' | 'control' | null;

/**
 * Façade de l'écran de jeu (pattern Facade + état par signaux) : les composants affichent
 * et délèguent, toute la logique d'orchestration avec l'API est ici, testable isolément.
 * Fournie au niveau du composant de page : un état par partie ouverte.
 */
@Injectable()
export class GameStore {
  private readonly game = inject(GameApi);
  private readonly photos = inject(PhotosApi);
  private readonly challenges = inject(ChallengesApi);
  private readonly notifications = inject(NotificationStore);
  private expiryRequested = false;

  readonly session = signal<SessionView | null>(null);
  readonly challenge = signal<PublicChallenge | null>(null);
  readonly results = signal<readonly Photo[]>([]);
  readonly resultsMeta = signal<{ page: number; pages: number; total: number } | null>(null);
  readonly selected = signal<Photo | null>(null);
  readonly lastAttempt = signal<AttemptView | null>(null);
  readonly busy = signal<Busy>(null);
  readonly error = signal<string | null>(null);
  readonly searchError = signal<string | null>(null);
  readonly now = signal(Date.now());

  private readonly lastQuery = signal<PhotoQuery | null>(null);

  readonly inProgress = computed(() => this.session()?.status === 'IN_PROGRESS');
  readonly triedIds = computed(() => this.session()?.attempts.map((attempt) => attempt.photoId) ?? []);
  readonly remainingMs = computed(() => {
    const deadline = this.session()?.deadline;
    return deadline ? new Date(deadline).getTime() - this.now() : null;
  });
  readonly canSubmit = computed(() => {
    const photo = this.selected();
    return photo !== null && this.inProgress() && !this.triedIds().includes(photo.id) && this.busy() === null;
  });
  readonly hasMore = computed(() => {
    const meta = this.resultsMeta();
    return meta !== null && meta.page < meta.pages;
  });

  constructor() {
    const timer = setInterval(() => this.tick(), 1000);
    inject(DestroyRef).onDestroy(() => clearInterval(timer));
  }

  async load(sessionId: string): Promise<void> {
    this.error.set(null);
    try {
      const session = await firstValueFrom(this.game.get(sessionId));
      this.session.set(session);
      this.lastAttempt.set(session.attempts.at(-1) ?? null);
      this.challenge.set(await firstValueFrom(this.challenges.details(session.challengeId)));
    } catch (error) {
      this.error.set(errorMessage(error));
    }
  }

  async search(query: PhotoQuery): Promise<void> {
    this.lastQuery.set(query);
    await this.fetchPhotos({ ...query, page: 1 }, false);
  }

  async loadMore(): Promise<void> {
    const query = this.lastQuery();
    const meta = this.resultsMeta();
    if (query && meta) {
      await this.fetchPhotos({ ...query, page: meta.page + 1 }, true);
    }
  }

  select(photo: Photo): void {
    this.selected.set(photo);
  }

  async revealHint(): Promise<void> {
    await this.command('hint', async (id) => {
      const { hint, session } = await firstValueFrom(this.game.hint(id));
      this.session.set(session);
      if (!hint && session.status === 'EXPIRED') {
        this.notifications.show('Temps écoulé : la partie est terminée.', 'info');
      }
    });
  }

  async submit(): Promise<void> {
    const photo = this.selected();
    if (!photo || !this.canSubmit()) {
      return;
    }
    await this.command('submit', async (id) => {
      const { attempt, session } = await firstValueFrom(this.game.attempt(id, photo.id));
      this.session.set(session);
      this.lastAttempt.set(attempt);
      if (attempt && !attempt.accepted && session.status === 'IN_PROGRESS') {
        this.selected.set(null);
      }
    });
  }

  async pause(): Promise<void> {
    await this.command('control', async (id) => this.session.set(await firstValueFrom(this.game.pause(id))));
  }

  async resume(): Promise<void> {
    await this.command('control', async (id) => this.session.set(await firstValueFrom(this.game.resume(id))));
  }

  async abandon(): Promise<void> {
    await this.command('control', async (id) => this.session.set(await firstValueFrom(this.game.abandon(id))));
  }

  private async fetchPhotos(query: PhotoQuery, append: boolean): Promise<void> {
    this.busy.set('search');
    this.searchError.set(null);
    try {
      const page = await firstValueFrom(this.photos.search(query));
      this.results.set(append ? [...this.results(), ...page.items] : page.items);
      this.resultsMeta.set({ page: page.page, pages: page.pages, total: page.total });
    } catch (error) {
      this.searchError.set(errorMessage(error));
    } finally {
      this.busy.set(null);
    }
  }

  private async command(kind: Exclude<Busy, null>, action: (sessionId: string) => Promise<void>): Promise<void> {
    const session = this.session();
    if (!session || this.busy() !== null) {
      return;
    }
    this.busy.set(kind);
    this.error.set(null);
    try {
      await action(session.id);
    } catch (error) {
      this.error.set(errorMessage(error));
    } finally {
      this.busy.set(null);
    }
  }

  /** Le serveur fait foi : à l'échéance, on recharge la partie (qu'il clôt alors). */
  private tick(): void {
    this.now.set(Date.now());
    const remaining = this.remainingMs();
    const session = this.session();
    if (session && remaining !== null && remaining <= 0 && this.inProgress() && !this.expiryRequested) {
      this.expiryRequested = true;
      void this.load(session.id);
    }
  }
}
