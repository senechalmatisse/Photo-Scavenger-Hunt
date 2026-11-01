import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { Photo } from '../../core/api/models';

/**
 * Planche contact : les résultats de recherche présentés comme des vues sur une bande de film.
 * Choisir une vue l'entoure au crayon gras, comme un photographe le fait sur ses planches.
 */
@Component({
  selector: 'psh-contact-sheet',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ol class="sheet" [attr.aria-label]="label()">
      @for (photo of photos(); track photo.id; let index = $index) {
        @let frame = offset() + index + 1;
        @let chosen = photo.id === selectedId();
        <li class="frame" [class.chosen]="chosen" [class.tried]="triedIds().includes(photo.id)">
          <button
            type="button"
            class="shot"
            [attr.aria-pressed]="chosen"
            [attr.aria-label]="'Vue ' + frame + ' : ' + photo.title + ', par ' + photo.ownerName"
            (click)="choose.emit(photo)"
          >
            <img [src]="photo.imageUrls.thumbnail" [alt]="''" width="150" height="150" loading="lazy" decoding="async" />
            @if (chosen) {
              <svg class="grease" viewBox="0 0 200 160" preserveAspectRatio="none" aria-hidden="true">
                <path
                  pathLength="1"
                  d="M44 24 C 92 4, 170 10, 188 54 C 204 98, 150 150, 92 148 C 32 146, 4 112, 12 70 C 18 38, 56 16, 108 16 C 132 16, 152 22, 166 32"
                />
              </svg>
            }
          </button>
          <span class="edge" aria-hidden="true">{{ frame }}<span>{{ frame }}A</span></span>
        </li>
      }
    </ol>
  `,
  styles: `
    .sheet {
      list-style: none;
      margin: 0;
      padding: var(--space-3);
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(8.5rem, 1fr));
      gap: 0;
      background: var(--film);
      border-radius: var(--radius-frame);
    }

    .frame {
      position: relative;
      padding: 16px 6px 22px;
      background:
        repeating-linear-gradient(90deg, transparent 0 7px, var(--film-edge) 7px 15px, transparent 15px 22px) top 4px left 0 / 100% 7px no-repeat,
        repeating-linear-gradient(90deg, transparent 0 7px, var(--film-edge) 7px 15px, transparent 15px 22px) bottom 4px left 0 / 100% 7px no-repeat;
    }

    .shot {
      position: relative;
      display: block;
      width: 100%;
      aspect-ratio: 1;
      padding: 0;
      border: 0;
      background: #000;
      cursor: pointer;
    }

    .shot img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }

    .shot:focus-visible {
      box-shadow: 0 0 0 3px var(--film), 0 0 0 5px var(--proof);
    }

    .tried .shot img {
      opacity: 0.35;
      filter: grayscale(1);
    }

    .edge {
      position: absolute;
      left: 8px;
      right: 8px;
      bottom: 9px;
      display: flex;
      justify-content: space-between;
      font-size: 0.6875rem;
      line-height: 1;
      font-variation-settings: 'wdth' 62;
      font-weight: 700;
      color: var(--safelight);
    }

    .grease {
      position: absolute;
      inset: -14% -16%;
      width: 132%;
      height: 128%;
      pointer-events: none;
      overflow: visible;
    }

    .grease path {
      fill: none;
      stroke: var(--grease);
      stroke-width: 7;
      stroke-linecap: round;
      stroke-dasharray: 1;
      stroke-dashoffset: 1;
      animation: draw 480ms ease-out forwards;
      vector-effect: non-scaling-stroke;
    }

    @keyframes draw {
      to {
        stroke-dashoffset: 0;
      }
    }
  `,
})
export class ContactSheet {
  readonly photos = input.required<readonly Photo[]>();
  readonly selectedId = input<string | null>(null);
  readonly triedIds = input<readonly string[]>([]);
  readonly offset = input(0);
  readonly label = input('Résultats de la recherche');
  readonly choose = output<Photo>();
}
