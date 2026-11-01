import { AppLogger } from '../application/ports';

/**
 * Tâche périodique minimale (sans dépendance de planification) :
 * pas de chevauchement d'exécutions, erreurs journalisées, arrêt propre.
 * Pour plusieurs instances du backend, remplacer par un verrou distribué (Redis) ou BullMQ.
 */
export class IntervalJob {
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    readonly name: string,
    private readonly intervalMs: number,
    private readonly task: () => Promise<unknown>,
    private readonly logger: AppLogger,
  ) {}

  start(): void {
    if (this.timer || this.intervalMs <= 0) {
      return;
    }
    this.timer = setInterval(() => void this.tick(), this.intervalMs);
    this.timer.unref();
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  async tick(): Promise<void> {
    if (this.running) {
      return;
    }
    this.running = true;
    try {
      await this.task();
    } catch (error) {
      this.logger.error('Échec de la tâche périodique', {
        job: this.name,
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      this.running = false;
    }
  }
}
