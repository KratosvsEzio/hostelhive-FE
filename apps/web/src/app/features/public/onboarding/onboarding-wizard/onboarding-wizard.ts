import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  ElementRef,
  inject,
  linkedSignal,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { DecimalPipe } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { catchError, of } from 'rxjs';
import { ApiError, AttachmentLabel, HostelInput, iconForSlug, OfferCategory } from '@hostelhive/data-access';
import { HostelsApi, ImageUploadService, OffersApi } from '@services';
import { AuthService } from '@app/core/auth/auth.service';
import {
  ACCEPT_ATTR,
  BadgeVariant,
  Button,
  Card,
  ConfirmModal,
  Dropdown,
  DropdownOption,
  Input,
  MAX_PHOTOS,
  PhoneInput,
  PhotoGrid,
  PhotoGridPhoto,
  RichText,
  imageFormatLabel,
} from '@hostelhive/ui';
import {
  LocationPicker,
  PickedLocation,
  PlaceSearchField,
} from '@hostelhive/maps';
import { screenPickedPhotos, screenReplacementPhoto } from '@util/photo-picker';
import {
  clampCapacity,
  displayLabelFor,
  DORMITORY_DEFAULT_CAPACITY,
  fixedCapacityFor,
  ROOM_TYPES,
} from '@util/room-types';

type GenderType = 'boys' | 'girls' | 'co-living';

interface MediaItem {
  id: number;
  label: string;
  primary: boolean;
  tint?: string; // placeholder colour for legacy seed tiles; real photos use `url` instead
  url?: string; // blob: preview while the session lasts, then the CDN url once uploaded
  /** Short format name, shown when the browser can't decode the local preview. */
  format?: string;
  /** Set once the file has landed on S3 — this is what links the photo to the hostel. */
  attachmentId?: string;
}

/** The subset of a MediaItem that survives a reload — never a File, a data URL or a blob: URL. */
interface PersistedMediaItem {
  id: number;
  url: string;
  attachmentId: string;
  primary: boolean;
  label: string;
}

interface Room {
  id: number;
  type: string;
  capacity: number;
  price: number;
}

interface OnboardingDraft {
  draftId: number | null;
  step: number;
  name: string;
  city: string;
  gender: GenderType;
  description: string;
  lat: number;
  lng: number;
  area: string;
  province: string;
  country: string;
  street: string;
  landmarks: string;
  media: PersistedMediaItem[];
  /** Attachment ids already linked server-side — never resent, since the API appends. */
  linkedAttachmentIds: string[];
  amenities: string[];
  rooms: Room[];
  newRoomType: string;
  newRoomCapacity: number;
  newRoomPrice: number;
  publishOnApproval: boolean;
  email: string;
  phone: string;
}

const DRAFT_KEY = 'hh:onboarding:draft';

/** A saved photo is only worth restoring when it has a live url and the id that links it. */
function isRestorableMedia(m: Partial<PersistedMediaItem>): m is PersistedMediaItem {
  return (
    typeof m?.id === 'number' &&
    typeof m.url === 'string' &&
    !!m.url &&
    !m.url.startsWith('blob:') &&
    typeof m.attachmentId === 'string' &&
    !!m.attachmentId &&
    typeof m.primary === 'boolean' &&
    typeof m.label === 'string'
  );
}

const CATEGORY_ICONS: Record<string, string> = {
  'heating and cooling': 'ti-temperature',
  'bedroom and laundry': 'ti-bed',
  'clothing storage': 'ti-hanger',
  services: 'ti-bell',
  'kitchen and dinning': 'ti-tools-kitchen-2',
  'kitchen and dining': 'ti-tools-kitchen-2',
  'parking and facilities': 'ti-parking',
  'bath room': 'ti-bath',
  bathroom: 'ti-bath',
  'internet and study/work space': 'ti-wifi',
  'property safety': 'ti-shield-check',
  entertainment: 'ti-device-tv',
};

/**
 * Host onboarding wizard (mockup 11). A 5-step wizard driven by `hh-stepper`
 * and a `step` signal: Basic info, Location, Media, Rooms, Payment & review.
 * All form state lives in signals; a best-effort draft is persisted to
 * localStorage on every change (SSR-guarded).
 */
