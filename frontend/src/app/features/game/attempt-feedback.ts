import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { AttemptView } from '../../core/api/models';

/** US-028 / US-041 : chaque critère de validation, satisfait ou non, avec son explication. */
@Component({
  selector: 'psh-attempt-feedback',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="feedback" [class.accepted]="attempt().accepted" aria-live="polite">
      <h3>{{ attempt().accepted ? 'Réponse acceptée' : 'Réponse refusée' }}</h3>
      <ul>
        @for (outcome of attempt().outcomes; track $index) {
          <li [class.ok]="outcome.satisfied">
            <span class="mark" aria-hidden="true">{{ outcome.satisfied ? '✓' : '✗' }}</span>
            <span>
              <strong>{{ outcome.label }}</strong>
              <span class="visually-hidden">{{ outcome.satisfied ? ', critère satisfait' : ', critère non satisfait' }}</span>
              <br />
              {{ outcome.explanation }}
            </span>
          </li>
        }
      </ul>
    </section>
  `,
  styles: `
    .feedback {
      display: grid;
      gap: var(--space-3);
      padding: var(--space-4);
      border-left: 4px solid var(--grease);
      background: var(--danger-wash);
    }

    .feedback.accepted {
      border-left-color: var(--lichen);
      background: var(--lichen-wash);
    }

    ul {
      list-style: none;
      margin: 0;
      padding: 0;
      display: grid;
      gap: var(--space-3);
    }

    li {
      display: flex;
      gap: var(--space-3);
    }

    .mark {
      font-weight: 900;
      color: var(--grease);
    }

    .ok .mark {
      color: var(--lichen);
    }
  `,
})
export class AttemptFeedback {
  readonly attempt = input.required<AttemptView>();
}
