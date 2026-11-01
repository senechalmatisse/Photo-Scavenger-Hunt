import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { NotificationStore } from '../../core/notifications/notification-store';

@Component({
  selector: 'psh-toast-host',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="toasts" role="status" aria-live="polite">
      @for (toast of store.notifications(); track toast.id) {
        <div class="toast" [class]="toast.kind">
          <p>{{ toast.message }}</p>
          <button type="button" class="button quiet" (click)="store.dismiss(toast.id)" aria-label="Fermer le message">×</button>
        </div>
      }
    </div>
  `,
  styles: `
    .toasts {
      position: fixed;
      right: var(--space-4);
      bottom: var(--space-4);
      display: grid;
      gap: var(--space-2);
      width: min(26rem, calc(100vw - 2rem));
      z-index: 1000;
    }

    .toast {
      display: flex;
      align-items: center;
      gap: var(--space-3);
      padding: var(--space-3) var(--space-4);
      background: var(--film);
      color: var(--proof);
      border-left: 4px solid var(--cyanotype);
      border-radius: var(--radius-control);
    }

    .toast.error {
      border-left-color: var(--grease);
    }

    .toast.success {
      border-left-color: var(--lichen);
    }

    .toast p {
      flex: 1;
    }

    .toast .button {
      color: var(--proof);
      min-height: 2rem;
    }
  `,
})
export class ToastHost {
  protected readonly store = inject(NotificationStore);
}
