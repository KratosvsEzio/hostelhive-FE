import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  computed,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import {
  takeUntilDestroyed,
  toObservable,
  toSignal,
} from '@angular/core/rxjs-interop';
import { catchError, last, map, of, startWith, switchMap, tap } from 'rxjs';
import { HostelInput, iconForSlug, OfferCategory } from '@hostelhive/data-access';
import {
  DocumentsApi,
  HostelsApi,
  MAX_UPLOAD_BYTES,
  UploadProgress,
} from '@services';
import {
  Button,
  ConfirmModal,
  Dropdown,
  DropdownOption,
  ErrorState,
  PhotoGrid,
  PhotoGridPhoto,
  RichText,
  Skeleton,
  StatusPill,
} from '@hostelhive/ui';
import { LocationPicker, PickedLocation } from '@hostelhive/maps';
import { DashboardLayout } from '@layout/dashboard-layout/dashboard-layout';
import { RoomTypeRow } from './room-type-row';
import { ModerationApi, ModFormOptions } from '@services';
import {
  PhotoDecision,
  ReviewDetail,
  ReviewPhoto,
} from '@hostelhive/data-access';
import { isNetworkError } from '@util/network-error';
import { LocaleLink } from '@core/i18n/locale-link';
import { LocaleStore } from '@core/i18n/locale-store';
import { localiseCommands } from '@core/i18n/locale-commands';
import { TranslocoPipe } from '@jsverse/transloco';

const EMPTY_FORM_OPTIONS: ModFormOptions = {
  genderTypes: [],
  propertyTypes: [],
  attachmentLabels: [],
};

/** "CO-LIVING" → "Co-living", "APARTMENT" → "Apartment". */
function toLabel(name: string): string {
  return name.charAt(0).toUpperCase() + name.slice(1).toLowerCase();
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

interface ViewState {
  loading: boolean;
  error: boolean;
  networkError: boolean;
  data: ReviewDetail | null;
}

/** A room type in the editable list (client-side _key for @for tracking). */
interface EditRoomType {
  _key: string;
  id?: number;
  name: string;
  capacity: number;
  price: number;
}

/** The moderator-editable hostel state (core fields + location + selected amenity ids). The page-level
 *  Update action PUTs a payload mirroring these; the dirty check compares the current state vs this snapshot. */
interface EditableHostel {
  name: string;
  description: string;
  landmarks: string;
  propertyType: string;
  genderType: string;
  /** Sorted selected offer (amenity) ids, for stable equality. */
  offerIds: string[];
  // location
  lat: number | null;
  lng: number | null;
  country: string;
  city: string;
  state: string;
  area: string;
  address1: string;
}

@Component({
  selector: 'hh-review',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DashboardLayout,
    RouterLink, LocaleLink,
    Button,
    ConfirmModal,
    Dropdown,
    ErrorState,
    LocationPicker,
    PhotoGrid,
    RichText,
    Skeleton,
    StatusPill,
    RoomTypeRow,
    TranslocoPipe,
  ],
  templateUrl: './review.html',
})
export class Review {
  private readonly api = inject(ModerationApi);
  private readonly hostels = inject(HostelsApi);
  private readonly docs = inject(DocumentsApi);
  private readonly destroyRef = inject(DestroyRef);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly locale = inject(LocaleStore);

  /** Route param — `review/:id`. Read from ActivatedRoute (apps don't enable component input binding). */
  protected readonly id = toSignal(
    this.route.paramMap.pipe(map((p) => p.get('id') ?? '')),
    {
      initialValue: '',
    },
  );

  private readonly idx = 0;
  protected readonly ids = {
    name: `hh-rev-name-${this.idx}`,
    desc: `hh-rev-desc-${this.idx}`,
    landmarks: `hh-rev-land-${this.idx}`,
  };

  private readonly refresh = signal(0);

