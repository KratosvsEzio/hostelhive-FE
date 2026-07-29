import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  computed,
  effect,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { catchError, of } from 'rxjs';
import {
  HostelDetail,
  HostelEnumOption,
  HostelInput,
  OfferCategory,
} from '@hostelhive/data-access';
import {
  HostelsApi,
  ImageUploadService,
  OffersApi,
} from '@services';
import {
  ACCEPT_ATTR,
  Button,
  Dropdown,
  DropdownOption,
  Input,
  MAX_PHOTOS,
  PhoneInput,
  PhotoGrid,
  PhotoGridPhoto,
  RichText,
  StatusPill,
  imageFormatLabel,
} from '@hostelhive/ui';
import { RoomTypeRow } from '../../moderator/review/room-type-row';
import { LocationPicker, PickedLocation, PlaceSearchField } from '@hostelhive/maps';
import { screenPickedPhotos, screenReplacementPhoto } from '@util/photo-picker';

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

interface EditPhoto {
  id: string;
  url: string;
  primary: boolean;
  format?: string;
}

export interface EditRoomType {
  _key: string;
  id?: number;
  name: string;
  capacity: number;
  price: number;
}

interface EditableHostel {
  name: string;
  description: string;
  landmarks: string;
  propertyType: string;
  genderType: string;
  offerIds: string[];
  email: string;
  phone: string;
  lat: number | null;
  lng: number | null;
  country: string;
  city: string;
  state: string;
  area: string;
  address1: string;
}

@Component({
  selector: 'hh-hostel-form',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    Button,
    Dropdown,
    Input,
    PhoneInput,
    LocationPicker,
    PhotoGrid,
    PlaceSearchField,
    RichText,
    RoomTypeRow,
    StatusPill,
  ],
  templateUrl: './hostel-form.html',
})
export class HostelForm {
  private readonly hostels = inject(HostelsApi);
  private readonly offersApi = inject(OffersApi);
  private readonly imageUpload = inject(ImageUploadService);
  private readonly destroyRef = inject(DestroyRef);

  // ── parent inputs ──
  readonly mode = input.required<'create' | 'edit'>();
  readonly initialData = input<HostelDetail | null>(null);
  readonly saving = input(false);
  readonly showValidation = input(false);

  protected readonly acceptAttr = ACCEPT_ATTR;
  protected readonly cityTypes = ['(cities)'];
  protected readonly ids = { name: 'hh-form-name', landmarks: 'hh-form-landmarks' };

