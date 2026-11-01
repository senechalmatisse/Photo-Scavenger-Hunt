import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { LevelProgress } from '../../core/api/models';

/** US-013 : progression vers le niveau suivant. */
@Component({
  selector: 'psh-level-meter',
  imports: [DecimalPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="head">
      <strong class="level">Niveau {{ progress().level }}</strong>
      <span class="muted">{{ progress().xp | number }} XP, prochain niveau à {{ progress().nextLevelXp | number }} XP</span>
    </div>
    <div
      class="track"
      role="progressbar"
      aria-label="Progression vers le niveau suivant"
      [attr.aria-valuenow]="percent()"
      aria-valuemin="0"
      aria-valuemax="100"
    >
      <div class="fill" [style.width.%]="percent()"></div>
    </div>
  `,
  styles: `
    :host {
      display: grid;
      gap: var(--space-2);
    }

    .head {
      display: flex;
      flex-wrap: wrap;
      align-items: baseline;
      gap: var(--space-3);
    }

    .level {
      font-size: var(--step-2);
      font-variation-settings: 'wdth' 125;
    }

    .track {
      height: 10px;
      background: var(--rule);
      border-radius: 5px;
      overflow: hidden;
    }

    .fill {
      height: 100%;
      background: var(--cyanotype);
    }
  `,
})
export class LevelMeter {
  readonly progress = input.required<LevelProgress>();
  protected readonly percent = computed(() => Math.round(Math.min(1, Math.max(0, this.progress().ratio)) * 100));
}
