import { DatePipe, DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { GameApi, PlayerApi } from '../../core/api/api-clients';
import { DashboardView } from '../../core/api/models';
import { errorMessage } from '../../core/http/interceptors';
import { ACHIEVEMENT_SYMBOLS, STATUS_LABELS, THEME_LABELS } from '../../shared/format/labels';
import { DifficultyMark } from '../../shared/ui/difficulty-mark';
import { LevelMeter } from '../../shared/ui/level-meter';

/** US-010 à US-014 : le défi du jour d'abord, puis la progression et l'activité. */
@Component({
  selector: 'psh-dashboard-page',
  imports: [RouterLink, DatePipe, DecimalPipe, DifficultyMark, LevelMeter],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './dashboard-page.html',
  styleUrl: './dashboard-page.scss',
})
export class DashboardPage {
  private readonly player = inject(PlayerApi);
  private readonly game = inject(GameApi);
  private readonly router = inject(Router);

  protected readonly view = signal<DashboardView | null>(null);
  protected readonly error = signal<string | null>(null);
  protected readonly starting = signal(false);
  protected readonly statusLabels = STATUS_LABELS;
  protected readonly themeLabels = THEME_LABELS;
  protected readonly achievementSymbols = ACHIEVEMENT_SYMBOLS;

  constructor() {
    void this.load();
  }

  protected async startDaily(challengeId: string): Promise<void> {
    this.starting.set(true);
    this.error.set(null);
    try {
      const started = await firstValueFrom(this.game.start(challengeId));
      await this.router.navigate(['/partie', started.session.id]);
    } catch (error) {
      this.error.set(errorMessage(error));
    } finally {
      this.starting.set(false);
    }
  }

  private async load(): Promise<void> {
    try {
      this.view.set(await firstValueFrom(this.player.dashboard()));
    } catch (error) {
      this.error.set(errorMessage(error));
    }
  }
}
