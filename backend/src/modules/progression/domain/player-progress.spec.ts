import { LocalDates } from '../../../shared/domain/local-date';
import { AchievementCatalog } from './achievements';
import { QuadraticLevelCurve, levelProgress } from './level-curve';
import { AchievementUnlocked, LevelReached, PlayerProgress, ProgressionRules, SessionOutcome } from './player-progress';

const rules: ProgressionRules = {
  levelCurve: new QuadraticLevelCurve(50),
  achievements: new AchievementCatalog(),
  streak: { everyDays: 7, bonusXp: 200 },
};

let sequence = 0;
function outcome(overrides: Partial<SessionOutcome> = {}): SessionOutcome {
  sequence += 1;
  return {
    sessionId: `s${sequence}`,
    mode: 'CATALOG',
    day: '2026-11-02',
    status: 'VALIDATED',
    points: 175,
    xp: 100,
    hintsUsed: 0,
    attempts: 1,
    isGeographic: true,
    finishedAt: new Date('2026-11-02T10:00:00Z'),
    ...overrides,
  };
}

describe('QuadraticLevelCurve', () => {
  const curve = new QuadraticLevelCurve(50);

  it('associe l’XP cumulée au niveau', () => {
    expect([0, 99, 100, 299, 300, 1000, 4500].map((xp) => curve.levelFor(xp))).toEqual([1, 1, 2, 2, 3, 5, 10]);
  });

  it('expose la progression vers le niveau suivant', () => {
    expect(levelProgress(curve, 200)).toEqual({ level: 2, xp: 200, currentLevelXp: 100, nextLevelXp: 300, ratio: 0.5 });
  });
});

describe('PlayerProgress', () => {
  it('cumule XP, points et statistiques, et signale le passage de niveau', () => {
    const progress = PlayerProgress.start('p1', new Date());
    const delta = progress.recordSession(outcome({ hintsUsed: 1, attempts: 2 }), rules);
    expect(delta).toMatchObject({ xpGained: 100, pointsGained: 175, levelReached: 2 });
    expect(progress.stats).toMatchObject({ missionsPlayed: 1, missionsWon: 1, missionsWonWithoutHint: 0, hintsUsed: 1, photosSubmitted: 2 });
    expect(progress.pullEvents()).toEqual([expect.any(LevelReached)]);
  });

  it('une partie abandonnée ne compte ni comme mission jouée ni dans la série', () => {
    const progress = PlayerProgress.start('p1', new Date());
    progress.recordSession(outcome({ status: 'ABANDONED', mode: 'DAILY', points: 0, xp: 0 }), rules);
    expect(progress.stats.missionsPlayed).toBe(0);
    expect(progress.effectiveStreak('2026-11-02')).toBe(0);
  });

  it('série de 7 défis quotidiens : bonus de 200 XP et badge Régulier', () => {
    const progress = PlayerProgress.start('p1', new Date());
    let last = null;
    for (let day = 0; day < 7; day += 1) {
      last = progress.recordSession(outcome({ mode: 'DAILY', day: LocalDates.addDays('2026-11-01', day), points: 0, xp: 10 }), rules);
    }
    expect(last).toMatchObject({ streakBonusXp: 200 });
    expect(progress.bestStreak).toBe(7);
    expect(progress.achievements.map((achievement) => achievement.code)).toContain('REGULAR');
    expect(progress.pullEvents().some((event) => event instanceof AchievementUnlocked)).toBe(true);
  });

  it('un jour manqué remet la série à un', () => {
    const progress = PlayerProgress.start('p1', new Date());
    progress.recordSession(outcome({ mode: 'DAILY', day: '2026-11-01' }), rules);
    progress.recordSession(outcome({ mode: 'DAILY', day: '2026-11-02' }), rules);
    expect(progress.effectiveStreak('2026-11-03')).toBe(2);
    expect(progress.effectiveStreak('2026-11-04')).toBe(0);
    progress.recordSession(outcome({ mode: 'DAILY', day: '2026-11-05' }), rules);
    expect(progress.effectiveStreak('2026-11-05')).toBe(1);
    expect(progress.bestStreak).toBe(2);
  });

  it('débloque le badge Éclair après 5 victoires sans indice', () => {
    const progress = PlayerProgress.start('p1', new Date());
    for (let index = 0; index < 4; index += 1) {
      progress.recordSession(outcome(), rules);
    }
    expect(progress.achievements).toHaveLength(0);
    const delta = progress.recordSession(outcome(), rules);
    expect(delta.unlocked.map((definition) => definition.code)).toEqual(['LIGHTNING']);
  });
});
