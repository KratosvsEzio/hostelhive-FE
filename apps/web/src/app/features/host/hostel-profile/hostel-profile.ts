import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  computed,
  effect,
  inject,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { toObservable, toSignal, takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import { catchError, map, of, startWith, switchMap } from 'rxjs';
import {
  HostelDetail,
  HostelEnumOption,
  HostelInput,
  OfferCategory,
} from '@hostelhive/data-access';
import {
  HostelsApi,
  HostPropertyStore,
  ImageUploadService,
  OffersApi,
} from '@services';
import {
  ACCEPT_ATTR,
  Button,
  Dropdown,
  DropdownOption,
  ErrorState,
  MAX_PHOTOS,
  PhotoGrid,
  PhotoGridPhoto,
  RichText,
  Skeleton,
  StatusPill,
  imageFormatLabel,
} from '@hostelhive/ui';
import { RoomTypeRow } from '../../moderator/review/room-type-row';
import { LocationPicker, PickedLocation } from '@hostelhive/maps';
import { DashboardLayout } from '@layout/dashboard-layout/dashboard-layout';
import { isNetworkError } from '@util/network-error';
import { screenPickedPhotos, screenReplacementPhoto } from '@util/photo-picker';

/** "BUILDING" → "Building". */
function toLabel(name: string): string {
  return name.charAt(0).toUpperCase() + name.slice(1).toLowerCase();
}

/** Amenity-category name → Tabler icon (catalogue has no icon field). */
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
  data: HostelDetail | null;
}

/** Local editable photo card. */
interface EditPhoto {
  id: string;
  url: string;
  primary: boolean;
  /** Short format name, shown when the browser can't decode the local preview. */
  format?: string;
}

/** A room type in the editable list (client-side _key for @for tracking). */
interface EditRoomType {
  _key: string;
  id?: number;
  name: string;
  capacity: number;
  price: number;
}

/** Snapshot used for the dirty check (core fields + location + selected offers). */
interface EditableHostel {
  name: string;
  description: string;
  landmarks: string;
  propertyType: string;
  genderType: string;
  offerIds: string[];
  lat: number | null;
  lng: number | null;
  country: string;
  city: string;
  state: string;
  area: string;
  address1: string;
}

/**
 * Host · Hostel profile — the same hostel editor the moderator/admin review page uses
 * (listing details, photos, amenities catalogue, location), scoped to the host's own
 * active hostel and without the moderation tools (approve / audit / decisions). Loads
 * via GET /api/hostels/:id/edit and saves via PUT /api/hostels/:id (`HostelInput`).
 */
@Component({
  selector: 'hh-hostel-profile',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DashboardLayout,
    Button,
    Dropdown,
    ErrorState,
    LocationPicker,
    PhotoGrid,
    RichText,
    RoomTypeRow,
    Skeleton,
    StatusPill,
  ],
  templateUrl: './hostel-profile.html',
})
export class HostelProfile {
  private readonly hostels = inject(HostelsApi);
  private readonly offersApi = inject(OffersApi);
  private readonly imageUpload = inject(ImageUploadService);
  private readonly store = inject(HostPropertyStore);
  private readonly destroyRef = inject(DestroyRef);
  private readonly route = inject(ActivatedRoute);

  /** Hostel id from the parent URL :hostelId param — drives loading and saves. */
  protected readonly hostelId = toSignal(
    this.route.parent!.paramMap.pipe(map((pm) => pm.get('hostelId') ?? '')),
    { initialValue: this.store.selected() },
  );

  private readonly refresh = signal(0);

  // Keep the sidebar property picker in sync whenever the URL id changes.
  private readonly _syncStore = effect(() => {
    const id = this.hostelId();
    if (id && id !== untracked(() => this.store.selected())) {
      this.store.setProperty(id);
    }
  });

  protected readonly ids = {
    name: 'hh-hp-name',
    landmarks: 'hh-hp-landmarks',
  };
  protected readonly acceptAttr = ACCEPT_ATTR;

