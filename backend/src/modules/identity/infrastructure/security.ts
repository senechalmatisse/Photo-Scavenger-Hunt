import { randomBytes, scrypt, ScryptOptions, timingSafeEqual } from 'node:crypto';
import type { JwtService } from '@nestjs/jwt';
import { UnauthorizedError } from '../../../shared/domain/domain-error';
import { IssuedToken, PasswordHasher, TokenClaims, TokenIssuer } from '../domain/ports';
import { UserRole } from '../domain/user';

function deriveKey(password: string, salt: Buffer, keyLength: number, options: ScryptOptions): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, keyLength, options, (error, key) => (error ? reject(error) : resolve(key)));
  });
}

/**
 * Hachage scrypt (paramètres OWASP : N = 2^17, r = 8, p = 1) sans dépendance native.
 * Format auto-descriptif `scrypt$log2N$r$p$sel$empreinte` : les paramètres peuvent évoluer
 * sans invalider les empreintes existantes.
 */
export class ScryptPasswordHasher implements PasswordHasher {
  private static readonly KEY_LENGTH = 64;

  constructor(private readonly cost = 17) {}

  async hash(plain: string): Promise<string> {
    const salt = randomBytes(16);
    const options = ScryptPasswordHasher.options(this.cost, 8, 1);
    const key = await deriveKey(plain, salt, ScryptPasswordHasher.KEY_LENGTH, options);
    return ['scrypt', this.cost, 8, 1, salt.toString('base64'), key.toString('base64')].join('$');
  }

  async verify(plain: string, stored: string): Promise<boolean> {
    const [algorithm, cost, blockSize, parallelization, salt, expected] = stored.split('$');
    if (algorithm !== 'scrypt' || !salt || !expected) {
      return false;
    }
    const expectedKey = Buffer.from(expected, 'base64');
    const options = ScryptPasswordHasher.options(Number(cost), Number(blockSize), Number(parallelization));
    const key = await deriveKey(plain, Buffer.from(salt, 'base64'), expectedKey.length, options);
    return key.length === expectedKey.length && timingSafeEqual(key, expectedKey);
  }

  private static options(cost: number, blockSize: number, parallelization: number): ScryptOptions {
    const N = 2 ** cost;
    return { N, r: blockSize, p: parallelization, maxmem: 256 * N * blockSize + 1024 * 1024 };
  }
}

interface JwtPayload {
  readonly sub: string;
  readonly role: UserRole;
  readonly guest: boolean;
}

/** Jetons d'accès JWT signés HS256 (secret de configuration, durée de vie courte). */
export class JwtTokenIssuer implements TokenIssuer {
  constructor(
    private readonly jwt: JwtService,
    private readonly secret: string,
    private readonly ttlSeconds: number,
  ) {}

  async issue(claims: TokenClaims): Promise<IssuedToken> {
    const payload: JwtPayload = { sub: claims.sub, role: claims.role, guest: claims.guest };
    const accessToken = await this.jwt.signAsync(payload, {
      secret: this.secret,
      expiresIn: this.ttlSeconds,
      algorithm: 'HS256',
    });
    return { accessToken, expiresIn: this.ttlSeconds };
  }

  async verify(token: string): Promise<TokenClaims> {
    try {
      const payload = await this.jwt.verifyAsync<JwtPayload>(token, { secret: this.secret, algorithms: ['HS256'] });
      return { sub: payload.sub, role: payload.role, guest: payload.guest };
    } catch {
      throw new UnauthorizedError('INVALID_TOKEN', 'Session expirée ou invalide : reconnectez-vous.');
    }
  }
}
