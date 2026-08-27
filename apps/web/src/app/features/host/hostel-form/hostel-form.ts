import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  computed,
  effect,
  inject,
  input,
  linkedSignal,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed, toObservable, toSignal } from '@angular/core/rxjs-interop';
import { catchError, of, switchMap } from 'rxjs';
import {
  EMPTY_HOSTEL_FORM_OPTIONS,
  HostelDetail,
  HostelEnumOption,
  HostelFormOptions,
  HostelInput,
  iconForSlug,
  OfferCategory,
} from '@hostelhive/data-access';
import {
  HostelsApi,
  HostOpsApi,
  ImageUploadService,
  OffersApi,
} from '@services';
import {
  ACCEPT_ATTR,
  Button,
  CollapsibleCard,
  ConfirmModal,
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
import { PhotoPicker } from '@app/shared/photo-picker/photo-picker';
import { LocationPicker, PickedLocation } from '@hostelhive/maps';
import { screenPickedPhotos, screenReplacementPhoto } from '@util/photo-picker';
import { DEFAULT_CURRENCY_CODE } from '@util/currencies';
import { CurrencyPreference } from '@core/preferences/currency-preference';
import { TranslocoPipe } from '@jsverse/transloco';
import { CurrencySelect } from '@app/shared/currency/currency-select';
import {
  DEFAULT_OCCUPANCY_TYPE,
  defaultOccupancyFrom,
  occupancyOptionsFrom,
  discountError,
  isValidDiscount,
} from '@util/occupancy-type';
import { MAX_ROOM_IMAGES, MIN_ROOM_CAPACITY, RoomImage } from '@util/room-types';
import {
  BILLING_CONFLICT_ERROR,
  conflicts,
  gateBillingOptions,
} from '@util/billing-frequency';

/** Stands in for the not-yet-added row, which has no `_key` until it is committed. */
const NEW_RT_KEY = '__new__';

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

/**
 * A room type from the API, as the form edits it.
 *
 * The new fields fall back rather than assuming: a response that predates them yields a
 * shared room with no discount and booking switched off, which is the safe reading of every
 * absent value — a room never becomes bookable because a field was missing.
 */
function toEditRoomType(r: {
  id: number;
  name: string;
  capacity: number;
  price: number;
}): EditRoomType {
  const raw = r as typeof r & {
    description?: string | null;
    occupancy_type?: string;
    discounted_price?: number | null;
    is_discountable?: boolean;
    is_bookable?: boolean;
    attachments?: { id: string; url?: string; object_url?: string }[] | null;
  };
  return {
    _key: String(r.id),
    id: r.id,
    name: r.name,
    capacity: r.capacity,
    price: r.price,
    occupancyType: raw.occupancy_type ?? DEFAULT_OCCUPANCY_TYPE,
    discountedPrice: raw.discounted_price ?? null,
    discountEnabled: raw.is_discountable ?? false,
    bookable: raw.is_bookable ?? false,
    description: raw.description ?? '',
    images: (raw.attachments ?? [])
      .map((a) => ({ id: String(a.id), url: a.url ?? a.object_url ?? '' }))
      .filter((a) => !!a.url)
      // Trimmed on read as well as on write: a row that already holds four photos, however
      // it got that way, should not render a fourth tile the form cannot save.
      .slice(0, MAX_ROOM_IMAGES),
  };
}

/**
 * One room in the "move these first" list, with the outcome of its own update.
 *
 * Status per row rather than one flag for the dialog: the host moves them one at a time and
 * has to be able to see which of five succeeded and which needs another go. A failed row
 * keeps its selection so retrying is one click, not a re-pick.
 */
interface RoomMoveRow {
  /** Room hashid, as the update path needs it. */
  id: string;
  number: string;
  floor: string;
  /** Chosen replacement room type, as its server id. */
  targetId: string | null;
  status: 'idle' | 'saving' | 'done' | 'error';
  error: string;
}

export interface EditRoomType {
  _key: string;
  id?: number;
  name: string;
  capacity: number;
  price: number;
  /** `private` | `shared` — how the room is sold, and what its price is per. */
  occupancyType: string;
  /** Optional. When set and enabled, it is the price charged. Must be strictly below `price`. */
  discountedPrice: number | null;
  /** Whether that discount is live. Off keeps the figure without applying it. */
  discountEnabled: boolean;
  description: string;
  /** Up to MAX_ROOM_IMAGES. Their ids become `attachment_ids` on save. */
  images: RoomImage[];
  /** The host's online-booking toggle. Off unless they opt in. */
  bookable: boolean;
}

/**
 * Everything about a room type that counts as an edit.
 *
 * Named as a type so the fingerprint below cannot drift: it is an `Omit`, so adding a field
 * to {@link EditRoomType} breaks the build there until the field is either compared or
 * deliberately excluded. The previous hand-written list compared four fields and had been
 * left behind by six, which is why changing a discount, a description, or how a room is sold
 * left the Save button greyed out with no way to find out why.
 *
 * `_key` is excluded because it identifies a row in the UI rather than describing it, and
 * `images` because a presigned url can differ between loads — the ids are what actually
 * change when a photo is added or removed.
 */
type RoomTypeFingerprint = Omit<EditRoomType, '_key' | 'images'> & {
  imageIds: string[];
};

interface EditableHostel {
  name: string;
  description: string;
  landmarks: string;
  propertyType: string;
  genderType: string;
  billingFrequency: string;
  currency: string;
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

/** The collapsible sections of the profile, in the order they appear. */
type FormSection = 'details' | 'photos' | 'amenities' | 'roomTypes' | 'location';

/**
 * Which validation keys live in which section. Used to force a section open when it holds
 * an error being shown — otherwise "fix the errors below" can point at a collapsed field
 * the host cannot see.
 */
const SECTION_ERROR_KEYS: Record<FormSection, readonly string[]> = {
  details: ['name', 'city', 'email', 'phone', 'description', 'billingFrequency'],
  photos: [],
  amenities: [],
  roomTypes: ['rooms'],
  location: ['location'],
};

@Component({
  selector: 'hh-hostel-form',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    Button,
    CollapsibleCard,
    Dropdown,
    Input,
    PhoneInput,
    LocationPicker,
    PhotoGrid,
    PhotoPicker,
    RichText,
    RoomTypeRow,
    StatusPill,
    CurrencySelect,
    ConfirmModal,
    TranslocoPipe,
  ],
  templateUrl: './hostel-form.html',
})
export class HostelForm {
  private readonly hostels = inject(HostelsApi);
  private readonly offersApi = inject(OffersApi);
  private readonly imageUpload = inject(ImageUploadService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly hostOps = inject(HostOpsApi);

  /**
   * The hostel being edited, or null while creating one.
   *
   * Only edit mode can reach the delete dialog's API call — a hostel that does not exist
   * yet has no rooms to count.
   */
  private readonly hostelId = computed(() => {
    const id = this.initialData()?.id;
    return id != null ? String(id) : null;
  });

  // ── parent inputs ──
  readonly mode = input.required<'create' | 'edit'>();
  readonly initialData = input<HostelDetail | null>(null);
  readonly saving = input(false);
  readonly showValidation = input(false);

  /**
   * Demand every field, not only the ones an existing record can break.
   *
   * `mode: 'edit'` deliberately checks almost nothing: a host opening their profile should not
   * be told off for a field their listing was created without, years of records predate any
   * given rule, and a form that opens covered in red is a form nobody reads.
   *
   * Approval is the opposite situation. A moderator is deciding whether this listing goes
   * live, and there "required" means required — the checklist that gates Approve & publish is
   * the same set of rules, asked of a record rather than a draft.
   */
  readonly requireComplete = input(false);

  protected readonly acceptAttr = ACCEPT_ATTR;
  protected readonly ids = { name: 'hh-form-name' };

  /**
   * The enum choices to offer, when the parent already has them.
   *
   * Left null, the form asks `/api/hostels/new` itself — which is right for the host console
   * and wrong everywhere else. Moderation has its own `…/moderator/hostels/new`, and a form
   * that picks its own endpoint can only ever live on one screen. Passing them in is what
   * lets both consoles render *this* form instead of maintaining a second one.
   */
  readonly options = input<HostelFormOptions | null>(null);

  /**
   * Whether a moderator is looking at this, rather than the hostel's own host.
   *
   * One difference, and it is about photos. A host removing a photo is deleting their own
   * picture; a moderator "removing" one is *rejecting* it — the host has to be told which and
   * why, and the decision has to be undoable until the review is submitted. So under
   * moderation the delete control asks instead of acting: it emits {@link photoRejectRequested}
   * and the review screen runs its own confirm-with-reason, feeding the result back through
   * {@link rejectedPhotos}. Everything else on this form behaves identically for both.
   */
  readonly moderating = input(false);

  /** Rejected photo id → the reason shown to the host. Overlays the grid; moderation only. */
  readonly rejectedPhotos = input<ReadonlyMap<string, string>>(new Map());

  /** A moderator pressed remove: the review screen decides what that means. */
  readonly photoRejectRequested = output<string>();

  /** A moderator undid a rejection from the grid's own Undo control. */
  readonly photoRejectUndone = output<string>();

  // ── form options (type / gender / labels) ──
  private readonly formOptions = toSignal(
    toObservable(this.options).pipe(
      switchMap((given) =>
        given
          ? of(given)
          : this.hostels.formOptions().pipe(catchError(() => of(EMPTY_HOSTEL_FORM_OPTIONS))),
      ),
    ),
    { initialValue: EMPTY_HOSTEL_FORM_OPTIONS },
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
  /**
   * The amenity catalogue, when the parent already has it — same reasoning as {@link options}.
   * The review screen loads it alongside the listing and would otherwise fetch it twice.
   */
  readonly catalogue = input<OfferCategory[] | null>(null);

  protected readonly catalog = toSignal(
    toObservable(this.catalogue).pipe(
      switchMap((given) =>
        given
          ? of(given)
          : this.offersApi.categories().pipe(catchError(() => of([] as OfferCategory[]))),
      ),
    ),
    { initialValue: [] as OfferCategory[] },
  );

  // ── listing detail signals ──
  readonly name = signal('');
  protected readonly description = signal('');
  protected readonly landmarks = signal('');
  protected readonly propertyType = signal('');
  protected readonly genderType = signal('');
  /**
   * Seeded from the host's preferred currency, which is only ever a starting point: an
   * existing hostel overwrites it with whatever it was saved in (see the load below), so
   * opening someone else's listing never quietly reprices it.
   */
  protected readonly currency = signal(inject(CurrencyPreference).code());
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
  /**
   * What a new room type is "Sold as" before the host touches the field.
   *
   * Linked to the offered list rather than set to a slug compiled into this file: the
   * options arrive after the form renders, so a plain initial value is a guess made before
   * the answer exists, and a guess the backend does not list renders as a blank dropdown.
   * A choice the host has already made survives the list arriving; anything else re-seeds
   * from it. See `defaultOccupancyFrom` for which one it picks.
   */
  protected readonly newRtOccupancy = linkedSignal<DropdownOption[], string>({
    source: () => this.occupancyOptions(),
    computation: (options, previous) =>
      previous && options.some((o) => o.value === previous.value)
        ? previous.value
        : defaultOccupancyFrom(options),
  });

  /**
   * How this hostel prices everything — one value for the whole property, and a hostel field
   * on the backend rather than something copied onto every room at save.
   *
   * Backend slugs are `month` and `day`; the product says "nightly" and translates here.
   */
  protected readonly billingFrequency = signal<string>('month');
  /**
   * From `GET /api/hostels/new`, like every other enum on this form.
   *
   * The hardcoded pair is only a fallback for a failed options call — it keeps the control
   * usable rather than rendering an empty dropdown a host cannot get past, and the slugs match
   * what the endpoint returns.
   */
  protected readonly billingOptions = computed<DropdownOption[]>(() => {
    const fromApi = this.formOptions().billingFrequencyTypes;
    const base: DropdownOption[] = fromApi.length
      ? fromApi.map((b) => ({ value: b.slug, label: `Per ${b.name.toLowerCase()}` }))
      : [
          { value: 'month', label: 'Per month' },
          { value: 'night', label: 'Per night' },
        ];
    return gateBillingOptions(base, this.genderType());
  });

  /**
   * How a room is sold, as the backend says it can be.
   *
   * Every room-type row on this form shares one list, so a host cannot be offered different
   * choices on two rows of the same hostel.
   */
  protected readonly occupancyOptions = computed<DropdownOption[]>(() =>
    occupancyOptionsFrom(this.formOptions().occupancyTypes),
  );

  /** The conflict message, or empty. Read from `fieldErrors` so the note and the save agree. */
  protected readonly billingConflict = computed(
    () => this.fieldErrors()['billingFrequency'] ?? '',
  );

  protected readonly newRtDiscount = signal<number | null>(null);
  protected readonly newRtDiscountEnabled = signal(false);
  protected readonly newRtDescription = signal('');
  protected readonly newRtImages = signal<RoomImage[]>([]);

  /**
   * Photo uploads still in flight, counted per room-type key, so only that row's tile spins.
   *
   * A count rather than "the row that is uploading": three photos picked at once start three
   * uploads on one row, and a single key clears on the first to land — the tile would go still
   * with two still climbing, and those two slots would read as free.
   */
  private readonly rtUploads = signal<Record<string, number>>({});
  /**
   * Upload failures, per room-type key, so the message sits on the row it belongs to.
   *
   * Keyed rather than one string shown while that row uploads, which meant it was never shown:
   * the failure clears the uploading flag the message was rendered behind.
   */
  private readonly rtImageErrors = signal<Record<string, string>>({});
  protected readonly newRtBookable = signal(false);
  protected readonly usedRtNames = computed(() => this.roomTypes().map((rt) => rt.name));
  protected readonly newRtError = computed(() => {
    if (!this.addRtOpen()) return '';
    const name = this.newRtName().trim();
    if (!name) return 'Give this room a name.';
    if (this.newRtCapacity() < MIN_ROOM_CAPACITY) return 'Capacity must be at least 1.';
    if (this.newRtPrice() <= 0) return 'Enter a price greater than 0.';
    // Checked here as well as in the row: this is the only path that creates a room type,
    // and an invalid pair reaching the payload is worse than an early message.
    if (!isValidDiscount(this.newRtPrice(), this.newRtDiscount())) {
      return discountError(this.newRtPrice(), this.newRtDiscount(), this.currency());
    }
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
      rejected: this.rejectedPhotos().has(p.id),
      rejectReason: this.rejectedPhotos().get(p.id),
    })),
  );
  protected readonly atPhotoLimit = computed(() => this.photos().length >= MAX_PHOTOS);

  /**
   * Photos the hostel can still take — what the picker may accept in one go.
   *
   * No separate count of uploads in flight, unlike the room-type rows: a photo appears in this
   * grid the moment its upload starts, so `photos()` already includes the ones still climbing.
   */
  protected readonly freePhotoSlots = computed(() =>
    Math.max(0, MAX_PHOTOS - this.photos().length),
  );

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
      billingFrequency:
        (d as typeof d & { billing_frequency?: string }).billing_frequency ?? 'month',
      currency: d.currency ?? DEFAULT_CURRENCY_CODE,
      offerIds: [...offerIds].sort(),
      email: d.email ?? '',
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
    billingFrequency: this.billingFrequency(),
    currency: this.currency(),
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
    const key = (r: EditRoomType): RoomTypeFingerprint => ({
      id: r.id,
      name: r.name,
      capacity: r.capacity,
      price: r.price,
      occupancyType: r.occupancyType,
      discountedPrice: r.discountedPrice,
      discountEnabled: r.discountEnabled,
      description: r.description,
      bookable: r.bookable,
      imageIds: r.images.map((i) => i.id),
    });
    return JSON.stringify(curr.map(key)) !== JSON.stringify(orig.map(key));
  });

  readonly fieldErrors = computed<Partial<Record<string, string>>>(() => {
    const e: Record<string, string> = {};

    // Checked in both modes, unlike everything below it. The rest describe a hostel being
    // filled in; this one describes a pair that is wrong however the hostel got here, and
    // the hostels that have it were saved before the rule existed. Skipping it on edit would
    // leave the only screen that can reach the conflict as the only one that cannot flag it.
    if (conflicts(this.genderType(), this.billingFrequency()))
      e['billingFrequency'] = BILLING_CONFLICT_ERROR;

    // A malformed address is wrong whoever is looking and whatever mode this is in — unlike
    // the rules below, which are about a record being *finished*.
    const emailVal = this.email().trim();
    if (emailVal && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailVal))
      e['email'] = 'Enter a valid email address';

    if (this.mode() !== 'create' && !this.requireComplete()) return e;
    if (!this.name().trim()) e['name'] = 'Hostel name is required';
    if (!this.city().trim()) e['city'] = 'City is required';

    // Creating asks for both. Approving asks only that there is *some* way to reach the
    // hostel: an existing listing predates this pair being editable at all, and refusing to
    // publish one that carries a phone number but no email would block it on a field its
    // host was never shown.
    if (this.mode() === 'create') {
      if (!emailVal) e['email'] = 'Contact email is required';
      if (!this.phone().trim()) e['phone'] = 'Primary phone is required';
    } else if (!emailVal && !this.phone().trim()) {
      e['contact'] = 'A contact email or phone number is required';
    }
    const descText = this.description().replace(/<[^>]*>/g, '').trim();
    if (!descText) e['description'] = 'Description is required';
    if (!this.roomTypes().length) e['rooms'] = 'At least one room type is required';
    if (!this.locationPinned()) e['location'] = 'Pin your hostel location on the map';
    // Only asked of a record being approved: a draft gets photos before it is submitted, and
    // nagging for one on an empty create form is noise. See `requireComplete`.
    if (this.requireComplete() && !this.photoCount()) e['photos'] = 'At least one photo is required';
    return e;
  });
  readonly isValid = computed(() => Object.keys(this.fieldErrors()).length === 0);

  /** Sections the host has collapsed. Empty by default, so everything starts expanded. */
  private readonly collapsedSections = signal<ReadonlySet<FormSection>>(
    new Set<FormSection>(),
  );

  /**
   * A section is open unless the host collapsed it — except while it holds a validation
   * error being shown, which forces it open. A hidden error is an error the host cannot
   * act on, and the save button would just keep refusing with nothing visible to fix.
   */
  protected sectionOpen(section: FormSection): boolean {
    if (this.sectionHasError(section)) return true;
    return !this.collapsedSections().has(section);
  }

  protected setSectionOpen(section: FormSection, open: boolean): void {
    this.collapsedSections.update((current) => {
      const next = new Set(current);
      if (open) next.delete(section);
      else next.add(section);
      return next;
    });
  }

  private sectionHasError(section: FormSection): boolean {
    if (!this.showValidation()) return false;
    const errors = this.fieldErrors();
    return SECTION_ERROR_KEYS[section].some((key) => !!errors[key]);
  }

  constructor() {
    effect(() => {
      const d = this.initialData();
      if (!d) return;
      this.name.set(d.name ?? '');
      this.description.set(d.description ?? '');
      this.landmarks.set(d.nearby_landmarks ?? '');
      this.propertyType.set(d.property_type ?? '');
      this.genderType.set(d.gender_type ?? '');
      this.billingFrequency.set(
        (d as typeof d & { billing_frequency?: string }).billing_frequency ?? 'month',
      );
      this.currency.set(d.currency ?? DEFAULT_CURRENCY_CODE);
      this.email.set(d.email ?? '');
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
      const rts = (d.room_types ?? []).map(toEditRoomType);
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
  /**
   * Ignores a cleared value rather than falling back to empty.
   *
   * Every room's price is a bare number whose meaning comes from this field, so a hostel with
   * no cycle at all prices nothing — unlike gender, which can legitimately be unset.
   */
  protected setBillingFrequency(v: string | string[] | null): void {
    if (typeof v === 'string' && v) this.billingFrequency.set(v);
  }
  protected setCurrency(v: string | string[] | null): void {
    if (typeof v === 'string' && v) this.currency.set(v);
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
  protected offerIcon(slug: string): string {
    return iconForSlug(slug);
  }

  // ── room types ──
  protected updateRt(
    key: string,
    field:
      | 'name'
      | 'capacity'
      | 'price'
      | 'occupancyType'
      | 'discountedPrice'
      | 'discountEnabled'
      | 'description'
      | 'bookable',
    value: string | number | boolean | null,
  ): void {
    this.roomTypes.update((list) =>
      list.map((rt) => (rt._key === key ? { ...rt, [field]: value } : rt)),
    );
  }

  /**
   * Rooms whose discount is not a discount, named so the section can refuse to save.
   *
   * The row shows its own inline message; this is what stops an invalid pair reaching the
   * payload from a row the host has scrolled past.
   */
  protected readonly rtDiscountErrors = computed(() =>
    this.roomTypes().filter((rt) => !isValidDiscount(rt.price, rt.discountedPrice)),
  );
  protected openAddRt(): void {
    this.addRtOpen.set(true);
    this.newRtName.set('');
    this.newRtCapacity.set(1);
    this.newRtPrice.set(0);
    this.newRtOccupancy.set(defaultOccupancyFrom(this.occupancyOptions()));
    this.newRtDiscount.set(null);
    this.newRtDiscountEnabled.set(false);
    this.newRtDescription.set('');
    this.newRtImages.set([]);
    this.setRtImageError(NEW_RT_KEY, '');
    this.newRtBookable.set(false);
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
      {
        _key: `new-${Date.now()}`,
        name,
        capacity: cap,
        price,
        occupancyType: this.newRtOccupancy(),
        discountedPrice: this.newRtDiscount(),
        discountEnabled: this.newRtDiscountEnabled(),
        description: this.newRtDescription(),
        images: this.newRtImages(),
        bookable: this.newRtBookable(),
      },
    ]);
    this.closeAddRt();
  }
  /**
   * Uploads a picked photo and attaches its id to the room type.
   *
   * `key` is `null` for the not-yet-added row, which has no key of its own yet. The cap is
   * re-checked here as well as in the row: the picker is hidden at three, but a slow upload
   * could otherwise let a fourth in behind it.
   */
  protected onRtImagePicked(key: string | null, file: File): void {
    if (this.rtFreeSlots(key) <= 0) return;
    const slot = key ?? NEW_RT_KEY;

    this.setRtImageError(slot, '');
    this.bumpRtUploads(slot, 1);
    this.imageUpload.upload('attachments', file).subscribe({
      next: (res) => {
        const image: RoomImage = { id: res.id, url: res.url };
        if (key) {
          this.roomTypes.update((list) =>
            list.map((r) =>
              r._key === key ? { ...r, images: [...r.images, image] } : r,
            ),
          );
        } else {
          this.newRtImages.update((list) => [...list, image]);
        }
        this.bumpRtUploads(slot, -1);
      },
      error: () => {
        this.setRtImageError(slot, 'That photo could not be uploaded. Please try again.');
        this.bumpRtUploads(slot, -1);
      },
    });
  }

  /** Whether this row has a photo on its way up. */
  protected rtUploading(key: string | null): boolean {
    return (this.rtUploads()[key ?? NEW_RT_KEY] ?? 0) > 0;
  }

  protected rtImageError(key: string | null): string {
    return this.rtImageErrors()[key ?? NEW_RT_KEY] ?? '';
  }

  /**
   * Photos this row can still take, counting the ones already on their way up.
   *
   * In-flight uploads count because three photos picked together arrive as three calls before
   * any of them lands: without them the cap would read as free three times over and let a
   * fourth through behind a slow upload.
   */
  protected rtFreeSlots(key: string | null): number {
    const current = key
      ? (this.roomTypes().find((r) => r._key === key)?.images ?? [])
      : this.newRtImages();
    const slot = key ?? NEW_RT_KEY;
    return Math.max(0, MAX_ROOM_IMAGES - current.length - (this.rtUploads()[slot] ?? 0));
  }

  private bumpRtUploads(slot: string, delta: number): void {
    this.rtUploads.update((m) => ({ ...m, [slot]: Math.max(0, (m[slot] ?? 0) + delta) }));
  }

  private setRtImageError(slot: string, message: string): void {
    this.rtImageErrors.update((m) => ({ ...m, [slot]: message }));
  }

  protected onRtImageRemoved(key: string | null, id: string): void {
    if (key) {
      this.roomTypes.update((list) =>
        list.map((r) =>
          r._key === key ? { ...r, images: r.images.filter((i) => i.id !== id) } : r,
        ),
      );
    } else {
      this.newRtImages.update((list) => list.filter((i) => i.id !== id));
    }
  }

  /* ------------------------------------------------- deleting a room type */

  /**
   * The room type the host is trying to delete, held while we find out what it costs.
   *
   * Deleting used to be immediate. That is safe for a row nobody has built on and quietly
   * destructive for one that carries rooms — the `_destroy` goes out with the save and the
   * rooms go with it, with nothing on screen having said so.
   */
  protected readonly rtPendingDelete = signal<EditRoomType | null>(null);

  /** null while the room list is still in flight. */
  protected readonly rtRooms = signal<RoomMoveRow[] | null>(null);
  protected readonly rtLoadFailed = signal(false);

  /**
   * Where a room can go: every other room type that exists on the server.
   *
   * Unsaved rows are excluded — they have no id yet, so nothing can be moved onto them
   * until the hostel has been saved at least once.
   */
  protected readonly rtReplacementOptions = computed<DropdownOption[]>(() => {
    const pending = this.rtPendingDelete();
    return this.roomTypes()
      .filter((rt) => rt._key !== pending?._key && rt.id != null)
      .map((rt) => ({ value: String(rt.id), label: rt.name || 'Untitled room type' }));
  });

  protected readonly rtNeedsMoves = computed(() => (this.rtRooms()?.length ?? 0) > 0);

  /** Nowhere to put them, so the delete cannot go ahead at all. */
  protected readonly rtDeleteBlocked = computed(
    () => this.rtNeedsMoves() && this.rtReplacementOptions().length === 0,
  );

  protected readonly rtMovedCount = computed(
    () => this.rtRooms()?.filter((r) => r.status === 'done').length ?? 0,
  );

  /**
   * The delete waits until the last room has actually moved.
   *
   * Not "every row has a selection" — a chosen replacement that failed to save is still a
   * room pointing at the type about to be destroyed.
   */
  protected readonly rtDeleteReady = computed(() => {
    const rooms = this.rtRooms();
    if (rooms == null || this.rtLoadFailed()) return false;
    return rooms.every((r) => r.status === 'done');
  });

  /**
   * The "move everything here" shortcut above the list.
   *
   * Most hostels are deleting a type whose rooms all go to the same place, and picking the
   * same option six times is the kind of work a form should do for you. It only fills the
   * rows in — each room is still updated on its own button, so a host who wants two of them
   * somewhere else just changes those two afterwards.
   *
   * Rows that already moved are left alone: their dropdown describes what happened, not what
   * is planned, and rewriting it would claim a room went somewhere it did not.
   */
  protected readonly rtBulkTarget = signal<string | null>(null);

  protected onBulkTargetPick(v: string | string[] | null): void {
    const target = typeof v === 'string' && v ? v : null;
    this.rtBulkTarget.set(target);
    if (!target) return;
    this.rtRooms.update((rows) =>
      (rows ?? []).map((r) =>
        r.status === 'done' || r.status === 'saving'
          ? r
          : { ...r, targetId: target, status: 'idle' as const, error: '' },
      ),
    );
  }

  protected onRoomTargetPick(roomId: string, v: string | string[] | null): void {
    const target = typeof v === 'string' && v ? v : null;
    this.rtRooms.update((rows) =>
      (rows ?? []).map((r) =>
        r.id === roomId ? { ...r, targetId: target, status: 'idle' as const, error: '' } : r,
      ),
    );
  }

  private patchRoom(roomId: string, patch: Partial<RoomMoveRow>): void {
    this.rtRooms.update((rows) =>
      (rows ?? []).map((r) => (r.id === roomId ? { ...r, ...patch } : r)),
    );
  }

  /**
   * Moves one room, now rather than on save.
   *
   * Per row because the host is choosing per row: batching them behind the save would hide
   * which of five moves was the one that failed, and a partial batch is exactly the state
   * this dialog exists to prevent.
   */
  protected updateRoomRow(row: RoomMoveRow): void {
    const hostelId = this.hostelId();
    if (!hostelId || !row.targetId || row.status === 'saving' || row.status === 'done') return;

    this.patchRoom(row.id, { status: 'saving', error: '' });
    this.hostOps
      .updateRoom(hostelId, row.id, { room_type_id: row.targetId })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => this.patchRoom(row.id, { status: 'done', error: '' }),
        error: () =>
          this.patchRoom(row.id, {
            status: 'error',
            error: "Couldn't move this room. Try again.",
          }),
      });
  }

  protected cancelRemoveRt(): void {
    this.rtPendingDelete.set(null);
    this.rtRooms.set(null);
    this.rtLoadFailed.set(false);
    this.rtBulkTarget.set(null);
  }

  protected confirmRemoveRt(): void {
    const rt = this.rtPendingDelete();
    if (!rt || !this.rtDeleteReady()) return;
    this.dropRt(rt._key);
    this.cancelRemoveRt();
  }

  /**
   * Asks what the delete would cost before doing any of it.
   *
   * A room type that was never saved cannot have rooms on it, so it skips the round trip
   * and the dialog entirely — there is nothing to warn about and nothing to move.
   */
  protected removeRt(key: string): void {
    const rt = this.roomTypes().find((r) => r._key === key);
    if (!rt) return;
    if (rt.id == null) {
      this.dropRt(key);
      return;
    }

    this.rtPendingDelete.set(rt);
    this.rtRooms.set(null);
    this.rtLoadFailed.set(false);
    this.rtBulkTarget.set(null);

    const hostelId = this.hostelId();
    if (!hostelId) {
      this.rtLoadFailed.set(true);
      return;
    }
    this.hostOps
      .roomsOfType(hostelId, rt.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (rooms) =>
          this.rtRooms.set(
            rooms.map((r) => ({
              id: r.id,
              number: r.number,
              floor: r.floor,
              targetId: null,
              status: 'idle' as const,
              error: '',
            })),
          ),
        error: () => this.rtLoadFailed.set(true),
      });
  }

  /** The removal itself, once every room has been rehoused. */
  private dropRt(key: string): void {
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
    // Under moderation, removing a photo the *host* uploaded is a rejection: it needs a
    // reason, the host is told, and it can be undone — all of which belong to the review
    // screen, so ask rather than act. A photo the moderator uploaded a moment ago is their
    // own and is simply deleted, which is why this looks at the pending-upload map first.
    if (this.moderating() && this.newPhotoMap().get(photo.id) === undefined) {
      this.photoRejectRequested.emit(photo.id);
      return;
    }
    const s3 = this.newPhotoMap().get(photo.id);
    // Freeing a slot makes "only two more fit" untrue, so the message goes with the photo.
    this.uploadError.set(null);
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

  /**
   * A photo chosen through the picker — file or camera, one path from here. A batch arrives as
   * one call per file, and each is in the grid before the next lands, so the count below stays
   * right without anything having to track the batch.
   *
   * The picker screens type, size and the free-slot count itself now that it is told how many
   * are left; the shared screen stays as the backstop, since it is what every other way into
   * this grid goes through.
   */
  protected onPickedPhoto(file: File): void {
    const { accepted, error } = screenPickedPhotos([file], this.photos().length);
    this.uploadError.set(error);
    for (const f of accepted) this.uploadOneFile(f, null);
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
      billing_frequency: snap.billingFrequency,
      currency: snap.currency,
      nearby_landmarks: snap.landmarks || undefined,
      offer_ids: snap.offerIds,
      total_rooms: currentRts.length || 1,
      room_types_attributes: [
        ...currentRts.map((rt) => ({
          ...(rt.id != null ? { id: rt.id } : {}),
          name: rt.name,
          capacity: rt.capacity,
          price: rt.price,
          occupancy_type: rt.occupancyType,
          // Both travel, always. The price is kept even while the switch is off, which is
          // what lets a host end a promotion and restart it later without retyping it.
          description: rt.description || undefined,
          discounted_price: rt.discountedPrice,
          is_discountable: rt.discountEnabled,
          attachment_ids: rt.images.map((i) => i.id),
          is_bookable: rt.bookable,
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
    const serverRts = (hostel.room_types ?? []).map(toEditRoomType);
    this.roomTypes.set(serverRts);
    this.origRoomTypes.set(serverRts.map((r) => ({ ...r })));
    this.removedRts.set([]);
  }
}