  protected readonly state = toSignal(
    toObservable(computed(() => ({ id: this.id(), r: this.refresh() }))).pipe(
      switchMap(({ id }) =>
        this.api.getById(id).pipe(
          map((data): ViewState => ({ loading: false, error: false, networkError: false, data })),
          startWith<ViewState>({ loading: true, error: false, networkError: false, data: null }),
          catchError((err) =>
            of<ViewState>({ loading: false, error: true, networkError: isNetworkError(err), data: null }),
          ),
        ),
      ),
    ),
    { initialValue: { loading: true, error: false, networkError: false, data: null } as ViewState },
  );

  // Local editable copy — seeded from the loaded detail.
  protected readonly name = signal('');
  protected readonly description = signal('');
  protected readonly landmarks = signal('');
  protected readonly propertyType = signal('');
  protected readonly genderType = signal('');

  // Editable location — seeded from loaded detail, updated when user moves the map pin or picks a place.
  protected readonly locLat = signal<number | null>(null);
  protected readonly locLng = signal<number | null>(null);
  protected readonly locCountry = signal('');
  protected readonly locCity = signal('');
  protected readonly locState = signal('');
  protected readonly locArea = signal('');
  protected readonly locAddress1 = signal('');

  private readonly formOptions = toSignal(
    this.api.formOptions().pipe(catchError(() => of(EMPTY_FORM_OPTIONS))),
    { initialValue: EMPTY_FORM_OPTIONS },
  );

  protected readonly typeOptions = computed<DropdownOption[]>(() =>
    this.formOptions().propertyTypes.map((t) => ({
      value: t.slug,
      label: toLabel(t.name),
    })),
  );
  protected readonly genderOptions = computed<DropdownOption[]>(() =>
    this.formOptions().genderTypes.map((g) => ({
      value: g.slug,
      label: toLabel(g.name),
    })),
  );
  protected readonly labelOptions = computed<DropdownOption[]>(() => {
    const opts: DropdownOption[] = this.formOptions().attachmentLabels.map(
      (l) => ({ value: String(l.id), label: l.name }),
    );
    // Supplement with any labels already attached to loaded photos so the pre-selection
    // displays the correct name even before formOptions finishes loading.
    const seen = new Set(opts.map((o) => o.value));
    for (const p of this.state().data?.photos ?? []) {
      if (p.labelId != null && p.labelName) {
        const key = String(p.labelId);
        if (!seen.has(key)) {
          opts.push({ value: key, label: p.labelName });
          seen.add(key);
        }
      }
    }
    return opts;
  });
  /** Per-photo label selection: photoId → label id as string (for dropdown binding), or null. */
  protected readonly photoLabelMap = signal<Map<string, string | null>>(
    new Map(),
  );
  protected readonly photos = signal<ReviewPhoto[]>([]);

  /** Mapped view of photos for the shared hh-photo-grid component. */
  protected readonly photoGridItems = computed<PhotoGridPhoto[]>(() =>
    this.photos().map((p) => ({
      id: p.id,
      url: p.url,
      primary: p.primary,
      uploadProgress: this.uploadingPhotos().get(p.id),
      rejected: p.decision === 'rejected',
      rejectReason: p.rejectReason,
    })),
  );

  protected findPhoto(id: string): ReviewPhoto | undefined {
    return this.photos().find((p) => p.id === id);
  }

  /** Hidden <input type=file> in the template; opened to pick a device image. */
  private readonly fileInput =
    viewChild.required<ElementRef<HTMLInputElement>>('fileInput');
  /** The photo to overwrite when the picker returns; null = append a new photo. */
  private readonly replaceTarget = signal<ReviewPhoto | null>(null);
  /** Per-photo upload progress: photoId → percent (0–100). Present only while uploading. */
  protected readonly uploadingPhotos = signal<Map<string, number>>(new Map());
  /** True when at least one photo upload is in progress. */
  protected readonly uploading = computed(
    () => this.uploadingPhotos().size > 0,
  );
  /** Non-null when any upload fails — shown as an inline error above the grid. */
  protected readonly uploadError = signal<string | null>(null);
  /** True when the user tries to add photos beyond the 10-image limit. */
  protected readonly photoLimitOpen = signal(false);
  /** Photo pending removal confirmation — non-null while the confirm modal is open. */
  protected readonly removeConfirmPhoto = signal<ReviewPhoto | null>(null);
  /** Attachment IDs from completed S3 uploads, flushed to the hostel on the next save. */
  private readonly pendingAttachmentIds = signal<string[]>([]);
  /** Maps temp photo card ID → S3 attachment UUID for photos added this session.
   *  Used to distinguish new uploads (remove entirely) from existing photos (mark rejected). */
  protected readonly newPhotoMap = signal<Map<string, string>>(new Map());
  protected readonly audit = signal<ReviewDetail['audit']>([]);
  protected readonly flagged = signal(false);
  protected readonly decision = signal<'approve' | null>(null);
  protected readonly approving = signal(false);
  protected readonly approveError = signal(false);
  protected readonly validationModalOpen = signal(false);

