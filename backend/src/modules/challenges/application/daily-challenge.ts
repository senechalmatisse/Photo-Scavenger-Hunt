import { BusinessRuleViolation, NotFoundError, ValidationError } from '../../../shared/domain/domain-error';
import { GameCalendar } from '../../../shared/domain/game-calendar';
import { LocalDate, LocalDates } from '../../../shared/domain/local-date';
import { Clock } from '../../../shared/domain/ports';
import { Challenge } from '../domain/challenge';
import { ChallengeRepository, DailyChallengePicker, DailyChallengeSchedule } from '../domain/challenge.repository';

export interface DailyChallenge {
  readonly day: LocalDate;
  readonly challenge: Challenge;
}

/** Évite de reproposer un défi quotidien récent quand le catalogue le permet. */
const RECENT_DAYS = 30;

/**
 * Défi du jour (US-011) : programmé par un administrateur, sinon choisi de façon déterministe
 * puis mémorisé, pour que tous les joueurs reçoivent la même mission toute la journée.
 */
export class GetDailyChallenge {
  constructor(
    private readonly challenges: ChallengeRepository,
    private readonly schedule: DailyChallengeSchedule,
    private readonly picker: DailyChallengePicker,
    private readonly calendar: GameCalendar,
    private readonly clock: Clock,
  ) {}

  async execute(): Promise<DailyChallenge | null> {
    const now = this.clock.now();
    const day = this.calendar.dayOf(now);
    const scheduledId = await this.schedule.challengeIdFor(day);
    if (scheduledId) {
      const scheduled = await this.challenges.findById(scheduledId);
      if (scheduled && scheduled.isPlayableAt(now)) {
        return { day, challenge: scheduled };
      }
    }

    const candidates = (await this.challenges.findDailyCandidates(now)).filter((c) => c.id !== scheduledId);
    const recent = new Set(
      await this.schedule.challengeIdsBetween(LocalDates.addDays(day, -RECENT_DAYS), LocalDates.addDays(day, -1)),
    );
    const pickedId = this.picker.pick(day, candidates.map((c) => c.id), recent);
    if (!pickedId) {
      return null;
    }
    if (scheduledId) {
      // Le défi programmé est devenu injouable (désactivé) : on le remplace pour la journée.
      await this.schedule.assign(day, pickedId, now, 'AUTO');
    } else {
      await this.schedule.assignIfAbsent(day, pickedId, now);
    }
    const retainedId = (await this.schedule.challengeIdFor(day)) ?? pickedId;
    const retained = candidates.find((c) => c.id === retainedId) ?? (await this.challenges.findById(retainedId));
    return retained && retained.isPlayableAt(now) ? { day, challenge: retained } : null;
  }
}

/** Programmation manuelle du défi d'un jour donné (« publier ou programmer sa disponibilité »). */
export class ScheduleDailyChallenge {
  constructor(
    private readonly challenges: ChallengeRepository,
    private readonly schedule: DailyChallengeSchedule,
    private readonly calendar: GameCalendar,
    private readonly clock: Clock,
  ) {}

  async execute(day: string, challengeId: string): Promise<void> {
    const targetDay = LocalDates.parse(day, 'Jour');
    const now = this.clock.now();
    if (targetDay < this.calendar.dayOf(now)) {
      throw new ValidationError('DAY_IN_PAST', 'Impossible de programmer un défi pour un jour passé.');
    }
    const challenge = await this.challenges.findById(challengeId);
    if (!challenge) {
      throw new NotFoundError('CHALLENGE_NOT_FOUND', 'Défi introuvable.', { id: challengeId });
    }
    if (challenge.status !== 'PUBLISHED') {
      throw new BusinessRuleViolation('CHALLENGE_NOT_PUBLISHED', 'Seul un défi publié peut être programmé.');
    }
    await this.schedule.assign(targetDay, challengeId, now);
  }
}
