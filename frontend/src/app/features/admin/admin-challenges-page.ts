import { DecimalPipe, PercentPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { AdminApi } from '../../core/api/api-clients';
import { AdminChallenge, ChallengeStats, ChallengeStatus, Page } from '../../core/api/models';
import { errorMessage } from '../../core/http/interceptors';
import { NotificationStore } from '../../core/notifications/notification-store';
import { DifficultyMark } from '../../shared/ui/difficulty-mark';

const STATUS_FILTERS: readonly { readonly value: ChallengeStatus | null; readonly label: string }[] = [
  { value: null, label: 'Tous' },
  { value: 'DRAFT', label: 'Brouillons' },
  { value: 'PUBLISHED', label: 'Publiés' },
  { value: 'DISABLED', label: 'Désactivés' },
];

const STATUS_NAMES: Readonly<Record<ChallengeStatus, string>> = { DRAFT: 'Brouillon', PUBLISHED: 'Publié', DISABLED: 'Désactivé' };

function tomorrow(): string {
  const date = new Date(Date.now() + 86_400_000);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

/** §3.9 : gestion des défis, publication, programmation du défi du jour et statistiques (US-080 à US-085). */
@Component({
  selector: 'psh-admin-challenges-page',
  imports: [RouterLink, FormsModule, DecimalPipe, PercentPipe, DifficultyMark],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page">
      <header class="page-header">
        <div class="row">
          <h1>Administration des défis</h1>
          <a class="button" routerLink="/admin/defis/nouveau">Créer un défi</a>
        </div>
        <p class="lede">Un défi se publie seulement si sa photo de référence satisfait ses propres critères.</p>
      </header>

      <div class="segmented" role="group" aria-label="Filtrer par statut">
        @for (filter of filters; track filter.label) {
          <button type="button" [attr.aria-pressed]="status() === filter.value" (click)="setStatus(filter.value)">{{ filter.label }}</button>
        }
      </div>

      @if (error()) {
        <p class="notice error" role="alert">{{ error() }}</p>
      }

      @if (page(); as result) {
        <table class="table">
          <thead>
            <tr>
              <th scope="col">Défi</th>
              <th scope="col">Statut</th>
              <th scope="col">Difficulté</th>
              <th scope="col">Critères</th>
              <th scope="col"><span class="visually-hidden">Actions</span></th>
            </tr>
          </thead>
          <tbody>
            @for (challenge of result.items; track challenge.id) {
              <tr>
                <td><a [routerLink]="['/admin/defis', challenge.id]">{{ challenge.title }}</a></td>
                <td>
                  {{ statusNames[challenge.status] }}
                  @if (challenge.disabledReason) {
                    <span class="hint-text">{{ challenge.disabledReason }}</span>
                  }
                </td>
                <td><psh-difficulty [level]="challenge.difficulty" /></td>
                <td class="summary">{{ challenge.validationSummary }}</td>
                <td class="actions">
                  @if (challenge.status !== 'PUBLISHED') {
                    <button type="button" class="button secondary" (click)="publish(challenge)">Publier</button>
                  } @else {
                    <button type="button" class="button quiet" (click)="disabling.set(challenge.id)">Désactiver</button>
                  }
                  <button type="button" class="button quiet" (click)="toggleStats(challenge.id)">Statistiques</button>
                </td>
              </tr>
              @if (disabling() === challenge.id) {
                <tr>
                  <td colspan="5">
                    <form class="row" (ngSubmit)="disable(challenge)">
                      <label class="field grow">
                        <span>Motif de la désactivation</span>
                        <input class="input" name="reason" [(ngModel)]="reason" minlength="3" maxlength="500" required />
                      </label>
                      <button type="submit" class="button danger" [disabled]="reason.trim().length < 3">Désactiver le défi</button>
                      <button type="button" class="button quiet" (click)="disabling.set(null)">Annuler</button>
                    </form>
                  </td>
                </tr>
              }
              @if (statsFor() === challenge.id) {
                @if (stats(); as s) {
                  <tr>
                    <td colspan="5">
                      <dl class="facts">
                        <div><dt>Parties</dt><dd>{{ s.plays | number }}</dd></div>
                        <div><dt>Joueurs</dt><dd>{{ s.uniquePlayers | number }}</dd></div>
                        <div><dt>Taux de réussite</dt><dd>{{ s.successRate === null ? 'aucune partie finie' : (s.successRate | percent) }}</dd></div>
                        <div><dt>Indices par partie</dt><dd>{{ s.averageHints | number: '1.0-1' }}</dd></div>
                        <div><dt>Tentatives par partie</dt><dd>{{ s.averageAttempts | number: '1.0-1' }}</dd></div>
                        <div><dt>Abandons</dt><dd>{{ s.abandoned | number }}</dd></div>
                      </dl>
                    </td>
                  </tr>
                }
              }
            } @empty {
              <tr><td colspan="5" class="muted">Aucun défi pour ce filtre.</td></tr>
            }
          </tbody>
        </table>
      }

      <div class="split">
        <section class="section" aria-labelledby="schedule-title">
          <h2 id="schedule-title">Programmer le défi du jour</h2>
          <form class="stack" (ngSubmit)="schedule()">
            <label class="field">
              <span>Jour</span>
              <input class="input" type="date" name="day" [(ngModel)]="scheduleDay" required />
            </label>
            <label class="field">
              <span>Défi publié</span>
              <select class="select" name="challenge" [(ngModel)]="scheduleChallengeId" required>
                <option value="" disabled>Choisir un défi</option>
                @for (challenge of published(); track challenge.id) {
                  <option [value]="challenge.id">{{ challenge.title }}</option>
                }
              </select>
            </label>
            <button type="submit" class="button" [disabled]="!scheduleChallengeId || !scheduleDay">Programmer</button>
          </form>
        </section>

        <section class="section" aria-labelledby="verify-title">
          <h2 id="verify-title">Disponibilité des photos</h2>
          <p class="muted">
            Chaque jour, les photos de référence sont vérifiées chez Flickr : un défi dont la photo a été supprimée ou rendue privée est désactivé.
          </p>
          <button type="button" class="button secondary" (click)="verify()">Vérifier maintenant</button>
        </section>
      </div>
    </div>
  `,
  styles: `
    .page-header .row {
      justify-content: space-between;
    }

    .summary {
      color: var(--ink-soft);
      font-size: var(--step--1);
      max-width: 22rem;
    }

    .actions {
      white-space: nowrap;
      text-align: right;
    }

    .grow {
      flex: 1 1 16rem;
    }
  `,
})
export class AdminChallengesPage {
  private readonly api = inject(AdminApi);
  private readonly notifications = inject(NotificationStore);

  protected readonly filters = STATUS_FILTERS;
  protected readonly statusNames = STATUS_NAMES;
  protected readonly status = signal<ChallengeStatus | null>(null);
  protected readonly page = signal<Page<AdminChallenge> | null>(null);
  protected readonly published = computed(() => (this.page()?.items ?? []).filter((challenge) => challenge.status === 'PUBLISHED'));
  protected readonly error = signal<string | null>(null);
  protected readonly disabling = signal<string | null>(null);
  protected readonly statsFor = signal<string | null>(null);
  protected readonly stats = signal<ChallengeStats | null>(null);
  protected reason = '';
  protected scheduleDay = tomorrow();
  protected scheduleChallengeId = '';

  constructor() {
    void this.load();
  }

  protected setStatus(status: ChallengeStatus | null): void {
    this.status.set(status);
    void this.load();
  }

  protected async publish(challenge: AdminChallenge): Promise<void> {
    await this.act(async () => {
      await firstValueFrom(this.api.publish(challenge.id));
      this.notifications.show(`« ${challenge.title} » est publié.`, 'success');
    });
  }

  protected async disable(challenge: AdminChallenge): Promise<void> {
    await this.act(async () => {
      await firstValueFrom(this.api.disable(challenge.id, this.reason.trim()));
      this.disabling.set(null);
      this.reason = '';
      this.notifications.show(`« ${challenge.title} » est désactivé.`, 'success');
    });
  }

  protected async toggleStats(id: string): Promise<void> {
    if (this.statsFor() === id) {
      this.statsFor.set(null);
      return;
    }
    this.statsFor.set(id);
    this.stats.set(null);
    try {
      this.stats.set(await firstValueFrom(this.api.stats(id)));
    } catch (error) {
      this.error.set(errorMessage(error));
    }
  }

  protected async schedule(): Promise<void> {
    await this.act(async () => {
      await firstValueFrom(this.api.schedule(this.scheduleDay, this.scheduleChallengeId));
      this.notifications.show(`Défi du ${this.scheduleDay} programmé.`, 'success');
    });
  }

  protected async verify(): Promise<void> {
    await this.act(async () => {
      const report = await firstValueFrom(this.api.verifyPhotos());
      this.notifications.show(
        report.interrupted
          ? 'Vérification interrompue : Flickr ne répond pas. Aucun défi n’a été désactivé.'
          : `${report.checked} photo(s) vérifiée(s), ${report.disabled.length} défi(s) désactivé(s).`,
        report.interrupted ? 'error' : 'success',
      );
    });
  }

  private async act(action: () => Promise<void>): Promise<void> {
    this.error.set(null);
    try {
      await action();
      await this.load();
    } catch (error) {
      this.error.set(errorMessage(error));
    }
  }

  private async load(): Promise<void> {
    try {
      this.page.set(await firstValueFrom(this.api.list(this.status(), 1)));
    } catch (error) {
      this.error.set(errorMessage(error));
    }
  }
}
