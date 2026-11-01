import { thrownBy } from '../../../testing/expectations';
import { GameSession } from './game-session';
import { GameModeKind } from './game-mode';
import { ScoringPolicy, XpPolicy } from './scoring';
import { GameSessionFinished, GameSessionStarted } from './session-events';
import { JudgedAnswer } from './session-states';
import { SessionTerms } from './session-terms';

const rules = { scoring: ScoringPolicy.standard(), xp: new XpPolicy() };
const t0 = new Date('2026-11-02T10:00:00Z');
const at = (seconds: number) => new Date(t0.getTime() + seconds * 1000);

function terms(overrides: Partial<SessionTerms> = {}): SessionTerms {
  return {
    challengeTitle: 'Le gardien des côtes',
    riddle: 'Trouve un phare du littoral français.',
    difficulty: 'INTERMEDIATE',
    theme: 'COAST',
    zoneLabel: 'Littoral français',
    basePoints: 100,
    xpOnSuccess: 100,
    xpOnParticipation: 10,
    hints: [
      { text: 'Indice 1', cost: 20 },
      { text: 'Indice 2', cost: 30 },
    ],
    timeLimitSeconds: null,
    expiresAt: null,
    maxAttempts: 3,
    allowsPause: true,
    isReplay: false,
    isGeographic: true,
    validation: { type: 'EXACT_PHOTO', photoId: 'good' },
    ...overrides,
  };
}

function start(overrides: Partial<SessionTerms> = {}, mode: GameModeKind = 'CATALOG'): GameSession {
  return GameSession.start({ id: 's1', playerId: 'p1', challengeId: 'c1', mode, day: '2026-11-02', terms: terms(overrides), now: t0 });
}

const right = (photoId = 'good'): JudgedAnswer => ({
  photoId,
  report: { accepted: true, outcomes: [{ criterion: 'EXACT_PHOTO', label: 'Photo', satisfied: true, explanation: 'Bravo' }] },
});
const wrong = (photoId: string): JudgedAnswer => ({
  photoId,
  report: { accepted: false, outcomes: [{ criterion: 'EXACT_PHOTO', label: 'Photo', satisfied: false, explanation: 'Raté' }] },
});

