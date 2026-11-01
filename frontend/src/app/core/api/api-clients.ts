import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { APP_SETTINGS } from '../settings';
import {
  AdminChallenge,
  AuthResult,
  ChallengeInput,
  ChallengeStats,
  ChallengeStatus,
  DashboardView,
  LeaderboardPeriod,
  LeaderboardView,
  Page,
  Photo,
  PhotoPage,
  PhotoQuery,
  Profile,
  ProgressView,
  PublicChallenge,
  RuleSpec,
  SessionSummary,
  SessionView,
  StartedSession,
  AttemptView,
  Hint,
  ValidationPreview,
} from './models';

/** Paramètres de requête : les valeurs vides ne sont pas transmises. */
function params(values: Readonly<Record<string, string | number | boolean | null | undefined>>): HttpParams {
  let result = new HttpParams();
  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined && value !== null && value !== '') {
      result = result.set(key, String(value));
    }
  }
  return result;
}

/** Base commune : un client par ressource de l'API (principe de responsabilité unique). */
abstract class ApiClient {
  protected readonly http = inject(HttpClient);
  protected readonly base = inject(APP_SETTINGS).apiBaseUrl;
}

@Injectable({ providedIn: 'root' })
export class AuthApi extends ApiClient {
  login(body: { email: string; password: string }): Observable<AuthResult> {
    return this.http.post<AuthResult>(`${this.base}/auth/login`, body);
  }

  register(body: { email: string; password: string; displayName: string }): Observable<AuthResult> {
    return this.http.post<AuthResult>(`${this.base}/auth/register`, body);
  }

  guest(): Observable<AuthResult> {
    return this.http.post<AuthResult>(`${this.base}/auth/guest`, {});
  }

  me(): Observable<Profile> {
    return this.http.get<Profile>(`${this.base}/me`);
  }

  updateMe(changes: { displayName?: string; avatar?: string }): Observable<Profile> {
    return this.http.patch<Profile>(`${this.base}/me`, changes);
  }

  deleteMe(): Observable<void> {
    return this.http.delete<void>(`${this.base}/me`);
  }
}

export interface CatalogQuery {
  difficulty?: string;
  theme?: string;
  bbox?: string;
  page?: number;
  pageSize?: number;
}

@Injectable({ providedIn: 'root' })
export class ChallengesApi extends ApiClient {
  catalog(query: CatalogQuery): Observable<Page<PublicChallenge>> {
    return this.http.get<Page<PublicChallenge>>(`${this.base}/challenges`, { params: params({ ...query }) });
  }

  daily(): Observable<{ day: string; challenge: PublicChallenge } | null> {
    return this.http.get<{ day: string; challenge: PublicChallenge } | null>(`${this.base}/challenges/daily`);
  }

  details(id: string): Observable<PublicChallenge> {
    return this.http.get<PublicChallenge>(`${this.base}/challenges/${id}`);
  }
}

@Injectable({ providedIn: 'root' })
export class GameApi extends ApiClient {
  start(challengeId: string): Observable<StartedSession> {
    return this.http.post<StartedSession>(`${this.base}/game-sessions`, { challengeId });
  }

  get(id: string): Observable<SessionView> {
    return this.http.get<SessionView>(`${this.base}/game-sessions/${id}`);
  }

  hint(id: string): Observable<{ hint: Hint | null; session: SessionView }> {
    return this.http.post<{ hint: Hint | null; session: SessionView }>(`${this.base}/game-sessions/${id}/hints`, {});
  }

  attempt(id: string, photoId: string): Observable<{ attempt: AttemptView | null; session: SessionView }> {
    return this.http.post<{ attempt: AttemptView | null; session: SessionView }>(`${this.base}/game-sessions/${id}/attempts`, { photoId });
  }

  pause(id: string): Observable<SessionView> {
    return this.http.post<SessionView>(`${this.base}/game-sessions/${id}/pause`, {});
  }

  resume(id: string): Observable<SessionView> {
    return this.http.post<SessionView>(`${this.base}/game-sessions/${id}/resume`, {});
  }

  abandon(id: string): Observable<SessionView> {
    return this.http.post<SessionView>(`${this.base}/game-sessions/${id}/abandon`, {});
  }

  history(page: number, pageSize = 10): Observable<Page<SessionSummary>> {
    return this.http.get<Page<SessionSummary>>(`${this.base}/me/game-sessions`, { params: params({ page, pageSize }) });
  }
}

@Injectable({ providedIn: 'root' })
export class PhotosApi extends ApiClient {
  search(query: PhotoQuery): Observable<PhotoPage> {
    return this.http.get<PhotoPage>(`${this.base}/photos`, { params: params({ ...query }) });
  }

  get(id: string): Observable<Photo> {
    return this.http.get<Photo>(`${this.base}/photos/${id}`);
  }
}

@Injectable({ providedIn: 'root' })
export class PlayerApi extends ApiClient {
  progress(): Observable<ProgressView> {
    return this.http.get<ProgressView>(`${this.base}/me/progress`);
  }

  dashboard(): Observable<DashboardView> {
    return this.http.get<DashboardView>(`${this.base}/me/dashboard`);
  }

  leaderboard(period: LeaderboardPeriod, limit = 20): Observable<LeaderboardView> {
    return this.http.get<LeaderboardView>(`${this.base}/leaderboards/${period.toLowerCase()}`, { params: params({ limit }) });
  }
}

@Injectable({ providedIn: 'root' })
export class AdminApi extends ApiClient {
  list(status: ChallengeStatus | null, page: number): Observable<Page<AdminChallenge>> {
    return this.http.get<Page<AdminChallenge>>(`${this.base}/admin/challenges`, { params: params({ status, page, pageSize: 20 }) });
  }

  get(id: string): Observable<AdminChallenge> {
    return this.http.get<AdminChallenge>(`${this.base}/admin/challenges/${id}`);
  }

  create(input: ChallengeInput): Observable<AdminChallenge> {
    return this.http.post<AdminChallenge>(`${this.base}/admin/challenges`, input);
  }

  update(id: string, input: ChallengeInput): Observable<AdminChallenge> {
    return this.http.put<AdminChallenge>(`${this.base}/admin/challenges/${id}`, input);
  }

  publish(id: string): Observable<AdminChallenge> {
    return this.http.post<AdminChallenge>(`${this.base}/admin/challenges/${id}/publish`, {});
  }

  disable(id: string, reason: string): Observable<AdminChallenge> {
    return this.http.post<AdminChallenge>(`${this.base}/admin/challenges/${id}/disable`, { reason });
  }

  preview(validation: RuleSpec, photoId: string): Observable<ValidationPreview> {
    return this.http.post<ValidationPreview>(`${this.base}/admin/validation-preview`, { validation, photoId });
  }

  schedule(day: string, challengeId: string): Observable<void> {
    return this.http.put<void>(`${this.base}/admin/daily-challenges/${day}`, { challengeId });
  }

  stats(id: string): Observable<ChallengeStats> {
    return this.http.get<ChallengeStats>(`${this.base}/admin/challenges/${id}/stats`);
  }

  verifyPhotos(): Observable<{ checked: number; disabled: string[]; interrupted: boolean }> {
    return this.http.post<{ checked: number; disabled: string[]; interrupted: boolean }>(`${this.base}/admin/challenges/verify-photos`, {});
  }
}
