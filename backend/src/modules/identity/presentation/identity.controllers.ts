import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import {
  AuthResult,
  DeleteAccount,
  GetProfile,
  Login,
  ProfileView,
  RegisterUser,
  StartGuestSession,
  UpdateProfile,
} from '../application/identity-use-cases';
import { LoginDto, RegisterDto, UpdateProfileDto } from './identity.dto';
import { AuthenticatedUser, CurrentUser, OptionalUser, Public } from './security';

/** Limite stricte sur l'authentification (protection contre la force brute). */
const AUTH_THROTTLE = { default: { limit: 10, ttl: 60_000 } };

@ApiTags('Authentification')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly registerUser: RegisterUser,
    private readonly login: Login,
    private readonly startGuest: StartGuestSession,
  ) {}

  /** US-001 : inscription ; un invité authentifié est converti en compte (progression conservée). */
  @Public()
  @Throttle(AUTH_THROTTLE)
  @Post('register')
  register(@Body() body: RegisterDto, @OptionalUser() user?: AuthenticatedUser): Promise<AuthResult> {
    return this.registerUser.execute(body, user?.guest ? user.id : undefined);
  }

  /** US-002 : connexion. */
  @Public()
  @Throttle(AUTH_THROTTLE)
  @HttpCode(HttpStatus.OK)
  @Post('login')
  signIn(@Body() body: LoginDto): Promise<AuthResult> {
    return this.login.execute(body);
  }

  /** US-006 : mode invité. */
  @Public()
  @Throttle(AUTH_THROTTLE)
  @Post('guest')
  guest(): Promise<AuthResult> {
    return this.startGuest.execute();
  }
}

@ApiTags('Profil')
@ApiBearerAuth()
@Controller('me')
export class MeController {
  constructor(
    private readonly getProfile: GetProfile,
    private readonly updateProfile: UpdateProfile,
    private readonly deleteAccount: DeleteAccount,
  ) {}

  @Get()
  profile(@CurrentUser() user: AuthenticatedUser): Promise<ProfileView> {
    return this.getProfile.execute(user.id);
  }

  /** US-003 : pseudonyme et avatar. */
  @Patch()
  update(@CurrentUser() user: AuthenticatedUser, @Body() body: UpdateProfileDto): Promise<ProfileView> {
    return this.updateProfile.execute(user.id, body);
  }

  /** US-005 : suppression du compte et de toutes les données associées. */
  @Delete()
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@CurrentUser() user: AuthenticatedUser): Promise<void> {
    await this.deleteAccount.execute(user.id);
  }
}
