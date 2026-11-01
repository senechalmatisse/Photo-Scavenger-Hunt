import { ConcurrencyError, ConflictError } from '../../../shared/domain/domain-error';
import { PgDatabase, isUniqueViolation } from '../../../shared/infrastructure/persistence/pg-database';
import { UserRepository } from '../domain/ports';
import { Avatar, User, UserRole } from '../domain/user';

// ---------------------------------------------------------------------------------------------
// PostgreSQL
// ---------------------------------------------------------------------------------------------

const USER_COLUMNS = `id,
  email,
  password_hash,
  display_name,
  avatar,
  role,
  is_guest,
  created_at,
  updated_at,
  last_login_at,
  version`;

/** Lecture d'un compte par identifiant. */
const SELECT_BY_ID = `
SELECT ${USER_COLUMNS}
FROM users
WHERE id = $1`;

/** Lecture d'un compte par adresse e-mail (normalisee en minuscules). */
const SELECT_BY_EMAIL = `
SELECT ${USER_COLUMNS}
FROM users
WHERE email = $1`;

/** Lecture d'un lot de comptes (annuaire des classements). */
const SELECT_BY_IDS = `
SELECT ${USER_COLUMNS}
FROM users
WHERE id = ANY ($1::uuid[])`;

/** Creation d'un compte. */
const INSERT_USER = `
INSERT INTO users
(
  ${USER_COLUMNS}
)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`;

/** Mise a jour d'un compte avec verrouillage optimiste sur la version. */
const UPDATE_USER = `
UPDATE users
SET email = $2,
  password_hash = $3,
  display_name = $4,
  avatar = $5,
  role = $6,
  is_guest = $7,
  updated_at = $8,
  last_login_at = $9,
  version = $10
WHERE id = $1
  AND version = $11`;

/** Suppression d'un compte (droit a l'effacement). */
const DELETE_USER = `
DELETE FROM users
WHERE id = $1`;

interface UserRow {
  id: string;
  email: string | null;
  password_hash: string | null;
  display_name: string;
  avatar: string;
  role: string;
  is_guest: boolean;
  created_at: Date;
  updated_at: Date;
  last_login_at: Date | null;
  version: number;
}

function toDomain(row: UserRow): User {
  return User.restore({
    id: row.id,
    version: row.version,
    email: row.email,
    passwordHash: row.password_hash,
    displayName: row.display_name,
    avatar: row.avatar as Avatar,
    role: row.role as UserRole,
    isGuest: row.is_guest,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastLoginAt: row.last_login_at,
  });
}

export class PgUserRepository implements UserRepository {
  constructor(private readonly db: PgDatabase) {}

  async findById(id: string): Promise<User | null> {
    const [row] = await this.db.query<UserRow>(SELECT_BY_ID, [id]);
    return row ? toDomain(row) : null;
  }

  async findByEmail(email: string): Promise<User | null> {
    const [row] = await this.db.query<UserRow>(SELECT_BY_EMAIL, [email]);
    return row ? toDomain(row) : null;
  }

  async findByIds(ids: readonly string[]): Promise<User[]> {
    return (await this.db.query<UserRow>(SELECT_BY_IDS, [ids])).map(toDomain);
  }

  async save(user: User): Promise<void> {
    const s = user.toSnapshot();
    const next = s.version + 1;
    try {
      if (user.isNew) {
        await this.db.execute(INSERT_USER, [
          s.id, s.email, s.passwordHash, s.displayName, s.avatar, s.role, s.isGuest, s.createdAt, s.updatedAt, s.lastLoginAt, next,
        ]);
      } else {
        const updated = await this.db.execute(UPDATE_USER, [
          s.id, s.email, s.passwordHash, s.displayName, s.avatar, s.role, s.isGuest, s.updatedAt, s.lastLoginAt, next, s.version,
        ]);
        if (updated === 0) {
          throw new ConcurrencyError('Le compte', s.id);
        }
      }
    } catch (error) {
      if (isUniqueViolation(error, 'users_email_uk')) {
        throw new ConflictError('EMAIL_TAKEN', 'Un compte existe déjà avec cette adresse e-mail.');
      }
      throw error;
    }
    user.commitVersion(next);
  }

  async delete(id: string): Promise<void> {
    await this.db.execute(DELETE_USER, [id]);
  }
}