@Component({
  selector: 'hh-onboarding-wizard',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DecimalPipe,
    Button,
    Card,
    ConfirmModal,
    Dropdown,
    Input,
    PhoneInput,
    LocationPicker,
    PhotoGrid,
    PlaceSearchField,
    RichText,
    RouterLink,
  ],
  templateUrl: './onboarding-wizard.html',
  styleUrl: './onboarding-wizard.scss',
})
export class OnboardingWizard {
  protected readonly stepLabels = [
    'Basic info',
    'Location',
    'Media',
    'Rooms',
    'Amenities',
    'Payment',
  ];
  protected readonly lastStep = this.stepLabels.length - 1;
  protected readonly roomTypes: readonly string[] = ROOM_TYPES;
  protected readonly genderOptions: DropdownOption[] = [
    { value: 'boys', label: 'Boys' },
    { value: 'girls', label: 'Girls' },
    { value: 'co-living', label: 'Co-living' },
  ];
  /** Google Places autocomplete restricted to cities, for the Basic-info City field. */
  protected readonly cityTypes = ['(cities)'];
  protected readonly acceptAttr = ACCEPT_ATTR;

  // --- Wizard position ---
  protected readonly step = signal(0);

  // --- Step 1: basic info ---
  protected readonly name = signal('');
  protected readonly city = signal('Karachi');
  protected readonly accommodationType = signal<GenderType>('boys');
  protected readonly description = signal('');

  // --- Step 2: location ---
  protected readonly lat = signal(24.8071);
  protected readonly lng = signal(67.0732);
  protected readonly area = signal('DHA Phase 6');
  protected readonly province = signal('Sindh');
  protected readonly country = signal('Pakistan');
  protected readonly street = signal('Street 12, House 4-C, DHA Phase 6');
  protected readonly landmarks = signal('');

  // --- Step 3: media ---
  private mediaId = 0;
  protected readonly media = signal<MediaItem[]>([]);
  private readonly fileInput = viewChild.required<ElementRef<HTMLInputElement>>('fileInput');
  private readonly replaceTarget = signal<MediaItem | null>(null);
  protected readonly uploadError = signal<string | null>(null);
  /** Per-photo label selection: photo id (string) → label id as string (for dropdown binding). */
  protected readonly photoLabelMap = signal<Map<string, string | null>>(new Map());
  /** Card id → upload progress 0–100 while its file is still in flight. */
  private readonly uploadingPhotos = signal<Map<string, number>>(new Map());
  protected readonly uploading = computed(() => this.uploadingPhotos().size > 0);
  protected readonly atPhotoLimit = computed(() => this.media().length >= MAX_PHOTOS);
  /** Attachment ids the backend has already linked — the API appends, so they must not be resent. */
  private readonly linkedAttachmentIds = signal<Set<string>>(new Set());
  private readonly imageUpload = inject(ImageUploadService);

  private readonly hostFormOptions = toSignal(
    inject(HostelsApi).formOptions().pipe(
      catchError(() => of({ genderTypes: [], propertyTypes: [], attachmentLabels: [] as AttachmentLabel[] })),
    ),
    { initialValue: { genderTypes: [], propertyTypes: [], attachmentLabels: [] as AttachmentLabel[] } },
  );

  protected readonly labelOptions = computed<DropdownOption[]>(() =>
    this.hostFormOptions().attachmentLabels.map((l) => ({
      value: String(l.id),
      label: l.name,
    })),
  );

  protected readonly photoGridItems = computed<PhotoGridPhoto[]>(() =>
    this.media()
      .filter((m) => !!m.url)
      .map((m) => ({
        id: String(m.id),
        url: m.url!,
        primary: m.primary,
        format: m.format,
        uploadProgress: this.uploadingPhotos().get(String(m.id)),
      })),
  );

  protected findMedia(id: string): MediaItem | undefined {
    return this.media().find((m) => String(m.id) === id);
  }

  protected addPhoto(): void {
    this.replaceTarget.set(null);
    this.fileInput().nativeElement.click();
  }

  protected replaceMedia(item: MediaItem): void {
    this.replaceTarget.set(item);
    this.fileInput().nativeElement.click();
  }

  protected setPhotoLabel(id: string, v: string | string[] | null): void {
    this.photoLabelMap.update((m) =>
      new Map(m).set(id, typeof v === 'string' ? v : null),
    );
  }

