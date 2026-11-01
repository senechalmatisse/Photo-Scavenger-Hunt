import { ChangeDetectionStrategy, Component, inject, input, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthStore } from '../../core/auth/auth-store';
import { errorMessage } from '../../core/http/interceptors';

/** US-002 et US-006 : connexion, ou partie immédiate en invité. */
@Component({
  selector: 'psh-login-page',
  imports: [ReactiveFormsModule, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page auth">
      <section class="intro">
        <h1>Retrouvez la photo que l'énigme décrit.</h1>
        <p class="lede">
          Chaque mission vous donne une énigme, une zone et une période. Fouillez les photographies publiques de Flickr,
          entourez la bonne vue, et gagnez des points.
        </p>
        <button type="button" class="button" (click)="playAsGuest()" [disabled]="busy()">Jouer sans compte</button>
        <p class="hint-text">Vous pourrez créer un compte plus tard sans perdre votre progression.</p>
      </section>

      <form class="stack panel" [formGroup]="form" (ngSubmit)="submit()" novalidate>
        <h2>Se connecter</h2>
        <label class="field">
          <span>Adresse e-mail</span>
          <input class="input" type="email" formControlName="email" autocomplete="email" required />
        </label>
        <label class="field">
          <span>Mot de passe</span>
          <input class="input" type="password" formControlName="password" autocomplete="current-password" required />
        </label>
        @if (error()) {
          <p class="notice error" role="alert">{{ error() }}</p>
        }
        <button type="submit" class="button" [disabled]="busy() || form.invalid">Se connecter</button>
        <p class="hint-text">Pas encore de compte ? <a routerLink="/inscription">Créer un compte</a></p>
      </form>
    </div>
  `,
  styles: `
    .auth {
      grid-template-columns: minmax(0, 1fr);
      align-items: start;
    }

    @media (min-width: 56rem) {
      .auth {
        grid-template-columns: 1.3fr 1fr;
        padding-top: var(--space-8);
      }
    }

    .intro {
      display: grid;
      gap: var(--space-5);
      justify-items: start;
    }

    .intro h1 {
      font-size: var(--step-5);
      font-weight: 900;
    }

    .panel {
      padding: var(--space-6);
      background: var(--paper);
      border: 1px solid var(--rule);
      border-radius: var(--radius-control);
    }
  `,
})
export class LoginPage {
  /** Page demandée avant la redirection vers la connexion. */
  readonly retour = input<string>();

  private readonly auth = inject(AuthStore);
  private readonly router = inject(Router);
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly form = inject(NonNullableFormBuilder).group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', Validators.required],
  });

  protected async submit(): Promise<void> {
    if (this.form.invalid) {
      return;
    }
    await this.run(() => this.auth.login(this.form.getRawValue().email, this.form.getRawValue().password));
  }

  protected async playAsGuest(): Promise<void> {
    await this.run(() => this.auth.playAsGuest());
  }

  private async run(action: () => Promise<void>): Promise<void> {
    this.busy.set(true);
    this.error.set(null);
    try {
      await action();
      await this.router.navigateByUrl(this.retour() ?? '/');
    } catch (error) {
      this.error.set(errorMessage(error));
    } finally {
      this.busy.set(false);
    }
  }
}
