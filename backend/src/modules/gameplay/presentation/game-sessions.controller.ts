import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post, Query, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, IsUUID, Matches, Max, Min } from 'class-validator';
import type { Response } from 'express';
import { Page, Pages } from '../../../shared/domain/pagination';
import type { Hint } from '../../challenges/public-api';
import { AuthenticatedUser, CurrentUser, Roles } from '../../identity/presentation/security';
import { AbandonSession, PauseSession, ResumeSession, SubmitAnswer, UseHint } from '../application/session-commands';
import { GetChallengeStats, GetGameSession, ListPlayerHistory } from '../application/session-queries';
import { SessionSummaryView, SessionView } from '../application/session-view';
import { StartGameSession, StartedSession } from '../application/start-game-session';
import { ChallengeStats } from '../domain/game-session.repository';
import { Attempt } from '../domain/session-states';

export class StartSessionDto {
  @IsUUID() challengeId!: string;
}

export class SubmitAnswerDto {
  @IsString() @Matches(/^[A-Za-z0-9_-]{1,64}$/) photoId!: string;
}

export class HistoryQueryDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(50) pageSize?: number;
}

@ApiTags('Parties')
@ApiBearerAuth()
@Controller()
export class GameSessionsController {
  constructor(
    private readonly startSession: StartGameSession,
    private readonly getSession: GetGameSession,
    private readonly useHint: UseHint,
    private readonly submitAnswer: SubmitAnswer,
    private readonly pauseSession: PauseSession,
    private readonly resumeSession: ResumeSession,
    private readonly abandonSession: AbandonSession,
    private readonly listHistory: ListPlayerHistory,
  ) {}

  /** US-024 : démarre une partie (201), ou reprend la partie en cours (200). */
  @Post('game-sessions')
  async start(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: StartSessionDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<StartedSession> {
    const started = await this.startSession.execute(user.id, body.challengeId);
    response.status(started.resumed ? HttpStatus.OK : HttpStatus.CREATED);
    return started;
  }

  @Get('game-sessions/:id')
  get(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string): Promise<SessionView> {
    return this.getSession.execute(user.id, id);
  }

  /** US-025 / US-026 : révèle l'indice suivant (son coût sera déduit du score). */
  @HttpCode(HttpStatus.OK)
  @Post('game-sessions/:id/hints')
  async hint(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<{ hint: Hint | null; session: SessionView }> {
    const { result, session } = await this.useHint.execute(user.id, id, undefined);
    return { hint: result, session };
  }

  /** US-027 / US-040 / US-041 : soumet une photo ; la réponse détaille chaque critère. */
  @HttpCode(HttpStatus.OK)
  @Post('game-sessions/:id/attempts')
  async attempt(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: SubmitAnswerDto,
  ): Promise<{ attempt: Attempt | null; session: SessionView }> {
    const { result, session } = await this.submitAnswer.execute(user.id, id, { photoId: body.photoId });
    return { attempt: result, session };
  }

  @HttpCode(HttpStatus.OK)
  @Post('game-sessions/:id/pause')
  async pause(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string): Promise<SessionView> {
    return (await this.pauseSession.execute(user.id, id, undefined)).session;
  }

  @HttpCode(HttpStatus.OK)
  @Post('game-sessions/:id/resume')
  async resume(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string): Promise<SessionView> {
    return (await this.resumeSession.execute(user.id, id, undefined)).session;
  }

  @HttpCode(HttpStatus.OK)
  @Post('game-sessions/:id/abandon')
  async abandon(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string): Promise<SessionView> {
    return (await this.abandonSession.execute(user.id, id, undefined)).session;
  }

  /** US-012 / US-046 : historique des parties du joueur. */
  @Get('me/game-sessions')
  history(@CurrentUser() user: AuthenticatedUser, @Query() query: HistoryQueryDto): Promise<Page<SessionSummaryView>> {
    return this.listHistory.execute(user.id, Pages.request(query.page, query.pageSize));
  }
}

@ApiTags('Administration')
@ApiBearerAuth()
@Roles('ADMIN')
@Controller('admin/challenges')
export class ChallengeStatsController {
  constructor(private readonly getStats: GetChallengeStats) {}

  /** US-085 : statistiques de participation d'un défi. */
  @Get(':id/stats')
  stats(@Param('id', ParseUUIDPipe) id: string): Promise<ChallengeStats & { successRate: number | null }> {
    return this.getStats.execute(id);
  }
}