  // --- Step 4: rooms ---
  private roomId = 0;
  protected readonly rooms = signal<Room[]>([
    { id: ++this.roomId, type: 'Double sharing', capacity: 2, price: 14000 },
  ]);
  protected readonly newRoomType = signal(this.roomTypes[0]);
  protected readonly newRoomCapacity = linkedSignal<string, number>({
    source: () => this.newRoomType(),
    computation: (type, prev) => {
      const fixed = fixedCapacityFor(type);
      if (fixed !== null) return fixed;
      // A manual value only survives when the previous type was also variable.
      return prev && fixedCapacityFor(prev.source) === null
        ? prev.value
        : DORMITORY_DEFAULT_CAPACITY;
    },
  });
  protected readonly capacityFixed = computed(() => fixedCapacityFor(this.newRoomType()) !== null);
  protected readonly newRoomPrice = signal(12000);
  protected readonly roomFormError = signal<string | null>(null);

  // Types already added stay in the list but greyed out, so the picker never shifts under the host.
  protected readonly roomTypeOptions = computed<DropdownOption[]>(() => {
    const used = new Set(this.rooms().map((r) => r.type));
    return this.roomTypes.map((t) => ({
      value: t,
      label: displayLabelFor(t),
      disabled: used.has(t),
      disabledTooltip: used.has(t) ? 'Already added' : undefined,
    }));
  });

  /** Seeker-facing label for a stored room-type value (used by the added-rooms list). */
  protected roomTypeLabel(name: string): string {
    return displayLabelFor(name);
  }

  protected readonly allRoomTypesUsed = computed(() =>
    this.roomTypeOptions().every((o) => o.disabled),
  );

  // --- API draft persistence ---
  private readonly hostelsApi = inject(HostelsApi);
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  protected readonly draftId = signal<number | null>(null);
  protected readonly draftSaving = signal(false);
  protected readonly draftSaved = signal(false);
  protected readonly draftError = signal(false);

  protected readonly exitLabel = computed(() =>
    this.draftSaving()
      ? 'Saving…'
      : this.uploading()
        ? 'Uploading photos…'
        : 'Save & exit',
  );

  // --- Step 5: amenities (dynamic catalogue from GET /api/offer_categories) ---
  private readonly offersApi = inject(OffersApi);
  private readonly destroyRef = inject(DestroyRef);
  protected readonly offerCategories = signal<OfferCategory[]>([]);
  protected readonly amenitiesLoading = signal(false);
  protected readonly amenitiesError = signal(false);
  /** Selected offer ids — the amenities the host provides. */
  protected readonly selectedAmenities = signal<string[]>([]);

  // --- Contact info (required by backend) ---
  protected readonly email = signal('');
  protected readonly phone = signal('');

  // --- Submit error state ---
  protected readonly apiErrors = signal<string[]>([]);

  // --- Validation ---
  protected readonly locationPinned = signal(false);
  protected readonly showValidation = signal(false);
  protected readonly showValidationModal = signal(false);
  protected readonly showLeaveModal = signal(false);

  /** The rich-text description with its markup stripped, for emptiness checks. */
  private readonly descriptionText = computed(() =>
    this.description().replace(/<[^>]*>/g, '').trim(),
  );

