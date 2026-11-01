import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { firstValueFrom, map } from 'rxjs';
import { AdminApi, PhotosApi } from '../../core/api/api-clients';
import {
  AdminChallenge,
  AttemptView,
  ChallengeInput,
  Difficulty,
  GeoArea,
  Photo,
  Theme,
  ValidationPreview,
} from '../../core/api/models';
import { errorMessage } from '../../core/http/interceptors';
import { NotificationStore } from '../../core/notifications/notification-store';
import { DIFFICULTY_LABELS, THEME_LABELS } from '../../shared/format/labels';
import { ContactSheet } from '../../shared/ui/contact-sheet';
import { PhotoMap } from '../../shared/ui/photo-map';
import { AttemptFeedback } from '../game/attempt-feedback';
import { DraftError, ValidationMode, buildValidation, draftFromValidation } from './validation-draft';

interface HintControls {
  text: FormControl<string>;
  cost: FormControl<number>;
}

interface ReferenceChoice {
  readonly id: string;
  readonly title: string;
  readonly ownerName: string;
  readonly imageUrl: string;
}

function toIsoOrNull(local: string): string | null {
  return local ? new Date(local).toISOString() : null;
}

function toLocalInput(iso: string | null): string {
  if (!iso) {
    return '';
  }
  const date = new Date(iso);
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function createEditorForm(fb: NonNullableFormBuilder) {
  return fb.group({
    title: ['', [Validators.required, Validators.minLength(3), Validators.maxLength(120)]],
    riddle: ['', [Validators.required, Validators.minLength(10), Validators.maxLength(2000)]],
    difficulty: fb.control<Difficulty>('INTERMEDIATE'),
    theme: fb.control<Theme>('HERITAGE'),
    zoneLabel: [''],
    zoneKind: fb.control<'NONE' | 'BOX' | 'CIRCLE'>('NONE'),
    minLat: fb.control<number | null>(null),
    minLon: fb.control<number | null>(null),
    maxLat: fb.control<number | null>(null),
    maxLon: fb.control<number | null>(null),
    centerLat: fb.control<number | null>(null),
    centerLon: fb.control<number | null>(null),
    radiusKm: fb.control<number | null>(null),
    periodFrom: [''],
    periodTo: [''],
    hints: fb.array<FormGroup<HintControls>>([]),
    rewardPoints: [200, [Validators.required, Validators.min(0), Validators.max(10_000)]],
    rewardXp: [100, [Validators.required, Validators.min(0), Validators.max(10_000)]],
    timeLimitSeconds: fb.control<number | null>(null, [Validators.min(30), Validators.max(7200)]),
    maxAttempts: fb.control<number | null>(null, [Validators.min(1), Validators.max(10)]),
    availableFrom: [''],
    availableTo: [''],
    replayable: [true],
    dailyEligible: [true],
    validationMode: fb.control<ValidationMode>('CRITERIA'),
    tags: [''],
    tagMode: fb.control<'ANY' | 'ALL'>('ANY'),
    useZone: [true],
    usePeriod: [true],
    placeLat: fb.control<number | null>(null),
    placeLon: fb.control<number | null>(null),
    toleranceKm: [2, [Validators.min(0.01), Validators.max(500)]],
    advanced: [''],
    photoQuery: [''],
    previewPhotoId: [''],
  });
}

type EditorValue = ReturnType<ReturnType<typeof createEditorForm>['getRawValue']>;

/** US-080 à US-083 : création et modification d'un défi, photo de référence, critères et test à blanc. */
@Component({
  selector: 'psh-challenge-editor-page',
  imports: [ReactiveFormsModule, RouterLink, ContactSheet, PhotoMap, AttemptFeedback],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './challenge-editor-page.html',
  styleUrl: './challenge-editor-page.scss',
})
export class ChallengeEditorPage {
  /** Paramètre de route `:id` (absent en création). */
  readonly id = input<string>();

  private readonly admin = inject(AdminApi);
  private readonly photos = inject(PhotosApi);
  private readonly router = inject(Router);
  private readonly notifications = inject(NotificationStore);
  private readonly fb = inject(NonNullableFormBuilder);

  protected readonly difficulties = Object.keys(DIFFICULTY_LABELS) as Difficulty[];
  protected readonly difficultyLabels = DIFFICULTY_LABELS;
  protected readonly themes = Object.keys(THEME_LABELS) as Theme[];
  protected readonly themeLabels = THEME_LABELS;

  protected readonly existing = signal<AdminChallenge | null>(null);
  protected readonly reference = signal<ReferenceChoice | null>(null);
  protected readonly photoResults = signal<readonly Photo[]>([]);
  protected readonly preview = signal<ValidationPreview | null>(null);
  protected readonly error = signal<string | null>(null);
  protected readonly saving = signal(false);

  protected readonly form = createEditorForm(this.fb);

  protected readonly hints = this.form.controls.hints;
  protected readonly formValue = toSignal(this.form.valueChanges.pipe(map(() => this.form.getRawValue())), {
    initialValue: this.form.getRawValue(),
  });
  protected readonly zonePreview = computed<GeoArea | null>(() => this.zoneFrom(this.formValue()));
  protected readonly mode = computed(() => this.formValue().validationMode);
  protected readonly isEdit = computed(() => this.existing() !== null);

  constructor() {
    effect(() => {
      const id = this.id();
      if (id) {
        void this.load(id);
      }
    });
  }

  protected addHint(text = '', cost = 20): void {
    this.hints.push(
      this.fb.group({
        text: [text, [Validators.required, Validators.minLength(3), Validators.maxLength(500)]],
        cost: [cost, [Validators.required, Validators.min(0), Validators.max(1000)]],
      }),
    );
  }

  protected removeHint(index: number): void {
    this.hints.removeAt(index);
  }

  protected async searchPhotos(): Promise<void> {
    const text = this.form.controls.photoQuery.value.trim();
    if (!text) {
      return;
    }
    try {
      const page = await firstValueFrom(this.photos.search({ text, perPage: 24 }));
      this.photoResults.set(page.items);
    } catch (error) {
      this.error.set(errorMessage(error));
    }
  }

  protected chooseReference(photo: Photo): void {
    this.reference.set({ id: photo.id, title: photo.title, ownerName: photo.ownerName, imageUrl: photo.imageUrls.thumbnail });
    this.form.controls.previewPhotoId.setValue(photo.id);
    if (photo.location && this.form.controls.placeLat.value === null) {
      this.form.patchValue({ placeLat: photo.location.lat, placeLon: photo.location.lon });
    }
  }

  /** Test « à blanc » des critères en cours d'édition sur une photo quelconque. */
  protected async runPreview(): Promise<void> {
    const photoId = this.form.controls.previewPhotoId.value.trim();
    if (!photoId) {
      return;
    }
    this.error.set(null);
    try {
      this.preview.set(await firstValueFrom(this.admin.preview(this.validation(), photoId)));
    } catch (error) {
      this.preview.set(null);
      this.error.set(errorMessage(error));
    }
  }

  protected previewAsAttempt(preview: ValidationPreview): AttemptView {
    return { photoId: preview.photo.photoId, submittedAt: '', accepted: preview.report.accepted, outcomes: preview.report.outcomes };
  }

  protected async save(publish: boolean): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.error.set('Certains champs sont incomplets : vérifiez les champs signalés.');
      return;
    }
    this.saving.set(true);
    this.error.set(null);
    try {
      const input = this.toInput();
      const current = this.existing();
      let saved = current ? await firstValueFrom(this.admin.update(current.id, input)) : await firstValueFrom(this.admin.create(input));
      if (publish && saved.status !== 'PUBLISHED') {
        saved = await firstValueFrom(this.admin.publish(saved.id));
      }
      this.existing.set(saved);
      this.form.markAsPristine();
      this.notifications.show(publish ? 'Défi enregistré et publié.' : 'Défi enregistré.', 'success');
      if (!current) {
        await this.router.navigate(['/admin/defis', saved.id], { replaceUrl: true });
      }
    } catch (error) {
      this.error.set(errorMessage(error));
    } finally {
      this.saving.set(false);
    }
  }

  private toInput(): ChallengeInput {
    const v = this.form.getRawValue();
    const zone = this.zoneFrom(v);
    if (v.zoneKind !== 'NONE' && !zone) {
      throw new DraftError('Renseignez toutes les coordonnées de la zone, ou choisissez « Aucune zone ».');
    }
    return {
      title: v.title.trim(),
      riddle: v.riddle.trim(),
      difficulty: v.difficulty,
      theme: v.theme,
      zoneLabel: v.zoneLabel.trim() || null,
      zone,
      period: v.periodFrom || v.periodTo ? { from: v.periodFrom || null, to: v.periodTo || null } : null,
      hints: v.hints.map((hint: { text: string; cost: number }) => ({ text: hint.text.trim(), cost: hint.cost })),
      reward: { points: v.rewardPoints, xp: v.rewardXp },
      timeLimitSeconds: v.timeLimitSeconds,
      maxAttempts: v.maxAttempts,
      validation: this.validation(),
      referencePhotoId: this.reference()?.id ?? null,
      availableFrom: toIsoOrNull(v.availableFrom),
      availableTo: toIsoOrNull(v.availableTo),
      replayable: v.replayable,
      dailyEligible: v.dailyEligible,
    };
  }

  private validation() {
    const v = this.form.getRawValue();
    return buildValidation(
      {
        mode: v.validationMode,
        tags: v.tags,
        tagMode: v.tagMode,
        useZone: v.useZone,
        usePeriod: v.usePeriod,
        placeLat: v.placeLat,
        placeLon: v.placeLon,
        toleranceKm: v.toleranceKm,
        advanced: v.advanced,
      },
      {
        referencePhotoId: this.reference()?.id ?? null,
        zone: this.zoneFrom(v),
        period: v.periodFrom || v.periodTo ? { from: v.periodFrom || null, to: v.periodTo || null } : null,
      },
    );
  }

  private zoneFrom(v: EditorValue): GeoArea | null {
    if (v.zoneKind === 'BOX' && v.minLat !== null && v.minLon !== null && v.maxLat !== null && v.maxLon !== null) {
      return { kind: 'BOX', minLat: v.minLat, minLon: v.minLon, maxLat: v.maxLat, maxLon: v.maxLon };
    }
    if (v.zoneKind === 'CIRCLE' && v.centerLat !== null && v.centerLon !== null && v.radiusKm !== null) {
      return { kind: 'CIRCLE', lat: v.centerLat, lon: v.centerLon, radiusKm: v.radiusKm };
    }
    return null;
  }

  private async load(id: string): Promise<void> {
    try {
      const challenge = await firstValueFrom(this.admin.get(id));
      this.existing.set(challenge);
      this.hints.clear();
      challenge.hints.forEach((hint) => this.addHint(hint.text, hint.cost));
      const zone = challenge.zone;
      const draft = draftFromValidation(challenge.validation);
      this.form.patchValue({
        title: challenge.title,
        riddle: challenge.riddle,
        difficulty: challenge.difficulty,
        theme: challenge.theme,
        zoneLabel: challenge.zoneLabel ?? '',
        zoneKind: zone ? zone.kind : 'NONE',
        minLat: zone?.kind === 'BOX' ? zone.minLat : null,
        minLon: zone?.kind === 'BOX' ? zone.minLon : null,
        maxLat: zone?.kind === 'BOX' ? zone.maxLat : null,
        maxLon: zone?.kind === 'BOX' ? zone.maxLon : null,
        centerLat: zone?.kind === 'CIRCLE' ? zone.lat : null,
        centerLon: zone?.kind === 'CIRCLE' ? zone.lon : null,
        radiusKm: zone?.kind === 'CIRCLE' ? zone.radiusKm : null,
        periodFrom: challenge.period?.from ?? '',
        periodTo: challenge.period?.to ?? '',
        rewardPoints: challenge.reward.points,
        rewardXp: challenge.reward.xp,
        timeLimitSeconds: challenge.timeLimitSeconds,
        maxAttempts: challenge.maxAttemptsOverride,
        availableFrom: toLocalInput(challenge.availableFrom),
        availableTo: toLocalInput(challenge.availableTo),
        replayable: challenge.replayable,
        dailyEligible: challenge.dailyEligible,
        validationMode: draft.mode ?? 'ADVANCED',
        tags: draft.tags ?? '',
        tagMode: draft.tagMode ?? 'ANY',
        useZone: draft.useZone ?? true,
        usePeriod: draft.usePeriod ?? true,
        placeLat: draft.placeLat ?? null,
        placeLon: draft.placeLon ?? null,
        toleranceKm: draft.toleranceKm ?? 2,
        advanced: draft.advanced ?? '',
      });
      const reference = challenge.referencePhoto;
      this.reference.set(
        reference ? { id: reference.photoId, title: reference.title, ownerName: reference.ownerName, imageUrl: reference.imageUrl } : null,
      );
      this.form.controls.previewPhotoId.setValue(reference?.photoId ?? '');
      this.form.markAsPristine();
    } catch (error) {
      this.error.set(errorMessage(error));
    }
  }
}
