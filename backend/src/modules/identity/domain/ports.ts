import { User, UserRole } from './user';

export interface UserRepository {
  findById(id: string): Promise<User | null>;
  findByEmail(email: string): Promise<User | null>;
  findByIds(ids: readonly string[]): Promise<User[]>;
  save(user: User): Promise<void>;
  delete(id: string): Promise<void>;
}

export interface PasswordHasher {
  hash(plain: string): Promise<string>;
  verify(plain: string, hash: string): Promise<boolean>;
}

export interface TokenClaims {
  readonly sub: string;
  readonly role: UserRole;
  readonly guest: boolean;
}

export interface IssuedToken {
  readonly accessToken: string;
  readonly expiresIn: number;
}

export interface TokenIssuer {
  issue(claims: TokenClaims): Promise<IssuedToken>;
  verify(token: string): Promise<TokenClaims>;
}