  // ── editable amenities (selectable offers → saved as part of the page-level Update) ──
  /** Selected catalogue offer ids — saved as `offer_ids`. */
  protected readonly selectedOfferIds = signal<Set<string>>(new Set());
  /** Whether the full catalogue is shown (else just the first category). */
  protected readonly showAll = signal(false);

  // ── room types ──
  protected readonly roomTypes = signal<EditRoomType[]>([]);

  protected addRoomType(): void {
    this.roomTypes.update((list) => [
      ...list,
      { _key: `new-${Date.now()}`, name: '', capacity: 1, price: 0 },
    ]);
  }

  protected patchRoomField(key: string, field: 'name' | 'capacity' | 'price', value: string | number): void {
    this.roomTypes.update((list) =>
      list.map((rt) => (rt._key !== key ? rt : { ...rt, [field]: value })),
    );
  }

  // ── page-level save (core fields + amenities → PUT /api/hostels/:id) ──
  /** Last in-session save — overlays the loaded baseline so the dirty check + Update button reset after saving. */
  private readonly savedSnapshot = signal<EditableHostel | null>(null);
  protected readonly saving = signal(false);
  protected readonly saved = signal(false);
  protected readonly saveError = signal(false);
  /** Loaded baseline (core fields + location + selected offers) from the fetched detail. */
  private readonly loadedSnapshot = computed<EditableHostel | null>(() => {
    const d = this.state().data;
    if (!d) return null;
    const slugs = new Set(d.selectedOfferSlugs);
    const offerIds = new Set<string>();
    for (const cat of d.offerCatalog)
      for (const o of cat.offers) if (slugs.has(o.slug)) offerIds.add(o.id);
    const lat = d.lat !== null && d.lat !== undefined ? Number(d.lat) : null;
    const lng = d.lng !== null && d.lng !== undefined ? Number(d.lng) : null;
    return {
      name: d.name,
      description: d.description,
      landmarks: d.landmarks,
      propertyType: d.propertyType,
      genderType: d.genderType,
      offerIds: [...offerIds].sort(),
      lat: Number.isFinite(lat) ? lat : null,
      lng: Number.isFinite(lng) ? lng : null,
      country: d.country,
      city: d.city === '—' ? '' : d.city,
      state: d.state,
      area: d.area,
      address1: d.address1,
    };
  });
  /** The current editable state (mirrors loadedSnapshot's shape). */
  private readonly currentSnapshot = computed<EditableHostel>(() => ({
    name: this.name(),
    description: this.description(),
    landmarks: this.landmarks(),
    propertyType: this.propertyType(),
    genderType: this.genderType(),
    offerIds: [...this.selectedOfferIds()].sort(),
    lat: this.locLat(),
    lng: this.locLng(),
    country: this.locCountry(),
    city: this.locCity(),
    state: this.locState(),
    area: this.locArea(),
    address1: this.locAddress1(),
  }));
  /** True once anything — a field, amenity selection, location, pending upload, or room-type change — differs from the baseline; gates Update. */
  protected readonly dirty = computed(() => {
    if (this.pendingAttachmentIds().length > 0) return true;
    const base = this.savedSnapshot() ?? this.loadedSnapshot();
    if (!base) return false;
    const cur = this.currentSnapshot();
    return (
      cur.name !== base.name ||
      cur.description !== base.description ||
      cur.landmarks !== base.landmarks ||
      cur.propertyType !== base.propertyType ||
      cur.genderType !== base.genderType ||
      cur.offerIds.join(',') !== base.offerIds.join(',') ||
      cur.lat?.toFixed(6) !== base.lat?.toFixed(6) ||
      cur.lng?.toFixed(6) !== base.lng?.toFixed(6) ||
      cur.country !== base.country ||
      cur.city !== base.city ||
      cur.state !== base.state ||
      cur.area !== base.area ||
      cur.address1 !== base.address1
    );
  });

