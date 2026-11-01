import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
  SetMetadata,
  UnauthorizedException,
  createParamDecorator,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { TokenIssuer } from '../domain/ports';
import { UserRole } from '../domain/user';
import { TOKEN_ISSUER } from '../identity.tokens';

export interface AuthenticatedUser {
  readonly id: string;
  readonly role: UserRole;
  readonly guest: boolean;
}

type AuthenticatedRequest = Request & { user?: AuthenticatedUser };

const IS_PUBLIC = 'psh:isPublic';
const ROLES = 'psh:roles';

/** Route accessible sans jeton (un jeton valide éventuel est tout de même lu). */
export const Public = () => SetMetadata(IS_PUBLIC, true);

/** Restreint une route (ou un contrôleur) à certains rôles. */
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES, roles);

export const CurrentUser = createParamDecorator((_data: unknown, context: ExecutionContext): AuthenticatedUser => {
  const user = context.switchToHttp().getRequest<AuthenticatedRequest>().user;
  if (!user) {
    throw new UnauthorizedException('Authentification requise.');
  }
  return user;
});

/** Utilisateur courant facultatif (routes publiques, ex. conversion d'un invité). */
export const OptionalUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthenticatedUser | undefined =>
    context.switchToHttp().getRequest<AuthenticatedRequest>().user,
);

/**
 * Garde globale « sécurisé par défaut » : toute route exige un jeton Bearer valide,
 * sauf celles marquées @Public().
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Inject(TOKEN_ISSUER) private readonly tokens: TokenIssuer,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [context.getHandler(), context.getClass()]);
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const header = request.header('authorization') ?? '';
    const token = header.startsWith('Bearer ') ? header.slice(7).trim() : null;

    if (token) {
      try {
        const claims = await this.tokens.verify(token);
        request.user = { id: claims.sub, role: claims.role, guest: claims.guest };
      } catch (error) {
        if (!isPublic) {
          throw error;
        }
      }
    }
    if (!isPublic && !request.user) {
      throw new UnauthorizedException('Authentification requise.');
    }
    return true;
  }
}

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const roles = this.reflector.getAllAndOverride<UserRole[] | undefined>(ROLES, [context.getHandler(), context.getClass()]);
    if (!roles || roles.length === 0) {
      return true;
    }
    const user = context.switchToHttp().getRequest<AuthenticatedRequest>().user;
    if (!user || !roles.includes(user.role)) {
      throw new ForbiddenException('Accès réservé.');
    }
    return true;
  }
}
