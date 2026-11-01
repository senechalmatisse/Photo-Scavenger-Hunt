import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthStore } from './core/auth/auth-store';
import { AVATAR_SYMBOLS } from './shared/format/labels';
import { ToastHost } from './shared/ui/toast-host';

@Component({
  selector: 'psh-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, ToastHost],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <a class="skip-link" href="#contenu">Aller au contenu</a>
    <header class="masthead">
      <div class="masthead-inner">
        <a class="wordmark" routerLink="/" aria-label="Photo Scavenger Hunt, accueil">
          <span class="wordmark-frame" aria-hidden="true"></span>
          Photo Scavenger Hunt
        </a>
        @if (auth.isAuthenticated()) {
          <nav aria-label="Navigation principale">
            <a routerLink="/" routerLinkActive="active" [routerLinkActiveOptions]="{ exact: true }">Accueil</a>
            <a routerLink="/defis" routerLinkActive="active">Défis</a>
            <a routerLink="/classements" routerLinkActive="active">Classements</a>
            @if (auth.isAdmin()) {
              <a routerLink="/admin" routerLinkActive="active">Administration</a>
            }
          </nav>
          <a class="player" routerLink="/profil" [attr.aria-label]="'Profil de ' + auth.user()?.displayName">
            <span aria-hidden="true">{{ avatar() }}</span>
            <span class="player-name">{{ auth.user()?.displayName }}</span>
          </a>
        }
      </div>
    </header>

    <main id="contenu" tabindex="-1">
      <router-outlet />
    </main>

    <footer class="colophon">
      <p>Les photographies restent la propriété de leurs auteurs : chacune est affichée avec son attribution, sa licence et un lien vers sa source.</p>
      <p>This product uses the Flickr API but is not endorsed or certified by SmugMug, Inc.</p>
    </footer>

    <psh-toast-host />
  `,
  styles: `
    :host {
      display: grid;
      min-height: 100dvh;
      grid-template-rows: auto 1fr auto;
    }

    .skip-link {
      position: absolute;
      left: var(--space-4);
      top: -3rem;
      padding: var(--space-2) var(--space-4);
      background: var(--paper);
      z-index: 10;
    }

    .skip-link:focus {
      top: var(--space-2);
    }

    .masthead {
      background: var(--film);
      color: var(--proof);
    }

    .masthead-inner {
      max-width: var(--content);
      margin: 0 auto;
      padding: var(--space-3) var(--space-4);
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: var(--space-3) var(--space-6);
    }

    .wordmark {
      display: inline-flex;
      align-items: center;
      gap: var(--space-3);
      color: inherit;
      text-decoration: none;
      font-weight: 900;
      font-variation-settings: 'wdth' 125;
      font-size: var(--step-1);
      letter-spacing: -0.01em;
    }

    .wordmark-frame {
      width: 1.6rem;
      height: 1.2rem;
      border: 3px solid var(--proof);
      border-radius: 2px;
      box-shadow: 0 0 0 2px var(--grease);
    }

    nav {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-1);
      margin-right: auto;
    }

    nav a,
    .player {
      color: color-mix(in srgb, var(--proof) 78%, transparent);
      text-decoration: none;
      padding: var(--space-2) var(--space-3);
      border-radius: var(--radius-control);
    }

    nav a:hover,
    .player:hover {
      color: var(--proof);
    }

    nav a.active {
      color: var(--proof);
      box-shadow: inset 0 -2px 0 var(--proof);
      border-radius: 0;
    }

    .player {
      display: inline-flex;
      gap: var(--space-2);
      align-items: center;
    }

    .player-name {
      max-width: 12rem;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    main:focus {
      outline: none;
    }

    .colophon {
      padding: var(--space-5) var(--space-4);
      border-top: 1px solid var(--rule);
      display: grid;
      gap: var(--space-2);
      justify-items: center;
      text-align: center;
      font-size: var(--step--1);
      color: var(--ink-soft);
    }
  `,
})
export class App {
  protected readonly auth = inject(AuthStore);

  protected avatar(): string {
    return AVATAR_SYMBOLS[this.auth.user()?.avatar ?? 'compass'] ?? '🧭';
  }
}
