import { DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { ChallengesApi, GameApi } from '../../core/api/api-clients';
import { PublicChallenge } from '../../core/api/models';
import { errorMessage } from '../../core/http/interceptors';
import { THEME_LABELS } from '../../shared/format/labels';
import { DifficultyMark } from '../../shared/ui/difficulty-mark';
import { PhotoMap } from '../../shared/ui/photo-map';

/** US-023 / US-024 : présentation de la mission, puis démarrage. */
@Component({
  selector: 'psh-challenge-detail-page',
  imports: [RouterLink, DecimalPipe, DifficultyMark, PhotoMap],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page">
      @if (challenge(); as c) {
        <div class="split">
          <section class="section">
            <a routerLink="/defis" class="back">Tous les défis</a>
            <h1>{{ c.title }}</h1>
            <p class="riddle">{{ c.riddle }}</p>
            <dl class="facts">
              <div>
                <dt>Difficulté</dt>
                <dd><psh-difficulty [level]="c.difficulty" /></dd>
              </div>
              <div>
                <dt>Thème</dt>
                <dd>{{ themeLabels[c.theme] }}</dd>
              </div>
              @if (c.zoneLabel) {
                <div>
                  <dt>Zone</dt>
                  <dd>{{ c.zoneLabel }}</dd>
                </div>
              }
              @if (c.period) {
                <div>
                  <dt>Période</dt>
                  <dd>{{ c.period.label }}</dd>
                </div>
              }
            </dl>

            <h2>Règles</h2>
            <ul class="rules">
              <li>Une bonne réponse rapporte {{ c.reward.points | number }} points et {{ c.reward.xp | number }} XP.</li>
              <li>{{ c.maxAttempts }} tentative{{ c.maxAttempts > 1 ? 's' : '' }} au maximum.</li>
              @if (c.timeLimitSeconds) {
                <li>Temps limite : {{ minutes() }}.</li>
              }
              @if (c.hintCosts.length > 0) {
                <li>{{ c.hintCosts.length }} indice{{ c.hintCosts.length > 1 ? 's' : '' }} disponible{{ c.hintCosts.length > 1 ? 's' : '' }}, coût : {{ hintCosts() }} points.</li>
              }
              <li>{{ c.replayable ? 'Ce défi peut être rejoué, sans nouveaux points de classement.' : 'Ce défi ne peut être joué qu’une fois.' }}</li>
            </ul>

            @if (error()) {
              <p class="notice error" role="alert">{{ error() }}</p>
            }
            @if (c.playable) {
              <button type="button" class="button" (click)="start()" [disabled]="starting()">Commencer le défi</button>
            } @else {
              <p class="notice warning">Ce défi n'est pas disponible pour le moment.</p>
            }
          </section>

          @if (c.zone) {
            <section class="section" aria-label="Zone du défi">
              <psh-photo-map [area]="c.zone" />
            </section>
          }
        </div>
      } @else if (error()) {
        <p class="notice error" role="alert">{{ error() }}</p>
      }
    </div>
  `,
  styles: `
    .back {
      font-size: var(--step--1);
    }

    h1 {
      font-size: var(--step-4);
      font-weight: 900;
    }

    .riddle {
      font-size: var(--step-2);
      line-height: 1.35;
    }

    .rules {
      margin: 0;
      padding-left: 1.2em;
      display: grid;
      gap: var(--space-1);
    }

    psh-photo-map {
      height: 26rem;
    }
  `,
})
export class ChallengeDetailPage {
  /** Paramètre de route `:id`. */
  readonly id = input.required<string>();

  private readonly challenges = inject(ChallengesApi);
  private readonly game = inject(GameApi);
  private readonly router = inject(Router);
  protected readonly themeLabels = THEME_LABELS;
  protected readonly challenge = signal<PublicChallenge | null>(null);
  protected readonly error = signal<string | null>(null);
  protected readonly starting = signal(false);
  protected readonly minutes = computed(() => {
    const seconds = this.challenge()?.timeLimitSeconds ?? 0;
    return seconds % 60 === 0 ? `${seconds / 60} min` : `${Math.floor(seconds / 60)} min ${seconds % 60} s`;
  });
  protected readonly hintCosts = computed(() => (this.challenge()?.hintCosts ?? []).join(', '));

  constructor() {
    effect(() => {
      const id = this.id();
      void this.load(id);
    });
  }

  protected async start(): Promise<void> {
    const challenge = this.challenge();
    if (!challenge) {
      return;
    }
    this.starting.set(true);
    this.error.set(null);
    try {
      const started = await firstValueFrom(this.game.start(challenge.id));
      await this.router.navigate(['/partie', started.session.id]);
    } catch (error) {
      this.error.set(errorMessage(error));
    } finally {
      this.starting.set(false);
    }
  }

  private async load(id: string): Promise<void> {
    this.error.set(null);
    try {
      this.challenge.set(await firstValueFrom(this.challenges.details(id)));
    } catch (error) {
      this.error.set(errorMessage(error));
    }
  }
}
