import { Body, Controller, Get, HttpCode, HttpStatus, Inject, Param, ParseUUIDPipe, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Page, Pages } from '../../../shared/domain/pagination';
import { Clock } from '../../../shared/domain/ports';
import { CLOCK } from '../../../shared/infrastructure/tokens';
import { AuthenticatedUser, CurrentUser, Roles } from '../../identity/presentation/security';
import { CreateChallenge, DisableChallenge, PublishChallenge, UpdateChallenge } from '../application/challenge-commands';
import {
  BrowseCatalog,
  GetChallengeDetails,
  GetChallengeForAdmin,
  ListChallengesForAdmin,
  PreviewValidation,
  ValidationPreview,
} from '../application/challenge-queries';
import { AdminChallengeView, ChallengeViews, PublicChallengeView } from '../application/challenge-views';
import { GetDailyChallenge, ScheduleDailyChallenge } from '../application/daily-challenge';
import { VerificationReport, VerifyReferencePhotos } from '../application/verify-reference-photos';
import {
  AdminListQueryDto,
  CatalogQueryDto,
  ChallengeInputDto,
  DisableChallengeDto,
  PreviewValidationDto,
  ScheduleDailyDto,
} from './challenges.dto';

@ApiTags('Défis')
@ApiBearerAuth()
@Controller('challenges')
export class ChallengesController {
  constructor(
    private readonly browseCatalog: BrowseCatalog,
    private readonly getDetails: GetChallengeDetails,
    private readonly getDaily: GetDailyChallenge,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  /** US-020 à US-022 : catalogue filtrable par difficulté, thème et région. */
  @Get()
  catalog(@Query() query: CatalogQueryDto): Promise<Page<PublicChallengeView>> {
    return this.browseCatalog.execute(query);
  }

  /** US-011 : défi du jour (le même pour tous les joueurs). */
  @Get('daily')
  async daily(): Promise<{ day: string; challenge: PublicChallengeView } | null> {
    const daily = await this.getDaily.execute();
    return daily ? { day: daily.day, challenge: ChallengeViews.public(daily.challenge, this.clock.now()) } : null;
  }

  /** US-023 : détail d'un défi avant de commencer. */
  @Get(':id')
  details(@Param('id', ParseUUIDPipe) id: string): Promise<PublicChallengeView> {
    return this.getDetails.execute(id);
  }
}

/** Administration des défis (§3.9), réservée au rôle ADMIN. */
@ApiTags('Administration')
@ApiBearerAuth()
@Roles('ADMIN')
@Controller('admin')
export class AdminChallengesController {
  constructor(
    private readonly listChallenges: ListChallengesForAdmin,
    private readonly getChallenge: GetChallengeForAdmin,
    private readonly createChallenge: CreateChallenge,
    private readonly updateChallenge: UpdateChallenge,
    private readonly publishChallenge: PublishChallenge,
    private readonly disableChallenge: DisableChallenge,
    private readonly previewValidation: PreviewValidation,
    private readonly scheduleDaily: ScheduleDailyChallenge,
    private readonly verifyPhotos: VerifyReferencePhotos,
  ) {}

  @Get('challenges')
  list(@Query() query: AdminListQueryDto): Promise<Page<AdminChallengeView>> {
    return this.listChallenges.execute(query.status, Pages.request(query.page, query.pageSize, 100));
  }

  @Get('challenges/:id')
  get(@Param('id', ParseUUIDPipe) id: string): Promise<AdminChallengeView> {
    return this.getChallenge.execute(id);
  }

  /** US-080 à US-082 : création (brouillon), photo de référence, critères. */
  @Post('challenges')
  create(@Body() body: ChallengeInputDto, @CurrentUser() admin: AuthenticatedUser): Promise<AdminChallengeView> {
    return this.createChallenge.execute(body, admin.id);
  }

  @Put('challenges/:id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() body: ChallengeInputDto): Promise<AdminChallengeView> {
    return this.updateChallenge.execute(id, body);
  }

  @HttpCode(HttpStatus.OK)
  @Post('challenges/:id/publish')
  publish(@Param('id', ParseUUIDPipe) id: string): Promise<AdminChallengeView> {
    return this.publishChallenge.execute(id);
  }

  @HttpCode(HttpStatus.OK)
  @Post('challenges/:id/disable')
  disable(@Param('id', ParseUUIDPipe) id: string, @Body() body: DisableChallengeDto): Promise<AdminChallengeView> {
    return this.disableChallenge.execute(id, body.reason);
  }

  /** US-083 : test « à blanc » des critères sur une photo quelconque. */
  @HttpCode(HttpStatus.OK)
  @Post('validation-preview')
  preview(@Body() body: PreviewValidationDto): Promise<ValidationPreview> {
    return this.previewValidation.execute(body.validation, body.photoId);
  }

  /** Programmation du défi d'un jour donné. */
  @HttpCode(HttpStatus.NO_CONTENT)
  @Put('daily-challenges/:day')
  async schedule(@Param('day') day: string, @Body() body: ScheduleDailyDto): Promise<void> {
    await this.scheduleDaily.execute(day, body.challengeId);
  }

  /** US-084 : vérification immédiate de la disponibilité des photos de référence. */
  @HttpCode(HttpStatus.OK)
  @Post('challenges/verify-photos')
  verify(): Promise<VerificationReport> {
    return this.verifyPhotos.execute();
  }
}
