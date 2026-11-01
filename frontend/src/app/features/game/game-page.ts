import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { GameApi } from '../../core/api/api-clients';
import { errorMessage } from '../../core/http/interceptors';
import { formatCountdown } from '../../shared/format/labels';
import { ContactSheet } from '../../shared/ui/contact-sheet';
import { DifficultyMark } from '../../shared/ui/difficulty-mark';
import { PhotoInspector } from '../../shared/ui/photo-inspector';
import { PhotoMap } from '../../shared/ui/photo-map';
import { AttemptFeedback } from './attempt-feedback';
import { GameStore } from './game-store';
import { PhotoSearchForm } from './photo-search-form';
import { ResultPanel } from './result-panel';

type ExplorerView = 'sheet' | 'map';

/**
 * Écran de jeu (§6) : la mission à gauche (énigme, indices, chronomètre, retour sur les tentatives),
 * l'exploration à droite (recherche Flickr en planche contact ou sur la carte).
 */
@Component({
  selector: 'psh-game-page',
  imports: [RouterLink, ContactSheet, DifficultyMark, PhotoInspector, PhotoMap, PhotoSearchForm, AttemptFeedback, ResultPanel],
  providers: [GameStore],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './game-page.html',
  styleUrl: './game-page.scss',
})
export class GamePage {
  /** Paramètre de route `:id` (identifiant de la partie). */
  readonly id = input.required<string>();

  protected readonly store = inject(GameStore);
  private readonly game = inject(GameApi);
  private readonly router = inject(Router);

  protected readonly view = signal<ExplorerView>('sheet');
  protected readonly confirmAbandon = signal(false);
  protected readonly countdown = computed(() => {
    const remaining = this.store.remainingMs();
    return remaining === null ? null : formatCountdown(remaining);
  });
  protected readonly hurry = computed(() => {
    const remaining = this.store.remainingMs();
    return remaining !== null && remaining < 30_000;
  });

  constructor() {
    effect(() => {
      void this.store.load(this.id());
    });
  }

  protected async abandon(): Promise<void> {
    if (!this.confirmAbandon()) {
      this.confirmAbandon.set(true);
      return;
    }
    this.confirmAbandon.set(false);
    await this.store.abandon();
  }

  protected async replay(): Promise<void> {
    const session = this.store.session();
    if (!session) {
      return;
    }
    try {
      const started = await firstValueFrom(this.game.start(session.challengeId));
      await this.router.navigate(['/partie', started.session.id]);
    } catch (error) {
      this.store.error.set(errorMessage(error));
    }
  }
}
