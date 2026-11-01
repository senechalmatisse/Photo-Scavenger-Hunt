import { LocalDate, LocalDates } from './local-date';

type WallClock = Record<'year' | 'month' | 'day' | 'hour' | 'minute' | 'second', string>;

/**
 * Calendrier du jeu : définit la « journée de jeu » dans un fuseau unique
 * (défi quotidien, séries, classements hebdomadaires et mensuels).
 */
export class GameCalendar {
  private readonly formatter: Intl.DateTimeFormat;

  constructor(readonly timeZone: string) {
    this.formatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    });
  }

  dayOf(instant: Date): LocalDate {
    const clock = this.wallClock(instant);
    return `${clock.year}-${clock.month}-${clock.day}`;
  }

  /** Instant de fin d'une journée de jeu : minuit suivant, heure locale du jeu. */
  endOfDay(day: LocalDate): Date {
    const [year, month, date] = LocalDates.addDays(day, 1).split('-').map(Number);
    const midnightAsUtc = Date.UTC(year, month - 1, date);
    // Deux passes pour absorber un éventuel changement d'heure autour de minuit.
    let instant = midnightAsUtc - this.offsetMs(new Date(midnightAsUtc));
    instant = midnightAsUtc - this.offsetMs(new Date(instant));
    return new Date(instant);
  }

  private offsetMs(instant: Date): number {
    const clock = this.wallClock(instant);
    const wallAsUtc = Date.UTC(
      Number(clock.year),
      Number(clock.month) - 1,
      Number(clock.day),
      Number(clock.hour),
      Number(clock.minute),
      Number(clock.second),
    );
    return wallAsUtc - (instant.getTime() - instant.getUTCMilliseconds());
  }

  private wallClock(instant: Date): WallClock {
    const parts: Partial<WallClock> = {};
    for (const part of this.formatter.formatToParts(instant)) {
      if (part.type !== 'literal' && part.type in { year: 1, month: 1, day: 1, hour: 1, minute: 1, second: 1 }) {
        parts[part.type as keyof WallClock] = part.value;
      }
    }
    return parts as WallClock;
  }
}