  protected readonly state = toSignal(
    toObservable(computed(() => ({ id: this.hostelId(), r: this.refresh() }))).pipe(
      switchMap(({ id }) => {
        if (!id) return of<ViewState>({ loading: false, error: false, networkError: false, data: null });
        return this.hostels.getForEdit(id).pipe(
          map((data): ViewState => ({ loading: false, error: false, networkError: false, data })),
          startWith<ViewState>({ loading: true, error: false, networkError: false, data: null }),
          catchError((err) => of<ViewState>({ loading: false, error: true, networkError: isNetworkError(err), data: null })),
        );
      }),
    ),
    { initialValue: { loading: true, error: false, networkError: false, data: null } as ViewState },
  );

  // ── form options (type / gender) + amenity catalogue ──
  private readonly formOptions = toSignal(
    this.hostels.formOptions().pipe(
      catchError(() =>
        of({
          genderTypes: [] as HostelEnumOption[],
          propertyTypes: [] as HostelEnumOption[],
          attachmentLabels: [],
        }),
      ),
    ),
    {
      initialValue: {
        genderTypes: [] as HostelEnumOption[],
        propertyTypes: [] as HostelEnumOption[],
        attachmentLabels: [] as { id: number | string; name: string }[],
      },
    },
  );
  protected readonly typeOptions = computed<DropdownOption[]>(() =>
    this.formOptions().propertyTypes.map((t) => ({ value: t.slug, label: toLabel(t.name) })),
  );
  protected readonly genderOptions = computed<DropdownOption[]>(() =>
    this.formOptions().genderTypes.map((g) => ({ value: g.slug, label: toLabel(g.name) })),
  );
  protected readonly labelOptions = computed<DropdownOption[]>(() =>
    this.formOptions().attachmentLabels.map((l) => ({ value: String(l.id), label: l.name })),
  );
  protected readonly catalog = toSignal(
    this.offersApi.categories().pipe(catchError(() => of([] as OfferCategory[]))),
    { initialValue: [] as OfferCategory[] },
  );

  // ── editable state ──
  protected readonly name = signal('');
  protected readonly description = signal('');
  protected readonly landmarks = signal('');
  protected readonly propertyType = signal('');
  protected readonly genderType = signal('');

  protected readonly locLat = signal<number | null>(null);
  protected readonly locLng = signal<number | null>(null);
  protected readonly locCountry = signal('');
  protected readonly locCity = signal('');
  protected readonly locState = signal('');
  protected readonly locArea = signal('');
  protected readonly locAddress1 = signal('');

  protected readonly selectedOfferIds = signal<Set<string>>(new Set());
  protected readonly showAll = signal(false);

  // ── room types ──
  protected readonly roomTypes = signal<EditRoomType[]>([]);
  private readonly origRoomTypes = signal<EditRoomType[]>([]);
  protected readonly addRtOpen = signal(false);
  protected readonly newRtName = signal('');
  protected readonly newRtCapacity = signal(1);
  protected readonly newRtPrice = signal(0);

  // ── photos ──
  private readonly fileInput = viewChild.required<ElementRef<HTMLInputElement>>('fileInput');
  protected readonly photos = signal<EditPhoto[]>([]);
  protected readonly photoLabelMap = signal<Map<string, string | null>>(new Map());
  private readonly replaceTarget = signal<EditPhoto | null>(null);
  protected readonly uploadingPhotos = signal<Map<string, number>>(new Map());
  protected readonly uploading = computed(() => this.uploadingPhotos().size > 0);
  protected readonly uploadError = signal<string | null>(null);
  /** Attachment ids from completed uploads, flushed on the next save. */
  private readonly pendingAttachmentIds = signal<string[]>([]);
  /** temp card id → S3 attachment id for photos added this session. */
  private readonly newPhotoMap = signal<Map<string, string>>(new Map());

