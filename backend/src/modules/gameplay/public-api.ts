/** API publique du module Gameplay (parties). */
export { GameSessionFinished, GameSessionStarted } from './domain/session-events';
export type { SessionFinishedPayload } from './domain/session-events';
export { GetDailySessionStatus, ListPlayerHistory } from './application/session-queries';
export type { SessionSummaryView, SessionView } from './application/session-view';