  /** Whether the user has attempted to save/approve — enables inline validation feedback. */
  protected readonly saveAttempted = signal(false);

  protected readonly hasDescription = computed(() =>
    Review.hasContent(this.description()),
  );

  protected readonly validationErrors = computed<string[]>(() => {
    const d = this.state().data;
    const errs: string[] = [];
    if (!this.name().trim()) errs.push('Property name is required.');
    if (!this.propertyType()) errs.push('Type is required.');
    if (!this.genderType()) errs.push('AccommodationType is required.');
    if (!Review.hasContent(this.description()))
      errs.push('Description is required.');
    if (this.photos().filter((p) => p.decision !== 'rejected').length === 0)
      errs.push('At least one photo is required.');
    if (!this.locLat() || !this.locLng())
      errs.push('Valid location coordinates are required.');
    return errs;
  });

  constructor() {
    effect(() => {
      const d = this.state().data;
      if (!d) return;
      this.name.set(d.name);
      this.description.set(d.description);
      this.landmarks.set(d.landmarks);
      this.propertyType.set(d.propertyType);
      this.genderType.set(d.genderType);
      this.photos.set(d.photos.map((p) => ({ ...p })));
      this.photoLabelMap.set(
        new Map(
          d.photos.map((p) => [
            p.id,
            p.labelId != null ? String(p.labelId) : null,
          ]),
        ),
      );
      this.audit.set(d.audit.map((a) => ({ ...a })));
      this.flagged.set(false);
      this.decision.set(null);
      this.savedSnapshot.set(null);
      this.saved.set(false);
      this.saveError.set(false);
      this.approving.set(false);
      this.approveError.set(false);
      this.pendingAttachmentIds.set([]);
      this.newPhotoMap.set(new Map());
      this.saveAttempted.set(false);
      this.roomTypes.set(
        (d.room_types ?? []).map((r) => ({
          _key: String(r.id),
          id: r.id,
          name: r.name,
          capacity: r.capacity,
          price: r.price,
        })),
      );
      this.seedAmenities(d);
      // Seed editable location from the loaded hostel.
      const lat = d.lat !== null && d.lat !== undefined ? Number(d.lat) : null;
      const lng = d.lng !== null && d.lng !== undefined ? Number(d.lng) : null;
      this.locLat.set(Number.isFinite(lat) ? lat : null);
      this.locLng.set(Number.isFinite(lng) ? lng : null);
      this.locCountry.set(d.country);
      this.locCity.set(d.city === '—' ? '' : d.city);
      this.locState.set(d.state);
      this.locArea.set(d.area);
      this.locAddress1.set(d.address1);
    });
  }

  protected asValue(e: Event): string {
    return (e.target as HTMLInputElement | HTMLTextAreaElement).value;
  }

  protected setType(v: string | string[] | null): void {
    this.propertyType.set(typeof v === 'string' ? v : '');
  }

  protected setGender(v: string | string[] | null): void {
    this.genderType.set(typeof v === 'string' ? v : '');
  }

  /** Called when the location picker emits a new pin position (search, click, or drag). */
  protected onLocationPicked(loc: PickedLocation): void {
    this.locLat.set(loc.lat);
    this.locLng.set(loc.lng);
    this.locCountry.set(loc.country);
    this.locCity.set(loc.city);
    this.locState.set(loc.province);
    this.locArea.set(loc.area);
    this.locAddress1.set(loc.street);
  }

