import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  ElementRef,
  inject,
  linkedSignal,
  signal,
  viewChild,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { DecimalPipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { catchError, of } from 'rxjs';
import { AttachmentLabel, HostelInput, OfferCategory } from '@hostelhive/data-access';
import { HostelsApi, ImageUploadService, OffersApi } from '@services';
import {
  ACCEPT_ATTR,
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
import { LocationPicker, PickedLocation, PlaceSearchField } from '@hostelhive/maps';
import { DashboardLayout } from '@layout/dashboard-layout/dashboard-layout';
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
  url?: string;
  /** Short format name, shown when the browser can't decode the local preview. */
  format?: string;
  /** Set once the file has landed on S3 — this is what links the photo to the hostel. */
  attachmentId?: string;
}

interface RoomEntry {
  id: number;
  type: string;
  capacity: number;
  price: number;
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

@Component({
  selector: 'hh-new-hostel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DecimalPipe,
    DashboardLayout,
    RouterLink,
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
  ],
  templateUrl: './new-hostel.html',
})
export class NewHostel {
  private readonly hostels = inject(HostelsApi);
  private readonly offersApi = inject(OffersApi);
  private readonly imageUpload = inject(ImageUploadService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  // ── dropdown options ──
  protected readonly roomTypes: readonly string[] = ROOM_TYPES;
  protected readonly genderOptions: DropdownOption[] = [
    { value: 'boys', label: 'Boys' },
    { value: 'girls', label: 'Girls' },
    { value: 'co-living', label: 'Co-living' },
  ];
  protected readonly cityTypes = ['(cities)'];
  protected readonly acceptAttr = ACCEPT_ATTR;

  private readonly hostFormOptions = toSignal(
    this.hostels.formOptions().pipe(
      catchError(() =>
        of({ genderTypes: [], propertyTypes: [], attachmentLabels: [] as AttachmentLabel[] }),
      ),
    ),
    {
      initialValue: {
        genderTypes: [],
        propertyTypes: [],
        attachmentLabels: [] as AttachmentLabel[],
      },
    },
  );

  protected readonly labelOptions = computed<DropdownOption[]>(() =>
    this.hostFormOptions().attachmentLabels.map((l) => ({ value: String(l.id), label: l.name })),
  );

  // ── listing details ──
  protected readonly name = signal('');
  protected readonly city = signal('');
  protected readonly gender = signal<GenderType>('boys');
  protected readonly description = signal('');
  protected readonly email = signal('');
  protected readonly phone = signal('');

  // ── location ──
  protected readonly lat = signal(24.8607);
  protected readonly lng = signal(67.0011);
  protected readonly area = signal('');
  protected readonly province = signal('');
  protected readonly country = signal('');
  protected readonly street = signal('');
  protected readonly landmarks = signal('');
  protected readonly locationPinned = signal(false);

  // ── photos ──
  private mediaId = 0;
  protected readonly media = signal<MediaItem[]>([]);
  private readonly fileInput = viewChild.required<ElementRef<HTMLInputElement>>('fileInput');
  private readonly replaceTarget = signal<MediaItem | null>(null);
  protected readonly uploadError = signal<string | null>(null);
  protected readonly photoLabelMap = signal<Map<string, string | null>>(new Map());
  /** Card id → upload progress 0–100 while its file is still in flight. */
  private readonly uploadingPhotos = signal<Map<string, number>>(new Map());
  protected readonly uploading = computed(() => this.uploadingPhotos().size > 0);
  protected readonly atPhotoLimit = computed(() => this.media().length >= MAX_PHOTOS);

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

  // ── room types ──
  private roomId = 0;
  protected readonly rooms = signal<RoomEntry[]>([]);
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
  protected readonly newRoomPrice = signal(0);
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

  // ── amenities ──
  protected readonly offerCategories = signal<OfferCategory[]>([]);
  protected readonly amenitiesLoading = signal(false);
  protected readonly amenitiesError = signal(false);
  protected readonly selectedAmenities = signal<string[]>([]);

  // ── save state ──
  protected readonly saving = signal(false);
  protected readonly apiErrors = signal<string[]>([]);
  protected readonly showValidation = signal(false);
  protected readonly showValidationModal = signal(false);

  // ── validation ──
  protected readonly fieldErrors = computed<Partial<Record<string, string>>>(() => {
    const e: Record<string, string> = {};
    if (!this.name().trim()) e['name'] = 'Hostel name is required';
    if (!this.city().trim()) e['city'] = 'City is required';
    const emailVal = this.email().trim();
    if (!emailVal) e['email'] = 'Contact email is required';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailVal))
      e['email'] = 'Enter a valid email address';
    if (!this.phone().trim()) e['phone'] = 'Primary phone is required';
    const descText = this.description().replace(/<[^>]*>/g, '').trim();
    if (!descText) e['description'] = 'Description is required';
    if (!this.rooms().length) e['rooms'] = 'At least one room type is required';
    if (!this.locationPinned()) e['location'] = 'Pin your hostel location on the map';
    return e;
  });
  protected readonly isFormValid = computed(() => Object.keys(this.fieldErrors()).length === 0);
  protected objectEntries = Object.entries as (
    o: Partial<Record<string, string>>,
  ) => [string, string][];

  constructor() {
    afterNextRender(() => this.loadAmenities());
  }

  // ── location ──
  protected onPicked(p: PickedLocation): void {
    this.lat.set(p.lat);
    this.lng.set(p.lng);
    this.locationPinned.set(true);
    if (p.area) this.area.set(p.area);
    if (p.city) this.city.set(p.city);
    if (p.province) this.province.set(p.province);
    if (p.country) this.country.set(p.country);
    if (p.street) this.street.set(p.street);
  }

  // ── photos ──
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
    this.photoLabelMap.update((m) => new Map(m).set(id, typeof v === 'string' ? v : null));
  }
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
        next: ({ id: attachmentId }) => {
          this.clearPhotoProgress(trackingId);
          this.media.update((items) =>
            items.map((m) => (m.id === cardId ? { ...m, attachmentId } : m)),
          );
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

  /** Removes only the failed card, leaving sibling uploads and their previews alone. */
  private dropCard(cardId: number): void {
    this.media.update((items) => {
      const next = items.filter((m) => m.id !== cardId);
      if (next.length && !next.some((m) => m.primary)) next[0] = { ...next[0], primary: true };
      return next;
    });
  }

  protected setPrimary(item: MediaItem): void {
    this.media.update((items) => items.map((m) => ({ ...m, primary: m.id === item.id })));
  }
  protected removeMedia(item: MediaItem): void {
    this.media.update((items) => {
      if (item.url?.startsWith('blob:')) URL.revokeObjectURL(item.url);
      const next = items.filter((m) => m.id !== item.id);
      if (next.length && !next.some((m) => m.primary)) next[0] = { ...next[0], primary: true };
      return next;
    });
  }

  // ── rooms ──
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
  protected setRoomType(v: string | string[] | null): void {
    if (typeof v !== 'string' || !v) return;
    if (this.rooms().some((r) => r.type === v)) return;
    this.newRoomType.set(v);
  }
  private firstAvailableRoomType(): string {
    const used = new Set(this.rooms().map((r) => r.type));
    return this.roomTypes.find((t) => !used.has(t)) ?? '';
  }
  protected setGenderType(v: string | string[] | null): void {
    if (v === 'boys' || v === 'girls' || v === 'co-living') this.gender.set(v);
  }

  // ── amenities ──
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
  protected toggleAmenity(id: string): void {
    this.selectedAmenities.update((ids) =>
      ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id],
    );
  }
  protected categoryIcon(name: string): string {
    return CATEGORY_ICONS[name.trim().toLowerCase()] ?? 'ti-tag';
  }

  // ── submit ──
  protected create(): void {
    this.showValidation.set(true);
    if (!this.isFormValid()) {
      this.showValidationModal.set(true);
      return;
    }
    if (this.saving() || this.uploading()) return;
    this.saving.set(true);
    this.apiErrors.set([]);
    const attachmentIds = this.media()
      .map((m) => m.attachmentId)
      .filter((id): id is string => !!id);
    const bannerId = this.media().find((m) => m.primary)?.attachmentId;
    const payload: HostelInput = {
      name: this.name().trim(),
      description: this.description() || undefined,
      nearby_landmarks: this.landmarks() || undefined,
      gender_type: this.gender(),
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
      room_types_attributes: this.rooms().map((r) => ({
        name: r.type,
        capacity: r.capacity,
        price: r.price,
      })),
      ...(attachmentIds.length ? { attachment_ids: attachmentIds } : {}),
      // Attachment ids can be UUID strings while the field is typed as a number.
      ...(bannerId ? { banner_id: bannerId as unknown as number } : {}),
    };
    this.hostels
      .create(payload)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (hostel) => {
          this.router.navigate(['/host', hostel.id, 'profile']);
        },
        error: (err: HttpErrorResponse) => {
          this.saving.set(false);
          this.apiErrors.set(err?.error?.errors ?? ["Couldn't create hostel — please try again."]);
        },
      });
  }
}
