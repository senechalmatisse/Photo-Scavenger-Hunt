import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';
import { AuthenticatedUser, CurrentUser } from '../../identity/presentation/security';
import { GetLeaderboard, LeaderboardView } from '../application/leaderboard-use-cases';
import { LeaderboardKeys } from '../domain/leaderboard';

export class LeaderboardQueryDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit?: number;
}

@ApiTags('Classements')
@ApiBearerAuth()
@Controller('leaderboards')
export class LeaderboardsController {
  constructor(private readonly getLeaderboard: GetLeaderboard) {}

  /** US-060, US-061, US-063 : `/leaderboards/all_time`, `/weekly` ou `/monthly`. */
  @Get(':period')
  board(
    @CurrentUser() user: AuthenticatedUser,
    @Param('period') period: string,
    @Query() query: LeaderboardQueryDto,
  ): Promise<LeaderboardView> {
    return this.getLeaderboard.execute(LeaderboardKeys.parsePeriod(period), user.id, query.limit ?? 20);
  }
}