  /** Called when a label dropdown changes on an individual photo card — immediately persisted. */
  protected setPhotoLabel(
    photo: ReviewPhoto,
    v: string | string[] | null,
  ): void {
    const labelIdStr = typeof v === 'string' ? v : null;
    this.photoLabelMap.update((m) => new Map(m).set(photo.id, labelIdStr));
    // For new uploads the UUID lives in newPhotoMap; existing photos use their own id.
    const attachmentId = this.newPhotoMap().get(photo.id) ?? photo.id;
    const labelId = labelIdStr !== null ? labelIdStr : null;
    this.api
      .updateAttachmentLabel(attachmentId, labelId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        error: () =>
          this.uploadError.set('Failed to update label — try again.'),
      });
  }

  protected setDecision(photo: ReviewPhoto, decision: PhotoDecision): void {
    this.photos.update((list) =>
      list.map((p) =>
        p.id === photo.id
          ? {
              ...p,
              decision,
              primary: decision === 'rejected' ? false : p.primary,
            }
          : p,
      ),
    );
    if (decision === 'rejected')
      this.logAudit(`Rejected photo (${photo.rejectReason ?? 'flagged'})`);
  }

  /** X button — opens confirmation modal instead of acting immediately. */
  protected requestRemove(photo: ReviewPhoto): void {
    this.removeConfirmPhoto.set(photo);
  }

  /** Called when the user confirms removal in the modal. */
  protected confirmRemove(): void {
    const photo = this.removeConfirmPhoto();
    this.removeConfirmPhoto.set(null);
    if (photo) this.rejectOrRemove(photo);
  }

  /** X button on a photo card: remove new uploads entirely, mark existing ones as rejected. */
  protected rejectOrRemove(photo: ReviewPhoto): void {
    const attachmentId = this.newPhotoMap().get(photo.id);
    if (attachmentId !== undefined) {
      this.photos.update((list) => list.filter((p) => p.id !== photo.id));
      this.pendingAttachmentIds.update((ids) =>
        ids.filter((id) => id !== attachmentId),
      );
      this.newPhotoMap.update((m) => {
        const n = new Map(m);
        n.delete(photo.id);
        return n;
      });
    } else {
      this.setDecision(photo, 'rejected');
    }
  }

  protected setPrimary(photo: ReviewPhoto): void {
    this.photos.update((list) =>
      list.map((p) => ({
        ...p,
        primary: p.id === photo.id,
        decision: p.id === photo.id ? 'approved' : p.decision,
      })),
    );
    this.logAudit('Set a new primary image');
  }

  /** Per-photo Replace → pick a device image to overwrite this photo. */
  protected replace(photo: ReviewPhoto): void {
    this.replaceTarget.set(photo);
    this.fileInput().nativeElement.click();
  }

  /** "Replace / add" → pick a device image to append as a new photo. */
  protected addPhoto(): void {
    this.replaceTarget.set(null);
    this.fileInput().nativeElement.click();
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

  private static readonly MAX_PHOTOS = 10;
  private static hasContent(html: string): boolean {
    return html.replace(/<[^>]*>/g, '').trim().length > 0;
  }

  /** Dispatch each selected file as an independent upload. Replace mode uses only the first file. */
  protected onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    input.value = '';
    const target = this.replaceTarget();
    this.replaceTarget.set(null);
    if (!files.length) return;
    this.uploadError.set(null);

    if (!target) {
      // Count active (non-rejected) photos already in the grid.
      const active = this.photos().filter(
        (p) => p.decision !== 'rejected',
      ).length;
      if (active + files.length > Review.MAX_PHOTOS) {
        this.photoLimitOpen.set(true);
        return;
      }
    }

    // Replace targets a single card — only the first picked file applies.
    const toUpload = target ? files.slice(0, 1) : files;
    for (const file of toUpload) this.uploadOneFile(file, target, null);
  }

  private uploadOneFile(
    file: File,
    target: ReviewPhoto | null,
    labelId: number | null,
  ): void {
    if (!file.type.startsWith('image/')) {
      this.uploadError.set('Only image files are allowed.');
      return;
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      this.uploadError.set('Image must be smaller than 10 MB.');
      return;
    }

    const previewUrl = URL.createObjectURL(file);
    // Use a unique suffix so concurrent uploads from the same pick don't collide.
    const trackingId = target
      ? target.id
      : `uploading-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

    if (!target) {
      this.photos.update((list) => [
        ...list,
        {
          id: trackingId,
          url: previewUrl,
          decision: 'pending',
          primary: false,
        },
      ]);
    }
    this.setPhotoProgress(trackingId, 0);

    this.docs
      .presignedUrl(file.type, labelId)
      .pipe(
        switchMap((res) =>
          this.docs.uploadToS3(res.url, file).pipe(
            tap((p: UploadProgress) =>
              this.setPhotoProgress(trackingId, p.percent),
            ),
            last(),
            map(() => res.id),
          ),
        ),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (attachmentId) => {
          this.clearPhotoProgress(trackingId);
          this.pendingAttachmentIds.update((ids) => [...ids, attachmentId]);
          if (target) {
            this.photos.update((list) =>
              list.map((p) =>
                p.id === target.id ? { ...p, url: previewUrl } : p,
              ),
            );
            this.logAudit('Replaced a photo');
          } else {
            // Record the card's temp ID so the reject button knows it's a new upload.
            this.newPhotoMap.update((m) =>
              new Map(m).set(trackingId, attachmentId),
            );
            this.logAudit('Added a photo');
          }
        },
        error: () => {
          this.clearPhotoProgress(trackingId);
          this.uploadError.set('Upload failed — please try again.');
          URL.revokeObjectURL(previewUrl);
          if (!target) {
            this.photos.update((list) =>
              list.filter((p) => p.id !== trackingId),
            );
          }
        },
      });
  }

  protected toggleFlag(): void {
    this.flagged.update((v) => !v);
    if (this.flagged()) this.logAudit('Flagged map pin for host correction');
  }

  protected approve(): void {
    this.saveAttempted.set(true);
    if (this.validationErrors().length) {
      this.validationModalOpen.set(true);
      return;
    }
    const id = this.id();
    if (!id || this.approving()) return;
    this.approving.set(true);
    this.approveError.set(false);
    this.api
      .markAsActive(id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.approving.set(false);
          this.decision.set('approve');
          this.logAudit('Approved & published');
          // Back to the queue: a moderator works through a list, and the listing they just
          // approved is no longer in it. Leaving them on a published page means their next
          // action is always the back button.
          void this.router.navigate(
            localiseCommands(['/moderator/queue'], this.locale.active()) as unknown[],
          );
        },
        error: () => {
          this.approving.set(false);
          this.approveError.set(true);
        },
      });
  }

  protected decisionMessage(): string {
    return this.decision() === 'approve'
      ? 'Listing approved & published — host notified.'
      : '';
  }

  protected decisionIcon(): string {
    return 'ti-rosette-discount-check';
  }

  protected decisionBannerClass(): string {
    return 'border-ok/30 bg-ok/5 text-ok';
  }

  protected queueTextClass(tone: ReviewDetail['daysInQueueTone']): string {
    return tone === 'danger'
      ? 'text-danger'
      : tone === 'warn'
        ? 'text-warn'
        : 'text-ok';
  }

  /** Up to two initials for the host avatar. */
  protected hostInitials(name: string): string {
    const parts = name
      .trim()
      .split(/\s+/)
      .filter((p) => p && p !== '—');
    if (!parts.length) return '–';
    return parts
      .slice(0, 2)
      .map((p) => p[0].toUpperCase())
      .join('');
  }

  /** Total selected amenities across all categories. */
  protected amenityCount(d: ReviewDetail): number {
    return d.amenities.reduce((n, g) => n + g.items.length, 0);
  }

  /* ── editable amenities accordion ── */
  /** Pre-select the catalogue from the hostel's current offers (matched by slug). */
  private seedAmenities(d: ReviewDetail): void {
    const slugs = new Set(d.selectedOfferSlugs);
    const ids = new Set<string>();
    for (const cat of d.offerCatalog) {
      for (const o of cat.offers) {
        if (slugs.has(o.slug)) ids.add(o.id);
      }
    }
    this.selectedOfferIds.set(ids);
    this.showAll.set(false);
  }
  protected isOfferSelected(id: string): boolean {
    return this.selectedOfferIds().has(id);
  }
  protected toggleOffer(id: string): void {
    this.selectedOfferIds.update((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }
  protected toggleShowAll(): void {
    this.showAll.update((v) => !v);
  }

  // ── room types + floors ──
  protected catSelectedCount(cat: OfferCategory): number {
    return cat.offers.reduce(
      (n, o) => n + (this.selectedOfferIds().has(o.id) ? 1 : 0),
      0,
    );
  }
  protected categoryIcon(name: string): string {
    return CATEGORY_ICONS[name.trim().toLowerCase()] ?? 'ti-tag';
  }
  protected offerIcon(slug: string): string {
    return iconForSlug(slug);
  }

  /** Persist all edits — core fields + amenities + rooms — to the hostel in one request
   *  (`PUT /api/hostels/:id`). Enabled only when something changed. */
  protected save(): void {
    this.saveAttempted.set(true);
    const id = this.id();
    if (
      !id ||
      !this.dirty() ||
      this.saving() ||
      this.uploading() ||
      this.validationErrors().length
    )
      return;
    const snap = this.currentSnapshot();
    const attachmentIds = this.pendingAttachmentIds();
    this.saving.set(true);
    this.saveError.set(false);
    this.saved.set(false);
    const payload: HostelInput = {
      name: snap.name,
      description: snap.description,
      property_type: snap.propertyType as HostelInput['property_type'],
      gender_type: snap.genderType as HostelInput['gender_type'],
      nearby_landmarks: snap.landmarks,
      offer_ids: snap.offerIds,
      total_rooms: this.roomTypes().length || 1,
      room_types_attributes: this.roomTypes().map((rt) => ({
        ...(rt.id != null ? { id: rt.id } : {}),
        name: rt.name,
        capacity: rt.capacity,
        price: rt.price,
      })),
      ...(snap.lat !== null ? { latitude: snap.lat } : {}),
      ...(snap.lng !== null ? { longitude: snap.lng } : {}),
      ...(snap.country ? { country: snap.country } : {}),
      ...(snap.city ? { city: snap.city } : {}),
      ...(snap.state ? { state: snap.state } : {}),
      ...(snap.area ? { area: snap.area } : {}),
      ...(snap.address1 ? { address_1: snap.address1 } : {}),
      ...(attachmentIds.length > 0 ? { attachment_ids: attachmentIds } : {}),
    };
    this.hostels
      .update(id, payload)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.savedSnapshot.set(snap);
          this.pendingAttachmentIds.set([]);
          this.saving.set(false);
          this.saved.set(true);
          this.logAudit('Updated hostel information');
        },
        error: () => {
          this.saving.set(false);
          this.saveError.set(true);
        },
      });
  }

  /** Single-line address assembled from editable location signals (used in the card subtitle). */
  protected readonly locAddressLine = computed(() =>
    [this.locAddress1(), this.locArea(), this.locCity(), this.locState(), this.locCountry()]
      .filter((p) => !!p)
      .join(', '),
  );

  /** City · State · Country line for the address summary panel. */
  protected readonly locCityLine = computed(() =>
    [this.locCity(), this.locState(), this.locCountry()]
      .filter((p) => !!p)
      .join(', '),
  );

  /** True when the listing has usable map coordinates (not blank or 0,0). */
  protected hasCoords(d: ReviewDetail): boolean {
    const lat = Number(d.lat);
    const lng = Number(d.lng);
    return (
      d.lat != null &&
      d.lng != null &&
      Number.isFinite(lat) &&
      Number.isFinite(lng) &&
      !(lat === 0 && lng === 0)
    );
  }

  protected mapsLink(
    lat: number | string | null,
    lng: number | string | null,
  ): string {
    return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
  }

  private logAudit(text: string): void {
    this.audit.update((list) => [
      {
        id: `live-${list.length}`,
        text,
        meta: 'Maria S. · just now',
        dot: 'brand',
      },
      ...list.map((a) => ({ ...a, dot: 'neutral' as const })),
    ]);
  }

  protected retry(): void {
    this.refresh.update((n) => n + 1);
  }
}
