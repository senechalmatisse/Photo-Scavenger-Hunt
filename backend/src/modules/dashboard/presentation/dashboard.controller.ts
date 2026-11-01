import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthenticatedUser, CurrentUser } from '../../identity/presentation/security';
import { DashboardView, GetDashboard } from '../application/get-dashboard';

@ApiTags('Tableau de bord')
@ApiBearerAuth()
@Controller('me/dashboard')
export class DashboardController {
  constructor(private readonly getDashboard: GetDashboard) {}

  /** US-010 à US-014 : vue d'ensemble en un seul appel. */
  @Get()
  dashboard(@CurrentUser() user: AuthenticatedUser): Promise<DashboardView> {
    return this.getDashboard.execute(user.id);
  }
}
