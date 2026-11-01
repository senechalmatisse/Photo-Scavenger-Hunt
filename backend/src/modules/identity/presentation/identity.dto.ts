import { IsEmail, IsIn, IsOptional, IsString, Length, MaxLength } from 'class-validator';
import { AVATARS } from '../domain/user';

/** Validation de forme à l'entrée de l'API ; les règles métier restent dans le domaine. */
export class RegisterDto {
  @IsEmail()
  @MaxLength(254)
  email!: string;

  @IsString()
  @Length(10, 128)
  password!: string;

  @IsString()
  @Length(3, 30)
  displayName!: string;
}

export class LoginDto {
  @IsString()
  @MaxLength(254)
  email!: string;

  @IsString()
  @MaxLength(128)
  password!: string;
}

export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  @Length(3, 30)
  displayName?: string;

  @IsOptional()
  @IsIn(AVATARS)
  avatar?: string;
}
