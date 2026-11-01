import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthStore } from '../../core/auth/auth-store';
import { errorMessage } from '../../core/http/interceptors';

/** US-001 : création de compte ; un invité conserve sa progression. */
@Component({
  selector: 'psh-register-page',
  imports: [ReactiveFormsModule, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page narrow">
      <header class="page-header">
        <h1>Créer un compte</h1>
        @if (auth.isGuest()) {
          <p class="lede">Votre partie en invité est conservée : points, niveau et historique suivent votre nouveau compte.</p>
        } @else {
          <p class="lede">Un compte garde vos points, votre niveau et vos badges d'un appareil à l'autre.</p>
        }
      </header>

      <form class="stack" [formGroup]="form" (ngSubmit)="submit()" novalidate>
        <label class="field">
          <span>Pseudonyme</span>
          <input class="input" formControlName="displayName" autocomplete="nickname" minlength="3" maxlength="30" required />
          <small class="hint-text">Affiché dans les classements, 3 à 30 caractères.</small>
        </label>
        <label class="field">
          <span>Adresse e-mail</span>
          <input class="input" type="email" formControlName="email" autocomplete="email" required />
        </label>
        <label class="field">
          <span>Mot de passe</span>
          <input class="input" type="password" formControlName="password" autocomplete="new-password" minlength="10" required />
          <small class="hint-text">10 caractères au minimum. Une phrase facile à retenir fait un bon mot de passe.</small>
        </label>
        @if (error()) {
          <p class="notice error" role="alert">{{ error() }}</p>
        }
        <div class="row">
          <button type="submit" class="button" [disabled]="busy() || form.invalid">Créer mon compte</button>
          <a class="button quiet" [routerLink]="auth.isGuest() ? '/' : '/connexion'">Annuler</a>
        </div>
      </form>
    </div>
  `,
  styles: `
    .narrow {
      max-width: 34rem;
    }
  `,
})
export class RegisterPage {
  protected readonly auth = inject(AuthStore);
  private readonly router = inject(Router);
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly form = inject(NonNullableFormBuilder).group({
    displayName: ['', [Validators.required, Validators.minLength(3), Validators.maxLength(30)]],
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(10), Validators.maxLength(128)]],
  });

  protected async submit(): Promise<void> {
    if (this.form.invalid) {
      return;
    }
    this.busy.set(true);
    this.error.set(null);
    try {
      await this.auth.register(this.form.getRawValue());
      await this.router.navigateByUrl('/');
    } catch (error) {
      this.error.set(errorMessage(error));
    } finally {
      this.busy.set(false);
    }
  }
}
