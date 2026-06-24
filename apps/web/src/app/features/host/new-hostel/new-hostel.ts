import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  ElementRef,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { DecimalPipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { catchError, of } from 'rxjs';
import { AttachmentLabel, HostelInput, OfferCategory } from '@hostelhive/data-access';
import { HostelsApi, OffersApi } from '@services';
import {
  Button,
  Card,
  ConfirmModal,
  Dropdown,
  DropdownOption,
  Input,
  PhoneInput,
  PhotoGrid,
  PhotoGridPhoto,
  RichText,
} from '@hostelhive/ui';
import { LocationPicker, PickedLocation, PlaceSearchField } from '@hostelhive/maps';
import { DashboardLayout } from '@layout/dashboard-layout/dashboard-layout';

type GenderType = 'boys' | 'girls' | 'co-living';

interface MediaItem {
  id: number;
  label: string;
  primary: boolean;
  url?: string;
  file?: File;
}

interface RoomEntry {
  id: number;
  type: string;
  capacity: number;
  price: number;
}

function isValidImage(f: File): boolean {
  return (f.type === 'image/png' || f.type === 'image/jpeg') && f.size <= 10 * 1024 * 1024;
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
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  // ── dropdown options ──
  protected readonly roomTypes = [
    'Single room',
    'Double sharing',
    'Triple sharing',
    'Quad sharing',
    'Dormitory',
  ];
  protected readonly roomTypeOptions: DropdownOption[] = this.roomTypes.map((t) => ({
    value: t,
    label: t,
  }));
  protected readonly genderOptions: DropdownOption[] = [
    { value: 'boys', label: 'Boys' },
    { value: 'girls', label: 'Girls' },
    { value: 'co-living', label: 'Co-living' },
  ];
  protected readonly cityTypes = ['(cities)'];

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

  protected readonly photoGridItems = computed<PhotoGridPhoto[]>(() =>
    this.media()
      .filter((m) => !!m.url)
      .map((m) => ({ id: String(m.id), url: m.url!, primary: m.primary })),
  );

  // ── room types ──
  private roomId = 0;
  protected readonly rooms = signal<RoomEntry[]>([]);
  protected readonly newRoomType = signal(this.roomTypes[0]);
  protected readonly newRoomCapacity = signal(1);
  protected readonly newRoomPrice = signal(0);

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
    this.uploadError.set(null);
    if (target) {
      const file = files[0];
      if (!isValidImage(file)) {
        this.uploadError.set('Only PNG/JPG images under 10 MB are allowed.');
        return;
      }
      if (target.url?.startsWith('blob:')) URL.revokeObjectURL(target.url);
      this.media.update((items) =>
        items.map((m) =>
          m.id === target.id ? { ...m, url: URL.createObjectURL(file), file, label: file.name } : m,
        ),
      );
    } else {
      const valid = files.filter(isValidImage);
      if (!valid.length) return;
      this.media.update((items) => {
        const next = [...items];
        for (const file of valid) {
          next.push({ id: ++this.mediaId, label: file.name, primary: false, url: URL.createObjectURL(file), file });
        }
        if (!next.some((m) => m.primary)) next[0] = { ...next[0], primary: true };
        return next;
      });
    }
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
  protected addRoom(): void {
    this.rooms.update((list) => [
      ...list,
      {
        id: ++this.roomId,
        type: this.newRoomType(),
        capacity: Math.max(1, this.newRoomCapacity()),
        price: Math.max(0, this.newRoomPrice()),
      },
    ]);
  }
  protected removeRoom(id: number): void {
    this.rooms.update((list) => list.filter((r) => r.id !== id));
  }
  protected setRoomType(v: string | string[] | null): void {
    if (typeof v === 'string' && v) this.newRoomType.set(v);
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
    if (this.saving()) return;
    this.saving.set(true);
    this.apiErrors.set([]);
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
