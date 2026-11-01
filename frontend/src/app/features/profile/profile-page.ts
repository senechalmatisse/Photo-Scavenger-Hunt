import { DatePipe, DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { AuthApi, GameApi, PlayerApi } from '../../core/api/api-clients';
import { Page, ProgressView, SessionSummary } from '../../core/api/models';
import { AuthStore } from '../../core/auth/auth-store';
import { errorMessage } from '../../core/http/interceptors';
import { NotificationStore } from '../../core/notifications/notification-store';
import { ACHIEVEMENT_SYMBOLS, AVATAR_SYMBOLS, STATUS_LABELS } from '../../shared/format/labels';
import { LevelMeter } from '../../shared/ui/level-meter';

/** US-003 à US-005, US-046, US-053 à US-055 : profil, statistiques, badges, historique et suppression. */
@Component({
  selector: 'psh-profile-page',
  imports: [ReactiveFormsModule, RouterLink, DatePipe, DecimalPipe, LevelMeter],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page">
      <header class="page-header">
        <h1>{{ auth.user()?.displayName }}</h1>
        @if (auth.isGuest()) {
          <p class="notice">Vous jouez en invité. <a routerLink="/inscription">Créez un compte</a> pour retrouver votre progression sur tous vos appareils.</p>
        } @else {
          <p class="muted">{{ auth.user()?.email }}, inscrit le {{ auth.user()?.createdAt | date: 'd MMMM y' }}</p>
        }
      </header>

      @if (progress(); as p) {
        <section class="section" aria-labelledby="stats-title">
          <h2 id="stats-title">Progression</h2>
          <psh-level-meter [progress]="p.level" />
          <dl class="facts">
            <div><dt>Points</dt><dd>{{ p.points | number }}</dd></div>
            <div><dt>Missions réussies</dt><dd>{{ p.stats.missionsWon }} sur {{ p.stats.missionsPlayed }}</dd></div>
            <div><dt>Sans indice</dt><dd>{{ p.stats.missionsWonWithoutHint }}</dd></div>
            <div><dt>Défis du jour</dt><dd>{{ p.stats.dailyCompleted }}</dd></div>
            <div><dt>Série actuelle</dt><dd>{{ p.currentStreak }} jour{{ p.currentStreak > 1 ? 's' : '' }}</dd></div>
            <div><dt>Meilleure série</dt><dd>{{ p.bestStreak }} jour{{ p.bestStreak > 1 ? 's' : '' }}</dd></div>
          </dl>
        </section>

        <section class="section" aria-labelledby="badges-title">
          <h2 id="badges-title">Badges</h2>
          <ul class="badges">
            @for (badge of p.achievements; track badge.code) {
              <li [class.locked]="!badge.unlockedAt">
                <span class="symbol" aria-hidden="true">{{ achievementSymbols[badge.icon] }}</span>
                <span>
                  <strong>{{ badge.name }}</strong>
                  <span class="muted">{{ badge.description }}</span>
                  <span class="state">{{ badge.unlockedAt ? 'Obtenu le ' + (badge.unlockedAt | date: 'd MMMM y') : 'À débloquer' }}</span>
                </span>
              </li>
            }
          </ul>
        </section>
      }

      <section class="section" aria-labelledby="history-title">
        <h2 id="history-title">Historique des parties</h2>
        @if (history(); as page) {
          @if (page.items.length === 0) {
            <p class="muted">Aucune partie jouée pour l'instant.</p>
          } @else {
            <table class="table">
              <thead>
                <tr>
                  <th scope="col">Défi</th>
                  <th scope="col">Résultat</th>
                  <th scope="col">Date</th>
                  <th scope="col" class="numeric">Points</th>
                </tr>
              </thead>
              <tbody>
                @for (session of page.items; track session.id) {
                  <tr>
                    <td><a [routerLink]="['/partie', session.id]">{{ session.title }}</a></td>
                    <td>{{ statusLabels[session.status] }}</td>
                    <td>{{ session.startedAt | date: 'd MMM y, HH:mm' }}</td>
                    <td class="numeric">{{ session.points | number }}</td>
                  </tr>
                }
              </tbody>
            </table>
            <div class="row">
              <button type="button" class="button quiet" (click)="loadHistory(page.page - 1)" [disabled]="page.page <= 1">Plus récentes</button>
              <button type="button" class="button quiet" (click)="loadHistory(page.page + 1)" [disabled]="page.page * page.pageSize >= page.total">Plus anciennes</button>
            </div>
          }
        }
      </section>

      <section class="section" aria-labelledby="identity-title">
        <h2 id="identity-title">Identité</h2>
        <form class="stack identity" [formGroup]="form" (ngSubmit)="save()">
          <label class="field">
            <span>Pseudonyme</span>
            <input class="input" formControlName="displayName" minlength="3" maxlength="30" required />
          </label>
          <fieldset class="field avatars">
            <legend>Avatar</legend>
            @for (avatar of avatarCodes; track avatar) {
              <label class="avatar">
                <input type="radio" formControlName="avatar" [value]="avatar" />
                <span aria-hidden="true">{{ avatarSymbols[avatar] }}</span>
                <span class="visually-hidden">{{ avatar }}</span>
              </label>
            }
          </fieldset>
          <button type="submit" class="button" [disabled]="form.invalid || form.pristine">Enregistrer le profil</button>
        </form>
      </section>

      <section class="section danger-zone" aria-labelledby="delete-title">
        <h2 id="delete-title">Supprimer le compte</h2>
        <p>La suppression efface définitivement votre compte, vos parties, votre progression et vos points de classement.</p>
        <div class="row">
          <button type="button" class="button danger" (click)="remove()">
            {{ confirmDelete() ? 'Confirmer la suppression définitive' : 'Supprimer mon compte' }}
          </button>
          @if (confirmDelete()) {
            <button type="button" class="button quiet" (click)="confirmDelete.set(false)">Annuler</button>
          }
        </div>
      </section>

      @if (error()) {
        <p class="notice error" role="alert">{{ error() }}</p>
      }
    </div>
  `,
  styles: `
    .badges {
      list-style: none;
      margin: 0;
      padding: 0;
      display: grid;
      gap: var(--space-4);
      grid-template-columns: repeat(auto-fill, minmax(16rem, 1fr));
    }

    .badges li {
      display: flex;
      gap: var(--space-3);
    }

    .badges li > span:last-child {
      display: grid;
    }

    .locked {
      opacity: 0.55;
    }

    .symbol {
      font-size: var(--step-3);
    }

    .state {
      font-size: var(--step--1);
    }

    .identity {
      max-width: 30rem;
    }

    .avatars {
      border: 0;
      padding: 0;
      margin: 0;
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-2);
    }

    .avatars legend {
      margin-bottom: var(--space-2);
    }

    .avatar {
      position: relative;
      display: grid;
      place-items: center;
      width: 3rem;
      height: 3rem;
      font-size: 1.6rem;
      border: 2px solid var(--rule);
      border-radius: var(--radius-control);
      cursor: pointer;
    }

    .avatar input {
      position: absolute;
      opacity: 0;
    }

    .avatar:has(input:checked) {
      border-color: var(--grease);
    }

    .avatar:has(input:focus-visible) {
      box-shadow: var(--focus);
    }

    .danger-zone {
      padding-top: var(--space-5);
      border-top: 1px solid var(--rule);
    }
  `,
})
export class ProfilePage {
  protected readonly auth = inject(AuthStore);
  private readonly authApi = inject(AuthApi);
  private readonly player = inject(PlayerApi);
  private readonly game = inject(GameApi);
  private readonly notifications = inject(NotificationStore);

  protected readonly statusLabels = STATUS_LABELS;
  protected readonly achievementSymbols = ACHIEVEMENT_SYMBOLS;
  protected readonly avatarSymbols = AVATAR_SYMBOLS;
  protected readonly avatarCodes = Object.keys(AVATAR_SYMBOLS);
  protected readonly progress = signal<ProgressView | null>(null);
  protected readonly history = signal<Page<SessionSummary> | null>(null);
  protected readonly error = signal<string | null>(null);
  protected readonly confirmDelete = signal(false);
  protected readonly form = inject(NonNullableFormBuilder).group({
    displayName: [this.auth.user()?.displayName ?? '', [Validators.required, Validators.minLength(3), Validators.maxLength(30)]],
    avatar: [this.auth.user()?.avatar ?? 'compass'],
  });

  constructor() {
    void this.load();
  }

  protected async loadHistory(page: number): Promise<void> {
    try {
      this.history.set(await firstValueFrom(this.game.history(Math.max(1, page))));
    } catch (error) {
      this.error.set(errorMessage(error));
    }
  }

  protected async save(): Promise<void> {
    try {
      const profile = await firstValueFrom(this.authApi.updateMe(this.form.getRawValue()));
      this.auth.updateUser(profile);
      this.form.markAsPristine();
      this.notifications.show('Profil enregistré.', 'success');
    } catch (error) {
      this.error.set(errorMessage(error));
    }
  }

  protected async remove(): Promise<void> {
    if (!this.confirmDelete()) {
      this.confirmDelete.set(true);
      return;
    }
    try {
      await firstValueFrom(this.authApi.deleteMe());
      this.notifications.show('Compte supprimé, ainsi que toutes vos données.', 'success');
      this.auth.logout();
    } catch (error) {
      this.error.set(errorMessage(error));
    }
  }

  private async load(): Promise<void> {
    try {
      this.progress.set(await firstValueFrom(this.player.progress()));
      await this.loadHistory(1);
    } catch (error) {
      this.error.set(errorMessage(error));
    }
  }
}
