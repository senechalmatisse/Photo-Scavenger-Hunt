import { DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { SessionView } from '../../core/api/models';
import { formatDuration } from '../../shared/format/labels';

const HEADLINES: Readonly<Record<string, string>> = {
  VALIDATED: 'Mission réussie',
  FAILED: 'Mission échouée',
  EXPIRED: 'Temps écoulé',
  ABANDONED: 'Mission abandonnée',
};

/** US-029 / US-045 : score détaillé, XP gagnée et révélation de la photo de référence. */
@Component({
  selector: 'psh-result-panel',
  imports: [DecimalPipe, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="result" [attr.data-status]="session().status" aria-labelledby="result-title">
      <h2 id="result-title">{{ headline() }}</h2>
      <p class="summary">
        {{ session().result?.points ?? 0 | number }} points et {{ session().result?.xp ?? 0 | number }} XP,
        en {{ duration() }} avec {{ session().hints.revealed.length }} indice{{ session().hints.revealed.length > 1 ? 's' : '' }}.
      </p>

      @if (session().result?.score; as score) {
        <table class="table score">
          <caption class="visually-hidden">Détail du score</caption>
          <tbody>
            @for (line of score.lines; track line.code) {
              <tr>
                <td>{{ line.label }}</td>
                <td class="numeric">{{ line.points > 0 ? '+' : '' }}{{ line.points | number }}</td>
              </tr>
            }
          </tbody>
          <tfoot>
            <tr>
              <th scope="row">Total</th>
              <td class="numeric">{{ score.total | number }}</td>
            </tr>
          </tfoot>
        </table>
      }

      @if (session().result?.referencePhoto; as reference) {
        <figure class="reference">
          <img [src]="reference.imageUrl" [alt]="reference.title" width="640" height="480" />
          <figcaption>
            La photo de référence : <a [href]="reference.pageUrl" target="_blank" rel="noopener noreferrer">{{ reference.title }}</a>,
            par {{ reference.ownerName }}, licence
            @if (reference.licenseUrl) {
              <a [href]="reference.licenseUrl" target="_blank" rel="noopener noreferrer">{{ reference.licenseName }}</a>.
            } @else {
              {{ reference.licenseName }}.
            }
          </figcaption>
        </figure>
      }

      <div class="row">
        @if (replayable()) {
          <button type="button" class="button" (click)="replay.emit()">Rejouer ce défi</button>
        }
        <a class="button secondary" routerLink="/defis">Choisir un autre défi</a>
        <a class="button quiet" routerLink="/">Retour à l'accueil</a>
      </div>
    </section>
  `,
  styles: `
    .result {
      display: grid;
      gap: var(--space-5);
      justify-items: start;
    }

    h2 {
      font-size: var(--step-4);
      font-weight: 900;
    }

    .result[data-status='VALIDATED'] h2 {
      color: var(--lichen);
    }

    .summary {
      font-size: var(--step-1);
    }

    .score {
      max-width: 28rem;
    }

    .score tfoot th,
    .score tfoot td {
      font-weight: 800;
      border-bottom: 0;
    }

    .reference {
      margin: 0;
      display: grid;
      gap: var(--space-2);
      max-width: 36rem;
    }

    .reference img {
      border: 10px solid var(--film);
      border-radius: var(--radius-frame);
    }

    figcaption {
      font-size: var(--step--1);
      color: var(--ink-soft);
    }
  `,
})
export class ResultPanel {
  readonly session = input.required<SessionView>();
  readonly replayable = input(false);
  readonly replay = output<void>();

  protected readonly headline = computed(() => HEADLINES[this.session().status] ?? 'Partie terminée');
  protected readonly duration = computed(() => formatDuration(this.session().elapsedMs));
}