  protected readonly photoGridItems = computed<PhotoGridPhoto[]>(() =>
    this.photos().map((p) => ({
      id: p.id,
      url: p.url,
      primary: p.primary,
      format: p.format,
      uploadProgress: this.uploadingPhotos().get(p.id),
      rejected: false,
    })),
  );
  protected readonly atPhotoLimit = computed(() => this.photos().length >= MAX_PHOTOS);

  // ── save state ──
  protected readonly saving = signal(false);
  protected readonly saved = signal(false);
  protected readonly saveError = signal(false);
  private readonly savedSnapshot = signal<EditableHostel | null>(null);

  constructor() {
    // Seed the editable copy whenever the hostel detail (re)loads.
    effect(() => {
      const d = this.state().data;
      if (!d) return;
      this.name.set(d.name ?? '');
      this.description.set(d.description ?? '');
      this.landmarks.set(d.nearby_landmarks ?? '');
      this.propertyType.set(d.property_type ?? '');
      this.genderType.set(d.gender_type ?? '');
      const lat = d.latitude != null ? Number(d.latitude) : null;
      const lng = d.longitude != null ? Number(d.longitude) : null;
      this.locLat.set(Number.isFinite(lat) ? lat : null);
      this.locLng.set(Number.isFinite(lng) ? lng : null);
      this.locCountry.set(d.country ?? '');
      this.locCity.set(d.city ?? '');
      this.locState.set(d.state ?? '');
      this.locArea.set(d.area ?? '');
      this.locAddress1.set(d.address_1 ?? '');
      this.photos.set(
        (d.attachments ?? [])
          .filter((a) => a.url)
          .map((a) => ({ id: String(a.id), url: a.url as string, primary: !!a.is_primary })),
      );
      this.photoLabelMap.set(
        new Map(
          (d.attachments ?? []).map((a) => [
            String(a.id),
            a.attachment_label ? String(a.attachment_label.id) : null,
          ]),
        ),
      );
      this.pendingAttachmentIds.set([]);
      this.newPhotoMap.set(new Map());
      this.savedSnapshot.set(null);
      this.saved.set(false);
      this.saveError.set(false);
      const rts = (d.room_types ?? []).map((r) => ({
        _key: String(r.id),
        id: r.id,
        name: r.name,
        capacity: r.capacity,
        price: r.price,
      }));
      this.roomTypes.set(rts);
      this.origRoomTypes.set(rts.map((r) => ({ ...r })));
      this.seedAmenities(d);
    });
  }

  // ── core field setters ──
  protected asValue(e: Event): string {
    return (e.target as HTMLInputElement | HTMLTextAreaElement).value;
  }
  protected setType(v: string | string[] | null): void {
    this.propertyType.set(typeof v === 'string' ? v : '');
  }
  protected setGender(v: string | string[] | null): void {
    this.genderType.set(typeof v === 'string' ? v : '');
  }

  protected onLocationPicked(loc: PickedLocation): void {
    this.locLat.set(loc.lat);
    this.locLng.set(loc.lng);
    this.locCountry.set(loc.country);
    this.locCity.set(loc.city);
    this.locState.set(loc.province);
    this.locArea.set(loc.area);
    this.locAddress1.set(loc.street);
  }

  protected readonly locCityLine = computed(() =>
    [this.locCity(), this.locState(), this.locCountry()].filter((p) => !!p).join(', '),
  );
  protected mapsLink(lat: number | null, lng: number | null): string {
    return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
  }

