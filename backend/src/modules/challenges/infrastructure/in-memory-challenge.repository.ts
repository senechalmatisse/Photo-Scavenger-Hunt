import { LocalDate } from '../../../shared/domain/local-date';
import { Page, PageRequest, Pages } from '../../../shared/domain/pagination';
import { InMemorySnapshotStore } from '../../../shared/infrastructure/persistence/in-memory-store';
import { Challenge, ChallengeSnapshot, ChallengeStatus } from '../domain/challenge';
import { CatalogFilter, ChallengeRepository, DailyChallengeSchedule } from '../domain/challenge.repository';
import { ValidationRuleFactory } from '../domain/validation/validation-rule-factory';

export class InMemoryChallengeRepository implements ChallengeRepository, DailyChallengeSchedule {
  private readonly store = new InMemorySnapshotStore<ChallengeSnapshot>('Le défi');
  private readonly daily = new Map<LocalDate, string>();

  constructor(private readonly rules: ValidationRuleFactory) {}

  async findById(id: string): Promise<Challenge | null> {
    const snapshot = this.store.get(id);
    return snapshot ? Challenge.restore(snapshot, this.rules) : null;
  }

  async save(challenge: Challenge): Promise<void> {
    challenge.commitVersion(this.store.put(challenge.id, challenge.toSnapshot()));
  }

  async findPlayable(filter: CatalogFilter, at: Date, page: PageRequest): Promise<Page<Challenge>> {
    const matching = this.restoreAll()
      .filter((challenge) => challenge.isPlayableAt(at))
      .filter((challenge) => !filter.difficulty || challenge.content.difficulty === filter.difficulty)
      .filter((challenge) => !filter.theme || challenge.content.theme === filter.theme)
      .filter((challenge) => !filter.area || (challenge.content.zone?.intersects(filter.area) ?? false))
      .sort((a, b) => (b.publishedAt?.getTime() ?? 0) - (a.publishedAt?.getTime() ?? 0) || a.id.localeCompare(b.id));
    return Pages.slice(matching, page);
  }

  async findForAdmin(status: ChallengeStatus | undefined, page: PageRequest): Promise<Page<Challenge>> {
    const matching = this.restoreAll()
      .filter((challenge) => !status || challenge.status === status)
      .sort((a, b) => b.toSnapshot().updatedAt.getTime() - a.toSnapshot().updatedAt.getTime());
    return Pages.slice(matching, page);
  }

  async findDailyCandidates(at: Date): Promise<Challenge[]> {
    return this.restoreAll().filter((challenge) => challenge.isPlayableAt(at) && challenge.content.dailyEligible);
  }

  async findPublished(): Promise<Challenge[]> {
    return this.restoreAll().filter((challenge) => challenge.status === 'PUBLISHED');
  }

  async challengeIdFor(day: LocalDate): Promise<string | null> {
    return this.daily.get(day) ?? null;
  }

  async assignIfAbsent(day: LocalDate, challengeId: string): Promise<void> {
    if (!this.daily.has(day)) {
      this.daily.set(day, challengeId);
    }
  }

  async assign(day: LocalDate, challengeId: string): Promise<void> {
    this.daily.set(day, challengeId);
  }

  async challengeIdsBetween(from: LocalDate, to: LocalDate): Promise<string[]> {
    return [...this.daily.entries()].filter(([day]) => day >= from && day <= to).map(([, id]) => id);
  }

  private restoreAll(): Challenge[] {
    return this.store.all().map((snapshot) => Challenge.restore(snapshot, this.rules));
  }
}
