import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthenticatedUser, CurrentUser } from '../../identity/presentation/security';
import { GetPlayerProgress, ProgressView } from '../application/progression-use-cases';

@ApiTags('Progression')
@ApiBearerAuth()
@Controller('me/progress')
export class ProgressController {
  constructor(private readonly getProgress: GetPlayerProgress) {}

  /** US-013, US-053 à US-055 : niveau, XP, statistiques, série et badges. */
  @Get()
  progress(@CurrentUser() user: AuthenticatedUser): Promise<ProgressView> {
    return this.getProgress.execute(user.id);
  }
}
