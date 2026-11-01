import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { Photo } from '../../core/api/models';
import { formatTaken } from '../format/labels';

/**
 * Fiche d'une photographie (US-034, US-036) : contexte, attribution, licence et lien vers la source.
 * Le contenu projeté accueille l'action du parent (ex. « Proposer cette photo »).
 */
@Component({
  selector: 'psh-photo-inspector',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <figure>
      <img [src]="photo().imageUrls.medium" [alt]="photo().title" width="640" height="480" decoding="async" />
      <figcaption>
        <h3>{{ photo().title }}</h3>
        <p class="credit">
          Photo de {{ photo().ownerName }}, licence
          @if (photo().license.url) {
            <a [href]="photo().license.url" target="_blank" rel="noopener noreferrer">{{ photo().license.name }}</a>
          } @else {
            {{ photo().license.name }}
          }.
        </p>
      </figcaption>
    </figure>
    <dl class="facts">
      <div>
        <dt>Prise de vue</dt>
        <dd>{{ taken() }}</dd>
      </div>
      <div>
        <dt>Lieu</dt>
        <dd>{{ photo().placeName ?? (photo().location ? 'Géolocalisée' : 'Non géolocalisée') }}</dd>
      </div>
    </dl>
    @if (photo().tags.length > 0) {
      <p class="tags"><span class="visually-hidden">Mots-clés :</span>{{ tags() }}</p>
    }
    <div class="row">
      <ng-content />
      <a class="button quiet" [href]="photo().pageUrl" target="_blank" rel="noopener noreferrer">Voir la photo originale</a>
    </div>
  `,
  styles: `
    :host {
      display: grid;
      gap: var(--space-4);
    }

    figure {
      margin: 0;
      display: grid;
      gap: var(--space-3);
    }

    img {
      width: 100%;
      height: auto;
      max-height: 22rem;
      object-fit: contain;
      background: var(--film);
      border-radius: var(--radius-frame);
    }

    .credit {
      font-size: var(--step--1);
      color: var(--ink-soft);
    }

    .tags {
      font-size: var(--step--1);
      color: var(--ink-soft);
    }
  `,
})
export class PhotoInspector {
  readonly photo = input.required<Photo>();
  protected readonly taken = computed(() => formatTaken(this.photo().takenOn, this.photo().takenGranularity));
  protected readonly tags = computed(() => this.photo().tags.slice(0, 10).map((tag) => `#${tag}`).join('  '));
}