describe('GameSession (machine à états du §5.1)', () => {
  it('démarre en cours et publie GameSessionStarted', () => {
    const session = start();
    expect(session.status).toBe('IN_PROGRESS');
    expect(session.pullEvents()).toEqual([expect.any(GameSessionStarted)]);
  });

  it('bonne réponse rapide sans indice : validée avec bonus (barème §5.2)', () => {
    const session = start();
    session.pullEvents();
    session.submitAnswer(right(), at(20), rules);
    expect(session.status).toBe('VALIDATED');
    expect(session.score).toEqual({
      lines: [
        { code: 'BASE', label: 'Bonne réponse', points: 100 },
        { code: 'NO_HINT', label: 'Bonne réponse sans indice', points: 50 },
        { code: 'SPEED', label: 'Réponse en moins de 30 secondes', points: 25 },
      ],
      total: 175,
    });
    expect(session.xpAwarded).toBe(100);
    const [finished] = session.pullEvents() as GameSessionFinished[];
    expect(finished.payload).toMatchObject({ status: 'VALIDATED', points: 175, xp: 100, attempts: 1, elapsedMs: 20_000 });
  });

  it('chaque indice révélé réduit la récompense', () => {
    const session = start();
    expect(session.useHint(at(5), rules)).toEqual({ text: 'Indice 1', cost: 20 });
    expect(session.useHint(at(6), rules)).toEqual({ text: 'Indice 2', cost: 30 });
    expect(thrownBy(() => session.useHint(at(7), rules))).toMatchObject({ code: 'NO_MORE_HINTS' });
    session.submitAnswer(right(), at(60), rules);
    expect(session.score?.lines).toEqual([
      { code: 'BASE', label: 'Bonne réponse', points: 100 },
      { code: 'HINTS', label: '2 indices utilisés', points: -50 },
    ]);
    expect(session.points).toBe(50);
  });

  it('mauvaises réponses : chaque tentative est enregistrée, la dernière fait échouer la partie', () => {
    const session = start();
    session.submitAnswer(wrong('a'), at(10), rules);
    expect(session.status).toBe('IN_PROGRESS');
    expect(session.attemptsLeft).toBe(2);
    expect(thrownBy(() => session.submitAnswer(wrong('a'), at(11), rules))).toMatchObject({ code: 'PHOTO_ALREADY_SUBMITTED' });
    session.submitAnswer(wrong('b'), at(12), rules);
    session.submitAnswer(wrong('c'), at(13), rules);
    expect(session.status).toBe('FAILED');
    expect(session.points).toBe(0);
    expect(session.xpAwarded).toBe(10);
  });

  it('temps écoulé : la partie expire au lieu d’accepter une réponse tardive', () => {
    const session = start({ timeLimitSeconds: 60 });
    expect(session.deadline()?.toISOString()).toBe(at(60).toISOString());
    expect(session.submitAnswer(right(), at(61), rules)).toBeNull();
    expect(session.status).toBe('EXPIRED');
    expect(session.attempts).toHaveLength(0);
    expect(session.xpAwarded).toBe(10);
  });

  it('la pause arrête le chronomètre', () => {
    const session = start({ timeLimitSeconds: 60 });
    session.pause(at(20), rules);
    expect(session.status).toBe('PAUSED');
    expect(session.deadline()).toBeNull();
    expect(session.expireIfOverdue(at(3600), rules)).toBe(false);
    expect(thrownBy(() => session.submitAnswer(right(), at(3600), rules))).toMatchObject({ code: 'SESSION_PAUSED' });
    session.resume(at(1000));
    expect(session.elapsedMs(at(1030))).toBe(50_000);
    session.submitAnswer(right(), at(1030), rules);
    expect(session.status).toBe('VALIDATED');
  });

  it('la pause est refusée si le mode ne l’autorise pas', () => {
    const session = start({ allowsPause: false }, 'DAILY');
    expect(thrownBy(() => session.pause(at(5), rules))).toMatchObject({ code: 'PAUSE_NOT_ALLOWED' });
  });

  it('défi quotidien : bonus quotidien et échéance à minuit', () => {
    const session = start({ allowsPause: false, expiresAt: '2026-11-02T23:00:00.000Z' }, 'DAILY');
    expect(session.deadline()?.toISOString()).toBe('2026-11-02T23:00:00.000Z');
    session.submitAnswer(right(), at(45), rules);
    expect(session.score?.lines.map((line) => line.code)).toEqual(['BASE', 'NO_HINT', 'DAILY']);
    expect(session.points).toBe(200);
  });

  it('partie rejouée : aucun point de classement, XP de participation seulement', () => {
    const session = start({ isReplay: true });
    session.submitAnswer(right(), at(10), rules);
    expect(session.points).toBe(0);
    expect(session.score?.lines.at(-1)).toEqual({ code: 'REPLAY', label: 'Partie rejouée : points non comptés au classement', points: -175 });
    expect(session.xpAwarded).toBe(10);
  });

  it('abandon : partie close sans XP, puis plus aucune action possible', () => {
    const session = start();
    session.abandon(at(5), rules);
    expect(session.status).toBe('ABANDONED');
    expect(session.xpAwarded).toBe(0);
    expect(thrownBy(() => session.useHint(at(6), rules))).toMatchObject({ code: 'SESSION_FINISHED' });
    expect(thrownBy(() => session.resume(at(6)))).toMatchObject({ code: 'SESSION_FINISHED' });
  });

  it('se reconstruit depuis son instantané avec le bon état', () => {
    const session = start({ timeLimitSeconds: 120 });
    session.useHint(at(5), rules);
    session.pause(at(10), rules);
    const restored = GameSession.restore(session.toSnapshot());
    expect(restored.status).toBe('PAUSED');
    expect(restored.revealedHints).toEqual([{ text: 'Indice 1', cost: 20 }]);
    restored.resume(at(100));
    expect(restored.deadline()?.toISOString()).toBe(at(210).toISOString());
  });
});
