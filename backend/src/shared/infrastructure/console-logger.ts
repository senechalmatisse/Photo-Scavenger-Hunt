import { AppLogger } from '../application/ports';

type Level = 'info' | 'warn' | 'error';

/**
 * Journal structuré (une ligne JSON par événement) : exploitable tel quel par Loki, ELK ou CloudWatch.
 * En développement, `pretty` produit une sortie lisible.
 */
export class ConsoleAppLogger implements AppLogger {
  constructor(
    private readonly context: string,
    private readonly pretty = false,
    private readonly silent = false,
  ) {}

  info(message: string, context?: Record<string, unknown>): void {
    this.write('info', message, context);
  }

  warn(message: string, context?: Record<string, unknown>): void {
    this.write('warn', message, context);
  }

  error(message: string, context?: Record<string, unknown>): void {
    this.write('error', message, context);
  }

  child(context: string): ConsoleAppLogger {
    return new ConsoleAppLogger(context, this.pretty, this.silent);
  }

  private write(level: Level, message: string, details?: Record<string, unknown>): void {
    if (this.silent) {
      return;
    }
    const entry = { time: new Date().toISOString(), level, context: this.context, message, ...details };
    const line = this.pretty
      ? `${entry.time} ${level.toUpperCase().padEnd(5)} [${this.context}] ${message}${details ? ` ${JSON.stringify(details)}` : ''}`
      : JSON.stringify(entry);
    if (level === 'error') {
      process.stderr.write(`${line}\n`);
    } else {
      process.stdout.write(`${line}\n`);
    }
  }
}