  protected readonly fieldErrors = computed<Partial<Record<string, string>>>(() => {
    const e: Record<string, string> = {};
    if (!this.name().trim()) e['name'] = 'Hostel name is required';
    if (!this.city().trim()) e['city'] = 'City is required';
    const emailVal = this.email().trim();
    if (!emailVal) e['email'] = 'Contact email is required';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailVal)) e['email'] = 'Enter a valid email address';
    if (!this.phone().trim()) e['phone'] = 'Primary phone is required';
    if (!this.descriptionText()) e['description'] = 'Description is required';
    if (!this.media().length) e['photos'] = 'At least one photo is required';
    if (!this.rooms().length) e['rooms'] = 'At least one room type is required';
    if (!this.locationPinned()) e['location'] = 'Pin your hostel location on the map';
    return e;
  });

  protected readonly isFormValid = computed(() => Object.keys(this.fieldErrors()).length === 0);

  protected objectEntries = Object.entries as (o: Partial<Record<string, string>>) => [string, string][];

  // --- Topbar save status ---
  /** Whether the host has entered anything worth restoring — the seeded defaults don't count. */
  protected readonly deviceDraftPresent = computed(
    () =>
      !!this.name().trim() ||
      !!this.descriptionText() ||
      !!this.email().trim() ||
      !!this.phone().trim() ||
      !!this.landmarks().trim() ||
      this.media().length > 0 ||
      this.selectedAmenities().length > 0 ||
      this.locationPinned(),
  );

  protected readonly showDraftStatus = computed(
    () =>
      this.draftSaving() ||
      this.draftError() ||
      this.draftSaved() ||
      this.deviceDraftPresent(),
  );

  // --- Step 6: review ---
  protected readonly publishOnApproval = signal(true);
  protected readonly published = signal(false);

  // --- Derived copy ---
  protected readonly heading = computed(
    () =>
      [
        'Tell us about your hostel',
        'Pin your hostel location',
        'Add photos of your hostel',
        'Configure your rooms',
        'What does your hostel offer?',
        'Review & publish',
      ][this.step()],
  );
  protected readonly subheading = computed(
    () =>
      [
        'Start with the basics — students will see this first.',
        "Drag the pin to your building. We'll auto-fill the address from the map.",
        'Great photos get up to 3× more enquiries. Add at least three.',
        'Add each room type you offer with its capacity and monthly price.',
        'Select the amenities and facilities available at your hostel.',
        'Check everything looks right, then publish your listing.',
      ][this.step()],
  );
  protected readonly nextLabel = computed(
    () =>
      [
        'Continue to location',
        'Continue to media',
        'Continue to rooms',
        'Continue to amenities',
        'Create hostel',
      ][this.step()],
  );

  constructor() {
    this.restoreDraft();
    afterNextRender(() => {
      this.loadAmenities();
    });

    // Best-effort localStorage draft on any state change (SSR-guarded).
    effect(() => {
      this.persistDraft();
    });

  }

  /**
   * Mirrors the whole form to localStorage. Driven by an effect, but also callable
   * directly: effects are scheduled, so a write that must land before the component
   * is destroyed cannot be left to the next flush.
   */
  private persistDraft(): void {
    if (typeof localStorage === 'undefined') return;
    const draft: OnboardingDraft = {
      draftId: this.draftId(),
      step: this.step(),
      name: this.name(),
      city: this.city(),
      gender: this.accommodationType(),
      description: this.description(),
      lat: this.lat(),
      lng: this.lng(),
      area: this.area(),
      province: this.province(),
      country: this.country(),
      street: this.street(),
      landmarks: this.landmarks(),
      media: this.persistableMedia(),
      linkedAttachmentIds: [...this.linkedAttachmentIds()],
      amenities: this.selectedAmenities(),
      rooms: this.rooms(),
      newRoomType: this.newRoomType(),
      newRoomCapacity: this.newRoomCapacity(),
      newRoomPrice: this.newRoomPrice(),
      publishOnApproval: this.publishOnApproval(),
      email: this.email(),
      phone: this.phone(),
    };
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
    } catch {
      /* best-effort: ignore quota / privacy-mode failures */
    }
  }

  // --- Navigation ---
  protected next(): void {
    this.step.update((s) => Math.min(s + 1, this.lastStep));
  }

  protected back(): void {
    this.step.update((s) => Math.max(s - 1, 0));
  }

  /** Jump to a step from the stepper — only ones already completed (i < current), never ahead. */
  protected goToStep(i: number): void {
    if (i < this.step()) this.step.set(i);
  }

  // --- Step 2: map location picker ---
  protected onPicked(p: PickedLocation): void {
    this.lat.set(p.lat);
    this.lng.set(p.lng);
    this.locationPinned.set(true);
    // Only overwrite a field when the geocoder actually resolved it, so a partial
    // result never blanks something the host already typed.
    if (p.area) this.area.set(p.area);
    if (p.city) this.city.set(p.city);
    if (p.province) this.province.set(p.province);
    if (p.country) this.country.set(p.country);
    if (p.street) this.street.set(p.street);
  }

  // --- Step 3: media ---
  protected onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    input.value = '';
    const target = this.replaceTarget();
    this.replaceTarget.set(null);
    if (!files.length) return;
    const { accepted, error } = target
      ? screenReplacementPhoto(files[0])
      : screenPickedPhotos(files, this.media().length);
    this.uploadError.set(error);
    for (const file of accepted) this.uploadOneFile(file, target);
  }

  private setPhotoProgress(id: string, percent: number): void {
    this.uploadingPhotos.update((m) => new Map(m).set(id, percent));
  }

  private clearPhotoProgress(id: string): void {
    this.uploadingPhotos.update((m) => {
      const n = new Map(m);
      n.delete(id);
      return n;
    });
  }

  private uploadOneFile(file: File, target: MediaItem | null): void {
    const previewUrl = URL.createObjectURL(file);
    const format = imageFormatLabel(file);
    const cardId = target ? target.id : ++this.mediaId;
    if (target) {
      // The old preview stays alive until the replacement lands, so a failure can roll back to it.
      this.media.update((items) =>
        items.map((m) =>
          m.id === target.id
            ? { ...m, url: previewUrl, format, label: file.name, attachmentId: undefined }
            : m,
        ),
      );
    } else {
      this.media.update((items) => {
        const next = [
          ...items,
          { id: cardId, label: file.name, primary: false, url: previewUrl, format },
        ];
        if (!next.some((m) => m.primary)) next[0] = { ...next[0], primary: true };
        return next;
      });
    }
    const trackingId = String(cardId);
    this.setPhotoProgress(trackingId, 0);
    this.imageUpload
      .upload('attachments', file, (percent) => this.setPhotoProgress(trackingId, percent))
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: ({ id: attachmentId, url }) => {
          this.clearPhotoProgress(trackingId);
          // Swap the blob preview for the CDN url so the card survives a reload.
          this.media.update((items) =>
            items.map((m) =>
              m.id === cardId ? { ...m, attachmentId, url: url || m.url } : m,
            ),
          );
          if (url) URL.revokeObjectURL(previewUrl);
          if (target?.url?.startsWith('blob:')) URL.revokeObjectURL(target.url);
        },
        error: () => {
          this.clearPhotoProgress(trackingId);
          this.uploadError.set('Upload failed — please try again.');
          URL.revokeObjectURL(previewUrl);
          if (target) this.restoreCard(target);
          else this.dropCard(cardId);
        },
      });
  }

  /** Puts a card back the way it was before a replacement upload failed. */
  private restoreCard(previous: MediaItem): void {
    this.media.update((items) =>
      items.map((m) => (m.id === previous.id ? { ...previous } : m)),
    );
  }

  /**
   * The draft-safe projection of the current media list. Built field by field so a
   * `File` or a session-only `blob:` preview can never leak into localStorage.
   */
  private persistableMedia(): PersistedMediaItem[] {
    const out: PersistedMediaItem[] = [];
    for (const m of this.media()) {
      if (!m.url || m.url.startsWith('blob:') || !m.attachmentId) continue;
      out.push({
        id: m.id,
        url: m.url,
        attachmentId: m.attachmentId,
        primary: m.primary,
        label: m.label,
      });
    }
    return out.slice(0, MAX_PHOTOS);
  }

  /** Removes only the failed card, leaving sibling uploads and their previews alone. */
  private dropCard(cardId: number): void {
    this.media.update((items) => {
      const next = items.filter((m) => m.id !== cardId);
      if (next.length && !next.some((m) => m.primary))
        next[0] = { ...next[0], primary: true };
      return next;
    });
  }

  protected setPrimary(item: MediaItem): void {
    this.media.update((items) =>
      items.map((m) => ({ ...m, primary: m.id === item.id })),
    );
  }

  protected removeMedia(item: MediaItem): void {
    this.media.update((items) => {
      if (item.url?.startsWith('blob:')) URL.revokeObjectURL(item.url);
      const next = items.filter((m) => m.id !== item.id);
      if (next.length && !next.some((m) => m.primary))
        next[0] = { ...next[0], primary: true };
      return next;
    });
  }

  // --- Step 4: rooms ---
  protected setNewRoomCapacity(raw: string): void {
    const n = Math.floor(parseFloat(raw));
    // Empty or non-numeric mid-edit keeps the last good value instead of snapping to 1.
    if (!Number.isFinite(n)) return;
    this.newRoomCapacity.set(clampCapacity(n));
  }

  protected setNewRoomPrice(raw: string): void {
    const n = Number(raw);
    this.newRoomPrice.set(Number.isFinite(n) && n > 0 ? n : 0);
    if (this.newRoomPrice() > 0) this.roomFormError.set(null);
  }

  protected addRoom(): void {
    const type = this.newRoomType();
    if (!type || this.rooms().some((r) => r.type === type)) return;
    if (this.newRoomPrice() <= 0) {
      this.roomFormError.set('Enter a monthly price greater than 0');
      return;
    }
    this.roomFormError.set(null);
    this.rooms.update((list) => [
      ...list,
      {
        id: ++this.roomId,
        type,
        capacity: clampCapacity(this.newRoomCapacity()),
        price: this.newRoomPrice(),
      },
    ]);
    this.newRoomType.set(this.firstAvailableRoomType());
  }

  protected removeRoom(id: number): void {
    this.rooms.update((list) => list.filter((r) => r.id !== id));
    if (!this.newRoomType()) this.newRoomType.set(this.firstAvailableRoomType());
  }

  private firstAvailableRoomType(): string {
    const used = new Set(this.rooms().map((r) => r.type));
    return this.roomTypes.find((t) => !used.has(t)) ?? '';
  }

  // --- Step 5: save form then navigate to payment page ---
  protected saveAndContinue(): void {
    this.showValidation.set(true);
    if (!this.isFormValid()) {
      this.showValidationModal.set(true);
      return;
    }
    if (this.draftSaving() || this.uploading()) return;
    this.draftSaving.set(true);
    this.draftSaved.set(false);
    this.draftError.set(false);
    this.apiErrors.set([]);
    const id = this.draftId();
    const flushedIds = this.unlinkedAttachmentIds();
    const input = this.buildSubmitInput();
    (id ? this.hostelsApi.update(id, input) : this.hostelsApi.create(input))
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (hostel) => {
          const isNew = hostel.id != null && !this.draftId();
          if (isNew) this.draftId.set(hostel.id);
          this.markAttachmentsLinked(flushedIds);
          this.draftSaving.set(false);
          this.draftSaved.set(true);
          // After creating a hostel (not updating), the backend grants the host role.
          // Refresh the session so the payment page sees the updated roles immediately.
          if (isNew) {
            this.authService
              .refreshSession()
              .pipe(catchError(() => of(null)), takeUntilDestroyed(this.destroyRef))
              .subscribe(() => this.router.navigate(['/host/listings/new/payment']));
          } else {
            this.router.navigate(['/host/listings/new/payment']);
          }
        },
        // Interceptor-normalised: the Rails errors[] envelope is on serverMessages.
        error: (err: ApiError) => {
          this.draftSaving.set(false);
          this.draftError.set(true);
          this.apiErrors.set(err?.serverMessages ? [...err.serverMessages] : []);
        },
      });
  }

  /**
   * Saves whatever exists and leaves for the home page. Never blocks on validation:
   * an incomplete form has no server record to update, so the localStorage draft is
   * authoritative and `restoreDraft()` brings the host straight back.
   */
  protected saveAndExit(): void {
    if (this.draftSaving() || this.uploading()) return;
    this.persistDraft();
    const id = this.draftId();
    if (!id && !this.isFormValid()) {
      this.goHome();
      return;
    }
    this.draftSaving.set(true);
    this.draftSaved.set(false);
    this.draftError.set(false);
    this.apiErrors.set([]);
    // Snapshotted before dispatch: `attachment_ids` appends, so a resend duplicates photos.
    const flushedIds = this.unlinkedAttachmentIds();
    const request = id
      ? this.hostelsApi.update(id, this.buildDraftInput())
      : this.hostelsApi.create(this.buildSubmitInput());
    request.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (hostel) => {
        if (!id && hostel.id != null) this.draftId.set(hostel.id);
        this.markAttachmentsLinked(flushedIds);
        this.draftSaving.set(false);
        this.draftSaved.set(true);
        this.persistDraft();
        // A first create grants the host role, so the session must catch up before leaving.
        if (!id) {
          this.authService
            .refreshSession()
            .pipe(catchError(() => of(null)), takeUntilDestroyed(this.destroyRef))
            .subscribe(() => this.goHome());
        } else {
          this.goHome();
        }
      },
      // Staying put loses nothing — the device draft is intact and the logo is the way out.
      // Interceptor-normalised: the Rails errors[] envelope is on serverMessages.
      error: (err: ApiError) => {
        this.draftSaving.set(false);
        this.draftError.set(true);
        this.apiErrors.set(err?.serverMessages ? [...err.serverMessages] : []);
      },
    });
  }

  /** Uploads abort on teardown, so an in-flight photo needs an explicit confirmation first. */
  protected onLogoClick(event: MouseEvent): void {
    if (!this.uploading()) return;
    event.preventDefault();
    this.showLeaveModal.set(true);
  }

  protected confirmLeave(): void {
    this.showLeaveModal.set(false);
    this.persistDraft();
    this.goHome();
  }

  private goHome(): void {
    this.router.navigate(['/']);
  }

  private buildSubmitInput(): HostelInput {
    return {
      ...this.buildDraftInput(),
      room_types_attributes: this.rooms().map((r) => ({
        name: r.type,
        capacity: r.capacity,
        price: r.price,
      })),
    };
  }

  protected genderLabel(g: GenderType): string {
    return g === 'co-living' ? 'Co-living' : g === 'boys' ? 'Boys' : 'Girls';
  }

  protected genderBadgeVariant(g: GenderType): BadgeVariant {
    return g === 'co-living' ? 'coliving' : g;
  }

  protected setGenderType(v: string | string[] | null): void {
    if (v === 'boys' || v === 'girls' || v === 'co-living') this.accommodationType.set(v);
  }

  protected setRoomType(v: string | string[] | null): void {
    if (typeof v !== 'string' || !v) return;
    if (this.rooms().some((r) => r.type === v)) return;
    this.newRoomType.set(v);
  }

  // --- Step 5: amenities ---
  /** Fetch the dynamic amenity catalogue; also the retry handler on failure. */
  protected loadAmenities(): void {
    this.amenitiesLoading.set(true);
    this.amenitiesError.set(false);
    this.offersApi
      .categories()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (cats) => {
          this.offerCategories.set(cats);
          this.amenitiesLoading.set(false);
        },
        error: () => {
          this.amenitiesError.set(true);
          this.amenitiesLoading.set(false);
        },
      });
  }

  protected isAmenitySelected(id: string): boolean {
    return this.selectedAmenities().includes(id);
  }

  /** Uploaded attachment ids the backend has not linked yet — `attachment_ids` appends. */
  private unlinkedAttachmentIds(): string[] {
    const linked = this.linkedAttachmentIds();
    return this.media()
      .map((m) => m.attachmentId)
      .filter((attachmentId): attachmentId is string => !!attachmentId && !linked.has(attachmentId));
  }

  private markAttachmentsLinked(ids: string[]): void {
    if (!ids.length) return;
    this.linkedAttachmentIds.update((s) => {
      const next = new Set(s);
      for (const id of ids) next.add(id);
      return next;
    });
  }

  private buildDraftInput(): HostelInput {
    const attachmentIds = this.unlinkedAttachmentIds();
    const bannerId = this.media().find((m) => m.primary)?.attachmentId;
    return {
      name: this.name() || undefined,
      description: this.description() || undefined,
      nearby_landmarks: this.landmarks() || undefined,
      gender_type: this.accommodationType(),
      city: this.city() || undefined,
      area: this.area() || undefined,
      state: this.province() || undefined,
      country: this.country() || undefined,
      address_1: this.street() || undefined,
      latitude: this.lat() || undefined,
      longitude: this.lng() || undefined,
      offer_ids: this.selectedAmenities(),
      email: this.email() || undefined,
      primary_phone: this.phone() || undefined,
      total_rooms: this.rooms().length || 1,
      total_floors: 1,
      ...(attachmentIds.length ? { attachment_ids: attachmentIds } : {}),
      // Attachment ids can be UUID strings while the field is typed as a number.
      ...(bannerId ? { banner_id: bannerId as unknown as number } : {}),
    };
  }

  protected categoryIcon(name: string): string {
    return CATEGORY_ICONS[name.trim().toLowerCase()] ?? 'ti-tag';
  }

  protected offerIcon(slug: string): string {
    return iconForSlug(slug);
  }

  protected toggleAmenity(id: string): void {
    this.selectedAmenities.update((ids) =>
      ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id],
    );
  }

  private restoreDraft(): void {
    if (typeof localStorage === 'undefined') return;
    let raw: string | null;
    try {
      raw = localStorage.getItem(DRAFT_KEY);
    } catch {
      return;
    }
    if (!raw) return;
    try {
      const d = JSON.parse(raw) as Partial<OnboardingDraft>;
      if (typeof d.draftId === 'number' && d.draftId > 0) this.draftId.set(d.draftId);
      if (typeof d.step === 'number')
        this.step.set(Math.max(0, Math.min(this.lastStep, d.step)));
      if (typeof d.name === 'string') this.name.set(d.name);
      if (typeof d.city === 'string') this.city.set(d.city);
      if (
        d.gender === 'boys' ||
        d.gender === 'girls' ||
        d.gender === 'co-living'
      )
        this.accommodationType.set(d.gender);
      if (typeof d.description === 'string')
        this.description.set(d.description);
      if (typeof d.lat === 'number') this.lat.set(d.lat);
      if (typeof d.lng === 'number') this.lng.set(d.lng);
      if (typeof d.area === 'string') this.area.set(d.area);
      if (typeof d.province === 'string') this.province.set(d.province);
      if (typeof d.country === 'string') this.country.set(d.country);
      if (typeof d.street === 'string') this.street.set(d.street);
      if (typeof d.landmarks === 'string') this.landmarks.set(d.landmarks);
      if (Array.isArray(d.media)) {
        // Keep only photos that actually reached S3: a CDN url plus the attachment id that links
        // them. Legacy placeholder seeds (no url) and dead blob: previews are dropped.
        const saved = d.media as Partial<PersistedMediaItem>[];
        this.media.set(
          saved
            .filter(isRestorableMedia)
            .slice(0, MAX_PHOTOS)
            .map((m) => ({
              id: m.id,
              url: m.url,
              attachmentId: m.attachmentId,
              primary: m.primary,
              label: m.label,
            })),
        );
        this.mediaId = saved.reduce((max, m) => Math.max(max, m?.id ?? 0), 0);
      }
      if (Array.isArray(d.linkedAttachmentIds)) {
        this.linkedAttachmentIds.set(
          new Set(d.linkedAttachmentIds.filter((v): v is string => typeof v === 'string')),
        );
      }
      if (Array.isArray(d.rooms)) {
        // Drafts saved before one-row-per-type was enforced can hold duplicates; keep the first of each.
        const seen = new Set<string>();
        const rooms: Room[] = [];
        for (const r of d.rooms) {
          if (seen.has(r.type)) continue;
          seen.add(r.type);
          rooms.push(r);
        }
        this.rooms.set(rooms);
        this.roomId = d.rooms.reduce((max, r) => Math.max(max, r.id ?? 0), 0);
      }
      if (Array.isArray(d.amenities)) {
        this.selectedAmenities.set(
          d.amenities.filter((a): a is string => typeof a === 'string'),
        );
      }
      if (typeof d.newRoomType === 'string')
        this.newRoomType.set(d.newRoomType);
      // A stale draft can resume pointed at an unknown or already-added type.
      const restoredType = this.newRoomType();
      if (
        !this.roomTypes.includes(restoredType) ||
        this.rooms().some((r) => r.type === restoredType)
      )
        this.newRoomType.set(this.firstAvailableRoomType());
      // A fixed type derives its own capacity; only a variable type may carry the persisted one.
      if (
        typeof d.newRoomCapacity === 'number' &&
        fixedCapacityFor(this.newRoomType()) === null
      )
        this.newRoomCapacity.set(clampCapacity(d.newRoomCapacity));
      if (typeof d.newRoomPrice === 'number')
        this.newRoomPrice.set(d.newRoomPrice);
      if (typeof d.publishOnApproval === 'boolean')
        this.publishOnApproval.set(d.publishOnApproval);
      if (typeof d.email === 'string') this.email.set(d.email);
      if (typeof d.phone === 'string') this.phone.set(d.phone);
    } catch {
      /* corrupt draft: start fresh */
    }
  }
}