  // ── amenities ──
  private seedAmenities(d: HostelDetail): void {
    const slugs = new Set((d.offers ?? []).map((o) => o.slug));
    const ids = new Set<string>();
    for (const cat of this.catalog())
      for (const o of cat.offers) if (slugs.has(o.slug)) ids.add(o.id);
    // Fall back to ids directly if the catalogue hasn't loaded yet.
    if (ids.size === 0)
      for (const o of d.offers ?? []) ids.add(String(o.id));
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
  protected catSelectedCount(cat: OfferCategory): number {
    return cat.offers.reduce((n, o) => n + (this.selectedOfferIds().has(o.id) ? 1 : 0), 0);
  }
  protected categoryIcon(name: string): string {
    return CATEGORY_ICONS[name.trim().toLowerCase()] ?? 'ti-tag';
  }

  // ── photos ──
  protected findPhoto(id: string): EditPhoto | undefined {
    return this.photos().find((p) => p.id === id);
  }
  protected addPhoto(): void {
    this.replaceTarget.set(null);
    this.fileInput().nativeElement.click();
  }
  protected replace(photo: EditPhoto): void {
    this.replaceTarget.set(photo);
    this.fileInput().nativeElement.click();
  }
  protected setPrimary(photo: EditPhoto): void {
    this.photos.update((list) => list.map((p) => ({ ...p, primary: p.id === photo.id })));
  }
  protected removePhoto(photo: EditPhoto): void {
    const s3 = this.newPhotoMap().get(photo.id);
    this.photos.update((list) => list.filter((p) => p.id !== photo.id));
    if (s3 !== undefined) {
      this.pendingAttachmentIds.update((ids) => ids.filter((id) => id !== s3));
      this.newPhotoMap.update((m) => {
        const n = new Map(m);
        n.delete(photo.id);
        return n;
      });
    }
  }
  protected setPhotoLabel(photo: EditPhoto, v: string | string[] | null): void {
    const labelId = typeof v === 'string' ? v : null;
    this.photoLabelMap.update((m) => new Map(m).set(photo.id, labelId));
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

  protected onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    input.value = '';
    const target = this.replaceTarget();
    this.replaceTarget.set(null);
    if (!files.length) return;
    const { accepted, error } = target
      ? screenReplacementPhoto(files[0])
      : screenPickedPhotos(files, this.photos().length);
    this.uploadError.set(error);
    for (const file of accepted) this.uploadOneFile(file, target);
  }

  private uploadOneFile(file: File, target: EditPhoto | null): void {
    const format = imageFormatLabel(file);
    const previewUrl = URL.createObjectURL(file);
    const trackingId = target
      ? target.id
      : `uploading-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    if (!target) {
      this.photos.update((list) => [
        ...list,
        { id: trackingId, url: previewUrl, primary: false, format },
      ]);
    }
    this.setPhotoProgress(trackingId, 0);
    this.imageUpload
      .upload('attachments', file, (percent) => this.setPhotoProgress(trackingId, percent))
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: ({ id: attachmentId }) => {
          this.clearPhotoProgress(trackingId);
          this.pendingAttachmentIds.update((ids) => [...ids, attachmentId]);
          if (target) {
            this.photos.update((list) =>
              list.map((p) => (p.id === target.id ? { ...p, url: previewUrl, format } : p)),
            );
            this.newPhotoMap.update((m) => new Map(m).set(target.id, attachmentId));
          } else {
            this.newPhotoMap.update((m) => new Map(m).set(trackingId, attachmentId));
          }
        },
        error: () => {
          this.clearPhotoProgress(trackingId);
          this.uploadError.set('Upload failed — please try again.');
          URL.revokeObjectURL(previewUrl);
          if (!target) this.photos.update((list) => list.filter((p) => p.id !== trackingId));
        },
      });
  }

  // ── dirty check + save ──
  private readonly loadedSnapshot = computed<EditableHostel | null>(() => {
    const d = this.state().data;
    if (!d) return null;
    const slugs = new Set((d.offers ?? []).map((o) => o.slug));
    const offerIds = new Set<string>();
    for (const cat of this.catalog())
      for (const o of cat.offers) if (slugs.has(o.slug)) offerIds.add(o.id);
    const lat = d.latitude != null ? Number(d.latitude) : null;
    const lng = d.longitude != null ? Number(d.longitude) : null;
    return {
      name: d.name ?? '',
      description: d.description ?? '',
      landmarks: d.nearby_landmarks ?? '',
      propertyType: d.property_type ?? '',
      genderType: d.gender_type ?? '',
      offerIds: [...offerIds].sort(),
      lat: Number.isFinite(lat) ? lat : null,
      lng: Number.isFinite(lng) ? lng : null,
      country: d.country ?? '',
      city: d.city ?? '',
      state: d.state ?? '',
      area: d.area ?? '',
      address1: d.address_1 ?? '',
    };
  });
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
  protected readonly dirty = computed(() => {
    if (this.pendingAttachmentIds().length > 0) return true;
    const base = this.savedSnapshot() ?? this.loadedSnapshot();
    if (!base) return false;
    if (JSON.stringify(base) !== JSON.stringify(this.currentSnapshot())) return true;
    const orig = this.origRoomTypes();
    const curr = this.roomTypes();
    if (orig.length !== curr.length) return true;
    const key = (r: EditRoomType) => ({ id: r.id, name: r.name, capacity: r.capacity, price: r.price });
    return JSON.stringify(curr.map(key)) !== JSON.stringify(orig.map(key));
  });

  protected save(): void {
    const id = this.hostelId();
    if (!id || !this.dirty() || this.saving() || this.uploading()) return;
    const snap = this.currentSnapshot();
    const attachmentIds = this.pendingAttachmentIds();
    const primary = this.photos().find((p) => p.primary);
    const bannerId = primary ? (this.newPhotoMap().get(primary.id) ?? primary.id) : undefined;
    this.saving.set(true);
    this.saveError.set(false);
    this.saved.set(false);
    const currentRts = this.roomTypes();
    const payload: HostelInput = {
      name: snap.name,
      description: snap.description,
      property_type: snap.propertyType as HostelInput['property_type'],
      gender_type: snap.genderType as HostelInput['gender_type'],
      nearby_landmarks: snap.landmarks,
      offer_ids: snap.offerIds,
      total_rooms: currentRts.length || 1,
      room_types_attributes: currentRts.map((rt) => ({
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
      ...(bannerId ? { banner_id: bannerId as unknown as number } : {}),
    };
    this.hostels
      .update(id, payload)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (hostel) => {
          this.savedSnapshot.set(snap);
          this.pendingAttachmentIds.set([]);
          this.saving.set(false);
          this.saved.set(true);
          // Sync room types from server so new types get their IDs
          const serverRts = (hostel.room_types ?? []).map((r) => ({
            _key: String(r.id),
            id: r.id,
            name: r.name,
            capacity: r.capacity,
            price: r.price,
          }));
          this.roomTypes.set(serverRts);
          this.origRoomTypes.set(serverRts.map((r) => ({ ...r })));
        },
        error: () => {
          this.saving.set(false);
          this.saveError.set(true);
        },
      });
  }

  // ── room type inline edit / add ──
  protected updateRt(key: string, field: 'name' | 'capacity' | 'price', value: string | number): void {
    this.roomTypes.update((list) =>
      list.map((rt) => (rt._key === key ? { ...rt, [field]: value } : rt)),
    );
  }

  protected openAddRt(): void {
    this.addRtOpen.set(true);
    this.newRtName.set('');
    this.newRtCapacity.set(1);
    this.newRtPrice.set(0);
  }

  protected closeAddRt(): void {
    this.addRtOpen.set(false);
  }

  protected confirmAddRt(): void {
    const name = this.newRtName().trim();
    const cap = this.newRtCapacity();
    const price = this.newRtPrice();
    if (!name || cap < 1) return;
    this.roomTypes.update((list) => [
      ...list,
      { _key: `new-${Date.now()}`, name, capacity: cap, price },
    ]);
    this.closeAddRt();
  }

  protected retry(): void {
    this.refresh.update((n) => n + 1);
  }
}
