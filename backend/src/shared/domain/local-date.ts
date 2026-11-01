import { ValidationError } from './domain-error';

/** Date civile sans fuseau, au format ISO `YYYY-MM-DD` (comparable lexicographiquement). */
export type LocalDate = string;

const LOCAL_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const DAY_MS = 86_400_000;

function toUtcMidnight(day: LocalDate): number {
  const [year, month, date] = day.split('-').map(Number);
  return Date.UTC(year, month - 1, date);
}

function fromUtc(ms: number): LocalDate {
  return new Date(ms).toISOString().slice(0, 10);
}

export const LocalDates = {
  isValid(value: unknown): value is LocalDate {
    if (typeof value !== 'string') {
      return false;
    }
    const match = LOCAL_DATE_PATTERN.exec(value);
    if (!match) {
      return false;
    }
    return fromUtc(toUtcMidnight(value)) === value;
  },

  parse(value: unknown, field: string): LocalDate {
    if (!LocalDates.isValid(value)) {
      throw new ValidationError('INVALID_DATE', `${field} : date attendue au format AAAA-MM-JJ.`, { field });
    }
    return value;
  },

  addDays(day: LocalDate, delta: number): LocalDate {
    return fromUtc(toUtcMidnight(day) + delta * DAY_MS);
  },

  daysBetween(from: LocalDate, to: LocalDate): number {
    return Math.round((toUtcMidnight(to) - toUtcMidnight(from)) / DAY_MS);
  },

  /** Semaine ISO 8601, ex. `2026-W44` (le jeudi détermine l'année). */
  isoWeekKey(day: LocalDate): string {
    const date = new Date(toUtcMidnight(day));
    const isoWeekday = date.getUTCDay() === 0 ? 7 : date.getUTCDay();
    const thursday = new Date(date.getTime() + (4 - isoWeekday) * DAY_MS);
    const year = thursday.getUTCFullYear();
    const week = 1 + Math.floor((thursday.getTime() - Date.UTC(year, 0, 1)) / (7 * DAY_MS));
    return `${year}-W${String(week).padStart(2, '0')}`;
  },

  monthKey(day: LocalDate): string {
    return day.slice(0, 7);
  },

  /** Format d'affichage français `JJ/MM/AAAA`. */
  format(day: LocalDate): string {
    const [year, month, date] = day.split('-');
    return `${date}/${month}/${year}`;
  },
};

/** Intervalle de jours bornés (au moins une borne), bornes incluses. */
export class DayRange {
  private constructor(
    readonly from: LocalDate | null,
    readonly to: LocalDate | null,
  ) {}

  static of(from: LocalDate | null | undefined, to: LocalDate | null | undefined): DayRange {
    const start = from ?? null;
    const end = to ?? null;
    if (start === null && end === null) {
      throw new ValidationError('INVALID_PERIOD', 'Une période doit avoir au moins une borne.');
    }
    if (start !== null) {
      LocalDates.parse(start, 'Début de période');
    }
    if (end !== null) {
      LocalDates.parse(end, 'Fin de période');
    }
    if (start !== null && end !== null && start > end) {
      throw new ValidationError('INVALID_PERIOD', 'Le début de la période doit précéder sa fin.');
    }
    return new DayRange(start, end);
  }

  contains(day: LocalDate): boolean {
    return (this.from === null || day >= this.from) && (this.to === null || day <= this.to);
  }

  /** « 2015–2024 » pour des années pleines, sinon dates complètes. */
  describe(): string {
    const fullYears =
      (this.from === null || this.from.endsWith('-01-01')) && (this.to === null || this.to.endsWith('-12-31'));
    const show = (day: LocalDate) => (fullYears ? day.slice(0, 4) : LocalDates.format(day));
    if (this.from !== null && this.to !== null) {
      return this.from.slice(0, 4) === this.to.slice(0, 4) && fullYears
        ? `en ${this.from.slice(0, 4)}`
        : `${show(this.from)}–${show(this.to)}`;
    }
    return this.from !== null ? `à partir de ${show(this.from)}` : `jusqu'à ${show(this.to as LocalDate)}`;
  }

  toJSON(): { from: LocalDate | null; to: LocalDate | null } {
    return { from: this.from, to: this.to };
  }
}
