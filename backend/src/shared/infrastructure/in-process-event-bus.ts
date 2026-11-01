import { AppLogger, EventBus, EventHandler } from '../application/ports';
import { DomainEvent } from '../domain/aggregate-root';

interface Subscription {
  readonly subscriber: string;
  readonly handler: EventHandler;
}

/**
 * Bus d'événements en mémoire (pattern Observer), synchrone après la validation de l'écriture.
 *
 * Chaque abonné est isolé : l'échec de l'un n'empêche ni les autres ni la réponse au joueur.
 * Évolution prévue (cf. docs/adr/0006) : boîte d'envoi transactionnelle (outbox) + file de messages,
 * sans changer ni les émetteurs ni les abonnés.
 */
export class InProcessEventBus implements EventBus {
  private readonly subscriptions = new Map<string, Subscription[]>();

  constructor(private readonly logger: AppLogger) {}

  subscribe<E extends DomainEvent>(type: string, subscriber: string, handler: EventHandler<E>): void {
    const list = this.subscriptions.get(type) ?? [];
    list.push({ subscriber, handler: handler as EventHandler });
    this.subscriptions.set(type, list);
  }

  async publish(events: readonly DomainEvent[]): Promise<void> {
    for (const event of events) {
      for (const { subscriber, handler } of this.subscriptions.get(event.type) ?? []) {
        try {
          await handler(event);
        } catch (error) {
          this.logger.error("Échec d'un abonné à un événement de domaine", {
            event: event.type,
            subscriber,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
    }
  }
}
