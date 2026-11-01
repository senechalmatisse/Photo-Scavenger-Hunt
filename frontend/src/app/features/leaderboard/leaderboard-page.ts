import { DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { PlayerApi } from '../../core/api/api-clients';
import { LeaderboardPeriod, LeaderboardView } from '../../core/api/models';
import { errorMessage } from '../../core/http/interceptors';
import { AVATAR_SYMBOLS } from '../../shared/format/labels';

const PERIODS: readonly { readonly value: LeaderboardPeriod; readonly label: string }[] = [
  { value: 'WEEKLY', label: 'Cette semaine' },
  { value: 'MONTHLY', label: 'Ce mois-ci' },
  { value: 'ALL_TIME', label: 'Depuis toujours' },
];

/** US-060, US-061, US-063 : classements par période et position du joueur. */
@Component({
  selector: 'psh-leaderboard-page',
  imports: [DecimalPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page">
      <header class="page-header">
        <h1>Classements</h1>
        <p class="lede">Les points ne comptent qu'à la première réussite d'un défi : rejouer sert à s'entraîner.</p>
      </header>

      <div class="segmented" role="group" aria-label="Période du classement">
        @for (option of periods; track option.value) {
          <button type="button" [attr.aria-pressed]="period() === option.value" (click)="select(option.value)">{{ option.label }}</button>
        }
      </div>

      @if (error()) {
        <p class="notice error" role="alert">{{ error() }}</p>
      }

      @if (board(); as view) {
        @if (view.entries.length === 0) {
          <p class="muted">Personne n'a encore marqué de points sur cette période. Une partie suffit pour prendre la tête.</p>
        } @else {
          <table class="table">
            <caption class="visually-hidden">Classement {{ label() }}</caption>
            <thead>
              <tr>
                <th scope="col">Rang</th>
                <th scope="col">Joueur</th>
                <th scope="col" class="numeric">Points</th>
              </tr>
            </thead>
            <tbody>
              @for (entry of view.entries; track entry.playerId) {
                <tr [class.me]="entry.isMe" [attr.aria-current]="entry.isMe ? 'true' : null">
                  <td class="rank">{{ entry.rank }}</td>
                  <td><span aria-hidden="true">{{ avatars[entry.avatar] }}</span> {{ entry.displayName }}</td>
                  <td class="numeric">{{ entry.points | number }}</td>
                </tr>
              }
            </tbody>
          </table>
          @if (view.me && !inTop(view)) {
            <p class="mine">Votre position : {{ view.me.rank }}e avec {{ view.me.points | number }} points.</p>
          }
        }
      }
    </div>
  `,
  styles: `
    .table {
      max-width: 40rem;
    }

    .rank {
      font-weight: 800;
      font-variation-settings: 'wdth' 125;
      width: 4rem;
    }

    tr.me td {
      font-weight: 700;
      background: var(--cyanotype-wash);
    }

    .mine {
      font-weight: 600;
    }
  `,
})
export class LeaderboardPage {
  private readonly api = inject(PlayerApi);
  protected readonly periods = PERIODS;
  protected readonly avatars = AVATAR_SYMBOLS;
  protected readonly period = signal<LeaderboardPeriod>('WEEKLY');
  protected readonly board = signal<LeaderboardView | null>(null);
  protected readonly error = signal<string | null>(null);

  constructor() {
    void this.load();
  }

  protected select(period: LeaderboardPeriod): void {
    this.period.set(period);
    void this.load();
  }

  protected label(): string {
    return PERIODS.find((option) => option.value === this.period())?.label.toLowerCase() ?? '';
  }

  protected inTop(view: LeaderboardView): boolean {
    return view.entries.some((entry) => entry.isMe);
  }

  private async load(): Promise<void> {
    this.error.set(null);
    try {
      this.board.set(await firstValueFrom(this.api.leaderboard(this.period(), 50)));
    } catch (error) {
      this.error.set(errorMessage(error));
    }
  }
}
