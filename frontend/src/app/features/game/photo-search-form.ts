import { ChangeDetectionStrategy, Component, effect, inject, input, output } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule } from '@angular/forms';
import { PhotoQuery, PublicChallenge } from '../../core/api/models';
import { areaToBbox } from '../../shared/format/geo';

interface SearchFormValue {
  readonly text: string;
  readonly tags: string;
  readonly takenFrom: string;
  readonly takenTo: string;
  readonly inZone: boolean;
}

/** US-030 à US-033 : mots-clés, tags, période et zone ; pré-rempli avec les indices publics du défi. */
@Component({
  selector: 'psh-photo-search-form',
  imports: [ReactiveFormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <form class="search" [formGroup]="form" (ngSubmit)="submit()" role="search">
      <label class="field grow">
        <span>Mots-clés</span>
        <input class="input" formControlName="text" placeholder="phare, abbaye, aqueduc…" />
      </label>
      <label class="field">
        <span>Tags Flickr</span>
        <input class="input" formControlName="tags" placeholder="lighthouse, bretagne" />
      </label>
      <label class="field">
        <span>Prise de vue après le</span>
        <input class="input" type="date" formControlName="takenFrom" />
      </label>
      <label class="field">
        <span>et avant le</span>
        <input class="input" type="date" formControlName="takenTo" />
      </label>
      @if (challenge()?.zone) {
        <label class="check">
          <input type="checkbox" formControlName="inZone" />
          <span>Dans la zone du défi{{ challenge()?.zoneLabel ? ' (' + challenge()?.zoneLabel + ')' : '' }}</span>
        </label>
      }
      <button type="submit" class="button" [disabled]="busy()">Rechercher</button>
    </form>
  `,
  styles: `
    .search {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-3);
      align-items: end;
    }

    .grow {
      flex: 2 1 14rem;
    }

    .field {
      flex: 1 1 9rem;
    }

    .check {
      display: inline-flex;
      align-items: center;
      gap: var(--space-2);
      min-height: 2.75rem;
    }

    .check input {
      width: 1.1rem;
      height: 1.1rem;
      accent-color: var(--cyanotype);
    }
  `,
})
export class PhotoSearchForm {
  readonly challenge = input<PublicChallenge | null>(null);
  readonly busy = input(false);
  readonly searchRequested = output<PhotoQuery>();

  protected readonly form = inject(NonNullableFormBuilder).group({
    text: [''],
    tags: [''],
    takenFrom: [''],
    takenTo: [''],
    inZone: [true],
  });

  constructor() {
    // Les indices publics (période) pré-remplissent la recherche, sans écraser une saisie en cours.
    effect(() => {
      const period = this.challenge()?.period;
      if (period && this.form.pristine) {
        this.form.patchValue({ takenFrom: period.from ?? '', takenTo: period.to ?? '' });
      }
    });
  }

  /** Recherche déclenchée depuis la carte, sur la zone visible. */
  searchWithin(bbox: string): void {
    const value = this.form.getRawValue();
    this.searchRequested.emit(this.toQuery(value, bbox));
  }

  protected submit(): void {
    const value = this.form.getRawValue();
    const zone = this.challenge()?.zone;
    this.searchRequested.emit(this.toQuery(value, value.inZone && zone ? areaToBbox(zone) : undefined));
  }

  private toQuery(value: SearchFormValue, bbox: string | undefined): PhotoQuery {
    return {
      text: value.text.trim() || undefined,
      tags: value.tags.trim() || undefined,
      takenFrom: value.takenFrom || undefined,
      takenTo: value.takenTo || undefined,
      bbox,
      perPage: 24,
    };
  }
}