  // ── form options (type / gender / labels) ──
  private readonly formOptions = toSignal(
    this.hostels.formOptions().pipe(
      catchError(() =>
        of({
          genderTypes: [] as HostelEnumOption[],
          propertyTypes: [] as HostelEnumOption[],
          attachmentLabels: [] as { id: number | string; name: string }[],
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

  // ── listing detail signals ──
  readonly name = signal('');
  protected readonly description = signal('');
  protected readonly landmarks = signal('');
  protected readonly propertyType = signal('');
  protected readonly genderType = signal('');
  protected readonly email = signal('');
  protected readonly phone = signal('');

  // ── location signals ──
  protected readonly lat = signal<number | null>(null);
  protected readonly lng = signal<number | null>(null);
  protected readonly country = signal('');
  readonly city = signal('');
  protected readonly province = signal('');
  protected readonly area = signal('');
  protected readonly street = signal('');
  readonly locationPinned = signal(false);

  // ── amenities ──
  protected readonly selectedOfferIds = signal<Set<string>>(new Set());
  protected readonly showAll = signal(false);

  // ── room types ──
  readonly roomTypes = signal<EditRoomType[]>([]);
  private readonly origRoomTypes = signal<EditRoomType[]>([]);
  private readonly removedRts = signal<EditRoomType[]>([]);
  protected readonly addRtOpen = signal(false);
  protected readonly newRtName = signal('');
  protected readonly newRtCapacity = signal(1);
  protected readonly newRtPrice = signal(0);
  protected readonly usedRtNames = computed(() => this.roomTypes().map((rt) => rt.name));
  protected readonly newRtError = computed(() => {
    if (!this.addRtOpen()) return '';
    const name = this.newRtName().trim();
    if (!name) return 'Select a room type.';
    if (name === 'Dormitory') {
      const cap = this.newRtCapacity();
      if (cap < 5) return 'Dormitory capacity must be at least 5.';
      if (cap > 200) return 'Dormitory capacity cannot exceed 200.';
    }
    if (this.newRtPrice() <= 0) return 'Enter a price greater than 0.';
    return '';
  });

  // ── photos ──
  private readonly fileInput = viewChild.required<ElementRef<HTMLInputElement>>('fileInput');
  protected readonly photos = signal<EditPhoto[]>([]);
  protected readonly photoLabelMap = signal<Map<string, string | null>>(new Map());
  private readonly replaceTarget = signal<EditPhoto | null>(null);
  protected readonly uploadingPhotos = signal<Map<string, number>>(new Map());
  readonly uploading = computed(() => this.uploadingPhotos().size > 0);
  protected readonly uploadError = signal<string | null>(null);
  private readonly pendingAttachmentIds = signal<string[]>([]);
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

  // ── public state for parents ──
  readonly amenityCount = computed(() => this.selectedOfferIds().size);
  readonly photoCount = computed(() => this.photos().length);
  readonly roomCount = computed(() => this.roomTypes().length);

  private readonly savedSnapshot = signal<EditableHostel | null>(null);

  private readonly loadedSnapshot = computed<EditableHostel | null>(() => {
    const d = this.initialData();
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
      email: '',
      phone: d.primary_phone ?? '',
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
    email: this.email(),
    phone: this.phone(),
    lat: this.lat(),
    lng: this.lng(),
    country: this.country(),
    city: this.city(),
    state: this.province(),
    area: this.area(),
    address1: this.street(),
  }));

  readonly dirty = computed(() => {
    if (this.mode() !== 'edit') return false;
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

  readonly fieldErrors = computed<Partial<Record<string, string>>>(() => {
    if (this.mode() !== 'create') return {};
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
    if (!this.roomTypes().length) e['rooms'] = 'At least one room type is required';
    if (!this.locationPinned()) e['location'] = 'Pin your hostel location on the map';
    return e;
  });
  readonly isValid = computed(() => Object.keys(this.fieldErrors()).length === 0);

  constructor() {
    effect(() => {
      const d = this.initialData();
      if (!d) return;
      this.name.set(d.name ?? '');
      this.description.set(d.description ?? '');
      this.landmarks.set(d.nearby_landmarks ?? '');
      this.propertyType.set(d.property_type ?? '');
      this.genderType.set(d.gender_type ?? '');
      this.email.set('');
      this.phone.set(d.primary_phone ?? '');
      const lat = d.latitude != null ? Number(d.latitude) : null;
      const lng = d.longitude != null ? Number(d.longitude) : null;
      this.lat.set(Number.isFinite(lat) ? lat : null);
      this.lng.set(Number.isFinite(lng) ? lng : null);
      this.country.set(d.country ?? '');
      this.city.set(d.city ?? '');
      this.province.set(d.state ?? '');
      this.area.set(d.area ?? '');
      this.street.set(d.address_1 ?? '');
      this.locationPinned.set(Number.isFinite(lat) && Number.isFinite(lng));
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
      const rts = (d.room_types ?? []).map((r) => ({
        _key: String(r.id),
        id: r.id,
        name: r.name,
        capacity: r.capacity,
        price: r.price,
      }));
      this.roomTypes.set(rts);
      this.origRoomTypes.set(rts.map((r) => ({ ...r })));
      this.removedRts.set([]);
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

  // ── location ──
  protected onLocationPicked(loc: PickedLocation): void {
    this.lat.set(loc.lat);
    this.lng.set(loc.lng);
    this.country.set(loc.country);
    this.city.set(loc.city);
    this.province.set(loc.province);
    this.area.set(loc.area);
    this.street.set(loc.street);
    this.locationPinned.set(true);
  }

  // ── amenities ──
  private seedAmenities(d: HostelDetail): void {
    const slugs = new Set((d.offers ?? []).map((o) => o.slug));
    const ids = new Set<string>();
    for (const cat of this.catalog())
      for (const o of cat.offers) if (slugs.has(o.slug)) ids.add(o.id);
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

  // ── room types ──
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
  protected removeRt(key: string): void {
    const rt = this.roomTypes().find((r) => r._key === key);
    if (!rt) return;
    if (rt.id != null) this.removedRts.update((list) => [...list, rt]);
    this.roomTypes.update((list) => list.filter((r) => r._key !== key));
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
    const remaining = this.photos();
    if (remaining.length && !remaining.some((p) => p.primary)) {
      this.photos.update((list) => list.map((p, i) => (i === 0 ? { ...p, primary: true } : p)));
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
      this.photos.update((list) => {
        const next = [
          ...list,
          { id: trackingId, url: previewUrl, primary: false, format },
        ];
        if (!next.some((p) => p.primary)) next[0] = { ...next[0], primary: true };
        return next;
      });
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
          }
          this.newPhotoMap.update((m) => new Map(m).set(target?.id ?? trackingId, attachmentId));
        },
        error: () => {
          this.clearPhotoProgress(trackingId);
          this.uploadError.set('Upload failed — please try again.');
          URL.revokeObjectURL(previewUrl);
          if (!target) this.photos.update((list) => list.filter((p) => p.id !== trackingId));
        },
      });
  }

  // ── payload assembly ──
  getPayload(): HostelInput {
    const snap = this.currentSnapshot();
    const attachmentIds = this.pendingAttachmentIds();
    const primary = this.photos().find((p) => p.primary);
    const bannerId = primary ? (this.newPhotoMap().get(primary.id) ?? primary.id) : undefined;
    const currentRts = this.roomTypes();

    return {
      name: snap.name,
      description: snap.description,
      property_type: snap.propertyType as HostelInput['property_type'],
      gender_type: snap.genderType as HostelInput['gender_type'],
      nearby_landmarks: snap.landmarks || undefined,
      offer_ids: snap.offerIds,
      total_rooms: currentRts.length || 1,
      room_types_attributes: [
        ...currentRts.map((rt) => ({
          ...(rt.id != null ? { id: rt.id } : {}),
          name: rt.name,
          capacity: rt.capacity,
          price: rt.price,
        })),
        ...this.removedRts()
          .filter((rt) => rt.id != null)
          .map((rt) => ({ id: rt.id!, name: rt.name, capacity: rt.capacity, price: rt.price, _destroy: true as const })),
      ],
      ...(snap.lat != null ? { latitude: snap.lat } : {}),
      ...(snap.lng != null ? { longitude: snap.lng } : {}),
      ...(snap.country ? { country: snap.country } : {}),
      ...(snap.city ? { city: snap.city } : {}),
      ...(snap.state ? { state: snap.state } : {}),
      ...(snap.area ? { area: snap.area } : {}),
      ...(snap.address1 ? { address_1: snap.address1 } : {}),
      ...(attachmentIds.length > 0 ? { attachment_ids: attachmentIds } : {}),
      ...(bannerId ? { banner_id: bannerId as unknown as number } : {}),
      ...(snap.email ? { email: snap.email } : {}),
      ...(snap.phone ? { primary_phone: snap.phone } : {}),
    };
  }

  // Called by edit parent after a successful save.
  onSaveSuccess(hostel: HostelDetail): void {
    this.savedSnapshot.set(this.currentSnapshot());
    this.pendingAttachmentIds.set([]);
    this.newPhotoMap.set(new Map());
    const serverRts = (hostel.room_types ?? []).map((r) => ({
      _key: String(r.id),
      id: r.id,
      name: r.name,
      capacity: r.capacity,
      price: r.price,
    }));
    this.roomTypes.set(serverRts);
    this.origRoomTypes.set(serverRts.map((r) => ({ ...r })));
    this.removedRts.set([]);
  }
}
