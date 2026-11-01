import { randomInt, randomUUID } from 'node:crypto';
import { Clock, IdGenerator, RandomSource } from '../domain/ports';

export class SystemClock implements Clock {
  now(): Date {
    return new Date();
  }
}

export class UuidGenerator implements IdGenerator {
  next(): string {
    return randomUUID();
  }
}

export class CryptoRandomSource implements RandomSource {
  nextInt(maxExclusive: number): number {
    return randomInt(maxExclusive);
  }
}

/** Horloge pilotable pour les tests et les scénarios de démonstration. */
export class FixedClock implements Clock {
  constructor(private current: Date) {}

  now(): Date {
    return new Date(this.current.getTime());
  }

  set(instant: Date): void {
    this.current = new Date(instant.getTime());
  }

  advance(milliseconds: number): void {
    this.current = new Date(this.current.getTime() + milliseconds);
  }
}
