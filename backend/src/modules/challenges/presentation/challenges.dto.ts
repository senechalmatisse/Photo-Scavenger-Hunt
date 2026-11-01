import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsISO8601,
  IsObject,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { DIFFICULTIES, THEMES } from '../domain/challenge';

const DAY = /^\d{4}-\d{2}-\d{2}$/;

export class CatalogQueryDto {
  @IsOptional() @IsIn(DIFFICULTIES) difficulty?: string;
  @IsOptional() @IsIn(THEMES) theme?: string;
  @IsOptional() @IsString() @MaxLength(100) bbox?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(50) pageSize?: number;
}

export class AdminListQueryDto {
  @IsOptional() @IsIn(['DRAFT', 'PUBLISHED', 'DISABLED']) status?: 'DRAFT' | 'PUBLISHED' | 'DISABLED';
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) pageSize?: number;
}

class HintDto {
  @IsString() @Length(3, 500) text!: string;
  @IsInt() @Min(0) @Max(1000) cost!: number;
}

class RewardDto {
  @IsInt() @Min(0) @Max(10_000) points!: number;
  @IsInt() @Min(0) @Max(10_000) xp!: number;
}

class PeriodDto {
  @IsOptional() @Matches(DAY) from?: string | null;
  @IsOptional() @Matches(DAY) to?: string | null;
}

/**
 * Saisie d'un défi par l'administrateur. La zone et les critères de validation sont des
 * structures récursives : leur grammaire est vérifiée par le domaine (messages localisés par chemin).
 */
export class ChallengeInputDto {
  @IsString() @Length(3, 120) title!: string;
  @IsString() @Length(10, 2000) riddle!: string;
  @IsIn(DIFFICULTIES) difficulty!: string;
  @IsIn(THEMES) theme!: string;
  @IsOptional() @IsString() @MaxLength(120) zoneLabel?: string | null;
  @IsOptional() @IsObject() zone?: Record<string, unknown> | null;
  @IsOptional() @ValidateNested() @Type(() => PeriodDto) period?: PeriodDto | null;
  @IsOptional() @IsArray() @ArrayMaxSize(5) @ValidateNested({ each: true }) @Type(() => HintDto) hints?: HintDto[];
  @ValidateNested() @Type(() => RewardDto) reward!: RewardDto;
  @IsOptional() @IsInt() @Min(30) @Max(7200) timeLimitSeconds?: number | null;
  @IsOptional() @IsInt() @Min(1) @Max(10) maxAttempts?: number | null;
  @IsObject() validation!: Record<string, unknown>;
  @IsOptional() @IsString() @Matches(/^[A-Za-z0-9_-]{1,64}$/) referencePhotoId?: string | null;
  @IsOptional() @IsISO8601() availableFrom?: string | null;
  @IsOptional() @IsISO8601() availableTo?: string | null;
  @IsOptional() @IsBoolean() replayable?: boolean;
  @IsOptional() @IsBoolean() dailyEligible?: boolean;
}

export class DisableChallengeDto {
  @IsString() @Length(3, 500) reason!: string;
}

export class PreviewValidationDto {
  @IsObject() validation!: Record<string, unknown>;
  @IsString() @Matches(/^[A-Za-z0-9_-]{1,64}$/) photoId!: string;
}

export class ScheduleDailyDto {
  @IsString() challengeId!: string;
}
