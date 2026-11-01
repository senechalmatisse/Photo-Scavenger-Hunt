import { DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { ChallengesApi } from '../../core/api/api-clients';
import { Difficulty, Page, PublicChallenge, Theme } from '../../core/api/models';
import { errorMessage } from '../../core/http/interceptors';
import { DIFFICULTY_LABELS, REGIONS, THEME_LABELS } from '../../shared/format/labels';
import { DifficultyMark } from '../../shared/ui/difficulty-mark';

/** US-020 à US-022 : catalogue des missions, filtrable par difficulté, thème et région. */
@Component({
  selector: 'psh-catalog-page',
  imports: [RouterLink, DecimalPipe, DifficultyMark],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page">
      <header class="page-header">
        <h1>Défis</h1>
        <p class="lede">Choisissez une mission à votre niveau, sur les sujets et les régions qui vous intéressent.</p>
      </header>

      <section class="filters" aria-label="Filtres">
        <div class="field">
          <span id="difficulty-label">Difficulté</span>
          <div class="segmented" role="group" aria-labelledby="difficulty-label">
            <button type="button" [attr.aria-pressed]="difficulty() === null" (click)="setDifficulty(null)">Toutes</button>
            @for (level of difficulties; track level) {
              <button type="button" [attr.aria-pressed]="difficulty() === level" (click)="setDifficulty(level)">
                {{ difficultyLabels[level] }}
              </button>
            }
          </div>
        </div>
        <label class="field">
          <span>Thème</span>
          <select class="select" [value]="theme() ?? ''" (change)="setTheme($any($event.target).value)">
            <option value="">Tous les thèmes</option>
            @for (code of themes; track code) {
              <option [value]="code">{{ themeLabels[code] }}</option>
            }
          </select>
        </label>
        <label class="field">
          <span>Région</span>
          <select class="select" [value]="region() ?? ''" (change)="setRegion($any($event.target).value)">
            <option value="">Toutes les régions</option>
            @for (option of regions; track option.bbox) {
              <option [value]="option.bbox">{{ option.label }}</option>
            }
          </select>
        </label>
      </section>

      @if (error()) {
        <p class="notice error" role="alert">{{ error() }}</p>
      }

      @if (page(); as result) {
        <p class="muted" aria-live="polite">{{ result.total }} défi{{ result.total > 1 ? 's' : '' }}</p>
        @if (result.items.length === 0) {
          <p>Aucun défi ne correspond à ces filtres. Élargissez la région ou la difficulté.</p>
        }
        <ul class="catalog">
          @for (challenge of result.items; track challenge.id) {
            <li>
              <a [routerLink]="['/defis', challenge.id]" class="entry">
                <h2>{{ challenge.title }}</h2>
                <p class="riddle">{{ challenge.riddle }}</p>
              </a>
              <dl class="facts">
                <div>
                  <dt>Difficulté</dt>
                  <dd><psh-difficulty [level]="challenge.difficulty" /></dd>
                </div>
                <div>
                  <dt>Thème</dt>
                  <dd>{{ themeLabels[challenge.theme] }}</dd>
                </div>
                @if (challenge.zoneLabel) {
                  <div>
                    <dt>Zone</dt>
                    <dd>{{ challenge.zoneLabel }}</dd>
                  </div>
                }
                <div>
                  <dt>Récompense</dt>
                  <dd>{{ challenge.reward.points | number }} points</dd>
                </div>
              </dl>
            </li>
          }
        </ul>
        @if (result.total > result.page * result.pageSize) {
          <button type="button" class="button secondary" (click)="loadMore()">Afficher plus de défis</button>
        }
      }
    </div>
  `,
  styles: `
    .filters {
      display: grid;
      gap: var(--space-4);
      grid-template-columns: repeat(auto-fit, minmax(14rem, 1fr));
      align-items: end;
    }

    .catalog {
      list-style: none;
      margin: 0;
      padding: 0;
      display: grid;
    }

    .catalog li {
      display: grid;
      gap: var(--space-3);
      padding: var(--space-5) 0;
      border-bottom: 1px solid var(--rule);
    }

    .entry {
      display: grid;
      gap: var(--space-2);
      color: inherit;
      text-decoration: none;
    }

    .entry:hover h2 {
      text-decoration: underline;
    }

    .riddle {
      color: var(--ink-soft);
    }
  `,
})
export class CatalogPage {
  private readonly api = inject(ChallengesApi);

  protected readonly difficulties: readonly Difficulty[] = ['EASY', 'INTERMEDIATE', 'HARD', 'EXPERT'];
  protected readonly themes = Object.keys(THEME_LABELS) as Theme[];
  protected readonly regions = REGIONS;
  protected readonly difficultyLabels = DIFFICULTY_LABELS;
  protected readonly themeLabels = THEME_LABELS;

  protected readonly difficulty = signal<Difficulty | null>(null);
  protected readonly theme = signal<string | null>(null);
  protected readonly region = signal<string | null>(null);
  protected readonly page = signal<Page<PublicChallenge> | null>(null);
  protected readonly error = signal<string | null>(null);

  constructor() {
    void this.load(1);
  }

  protected setDifficulty(level: Difficulty | null): void {
    this.difficulty.set(level);
    void this.load(1);
  }

  protected setTheme(value: string): void {
    this.theme.set(value || null);
    void this.load(1);
  }

  protected setRegion(value: string): void {
    this.region.set(value || null);
    void this.load(1);
  }

  protected loadMore(): void {
    const current = this.page();
    if (current) {
      void this.load(current.page + 1);
    }
  }

  private async load(pageNumber: number): Promise<void> {
    this.error.set(null);
    try {
      const result = await firstValueFrom(
        this.api.catalog({
          difficulty: this.difficulty() ?? undefined,
          theme: this.theme() ?? undefined,
          bbox: this.region() ?? undefined,
          page: pageNumber,
          pageSize: 12,
        }),
      );
      const previous = this.page();
      this.page.set(pageNumber > 1 && previous ? { ...result, items: [...previous.items, ...result.items] } : result);
    } catch (error) {
      this.error.set(errorMessage(error));
    }
  }
}
