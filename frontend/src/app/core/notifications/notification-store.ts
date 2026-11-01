import { Injectable, signal } from '@angular/core';

export type NotificationKind = 'info' | 'success' | 'error';

export interface Notification {
  readonly id: number;
  readonly kind: NotificationKind;
  readonly message: string;
}

/** Messages éphémères affichés par ToastHost (région aria-live). */
@Injectable({ providedIn: 'root' })
export class NotificationStore {
  private sequence = 0;
  private readonly items = signal<readonly Notification[]>([]);
  readonly notifications = this.items.asReadonly();

  show(message: string, kind: NotificationKind = 'info', durationMs = 5000): void {
    const id = ++this.sequence;
    this.items.update((items) => [...items.slice(-3), { id, kind, message }]);
    setTimeout(() => this.dismiss(id), durationMs);
  }

  dismiss(id: number): void {
    this.items.update((items) => items.filter((item) => item.id !== id));
  }
}
