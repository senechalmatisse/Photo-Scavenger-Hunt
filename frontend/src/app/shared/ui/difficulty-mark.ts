import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { Difficulty } from '../../core/api/models';
import { DIFFICULTY_LABELS, DIFFICULTY_LEVEL } from '../format/labels';

/** Difficulté : quatre crans pleins ou vides, toujours accompagnés du libellé (pas d'information portée par la seule forme). */
@Component({
  selector: 'psh-difficulty',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span class="pips" aria-hidden="true">
      @for (pip of pips(); track $index) {
        <span class="pip" [class.on]="pip"></span>
      }
    </span>
    <span>{{ label() }}</span>
  `,
  styles: `
    :host {
      display: inline-flex;
      align-items: center;
      gap: var(--space-2);
      font-weight: 600;
    }

    .pips {
      display: inline-flex;
      gap: 3px;
    }

    .pip {
      width: 6px;
      height: 14px;
      border: 1.5px solid currentColor;
      border-radius: 1px;
      opacity: 0.45;
    }

    .pip.on {
      background: currentColor;
      opacity: 1;
    }
  `,
})
export class DifficultyMark {
  readonly level = input.required<Difficulty>();
  protected readonly label = computed(() => DIFFICULTY_LABELS[this.level()]);
  protected readonly pips = computed(() => [1, 2, 3, 4].map((step) => step <= DIFFICULTY_LEVEL[this.level()]));
}
