// Hostel domain — request/response contracts for the authenticated /api/hostels endpoints
// (app/controllers/api/hostels_controller.rb + the AMS serializers and the Elastic index).
// Built from the backend source; shapes mirror app/serializers/*.rb and
// app/models/concerns/elastic_indexes/hostel_index.rb.
//
// Envelope: success → { ...payload, success: true }; error → { success: false, errors: string[] }.
//
// Two read shapes (important): `index` returns the Elasticsearch `_source`
// (HostelSearchResult — flatter, `host: {id,name}`, a geo `location`, `_score`), while
// show/edit/create/update use HostelSerializer (HostelDetail — richer, nested associations).
//
// Enums: the Rails enum getters return the *slug strings*, so both shapes carry
// `gender_type: 'co-living'|'boys'|'girls'` and `property_type` as a slug — NOT the integer.
// (The seeker-facing `AccommodationType` in ./listing uses 'coliving'; the API slug is hyphenated.)

/** Hostel gender enum slugs (Rails: { "co-living": 0, boys: 1, girls: 2 }). */
export type HostelGenderType = 'co-living' | 'boys' | 'girls';
/** Hostel property enum slugs (Rails: { apartment: 0, room: 1, building: 2, house: 3 }). */
export type HostelPropertyType = 'apartment' | 'room' | 'building' | 'house';

/** An enum option from GET /api/hostels/new (id = backend integer, slug + display name). */
export interface HostelEnumOption {
  id: number;
  slug: string;
  name: string;
}

// ── shared nested association shapes ─────────────────────────────────────────

/** UserSerializer. */
export interface HostelUser {
  id: number;
  name: string;
  email: string;
  phone?: string | null;
  is_active: boolean;
}

export interface ColorTokens {
  primary?: string | null;
  secondary?: string | null;
  tertiary?: string | null;
}

/** StatusSerializer. */
export interface HostelStatus {
  id: number;
  name: string;
  slug: string;
  color?: ColorTokens | null;
}

/** DispositionSerializer (embeds its status). */
export interface HostelDisposition {
  id: number;
  reference_number?: string | null;
  name: string;
  slug: string;
  position?: number | null;
  color?: ColorTokens | null;
  status?: HostelStatus | null;
}

/** Embedded offer / category ref inside a HostelOffer. */
export interface OfferRef {
  id: number;
  name: string;
  slug: string;
}

/** HostelOfferSerializer — the hostel↔offer join with its offer + category. */
export interface HostelOffer {
  id: number;
  created_at: string;
  updated_at: string;
  offer?: OfferRef | null;
  offer_category?: OfferRef | null;
}

/** AttachmentLabelSerializer. */
export interface AttachmentLabel {
  id: number | string;
  name: string;
  description?: string | null;
}

/** AttachmentSerializer. */
export interface HostelAttachment {
  /** UUID string or integer depending on the serializer build. */
  id: number | string;
  file_name?: string | null;
  content_type?: string | null;
  attachment_type?: string | null;
  key?: string | null;
  status?: string | null;
  /** Whether this attachment is the primary/banner image. */
  is_primary?: boolean | null;
  url?: string | null;
  variants?: Record<string, string> | null;
  attached_id?: number | null;
  attached_type?: string | null;
  attachment_data?: unknown;
  processing_status?: string | null;
  attachment_label?: AttachmentLabel | null;
}

/** RoomTypeSerializer. */
export interface RoomType {
  id: number;
  name: string;
  description?: string | null;
  capacity: number;
  price: number;
  /**
   * `shared` | `private_room` — how this room is sold. See `@util/occupancy-type`.
   *
   * The wire has always carried it; this contract did not, so every screen that needed it
   * declared its own local shape and read it through that instead.
   */
  occupancy_type?: string | null;
  created_at: string;
  updated_at: string;
}

/** RoomSerializer (the nested `room_type` is included; back-ref to hostel omitted to avoid cycles). */
export interface HostelRoom {
  id: number;
  room_number?: string | null;
  capacity: number;
  current_occupancy: number;
  hostel_id: number;
  room_type_id?: number | null;
  created_at: string;
  updated_at: string;
  room_type?: RoomType | null;
}

// ── detail hostel (HostelSerializer) — show / edit / create / update ──────────

/**
 * GET /api/hostels/:id, /edit, POST, PATCH/PUT → `{ hostel: HostelDetail }`.
 * Mirrors HostelSerializer. NOTE: that serializer does NOT declare `:id`, so the raw
 * payload may omit it — `HostelsApi` guarantees `id` by merging the requested id back in.
 * Decimal columns (latitude/longitude) can serialize as strings in Rails JSON.
 */
export interface HostelDetail {
  id: number;
  name: string;
  description?: string | null;
  gender_type: HostelGenderType;
  property_type: HostelPropertyType;
  total_rooms: number;
  total_floors: number;
  address_1: string;
  address_2?: string | null;
  city: string;
  state: string;
  country: string;
  area: string;
  latitude: number | string | null;
  longitude: number | string | null;
  min_price: number;
  max_price: number;
  /** ISO-4217 code the hostel's prices are quoted in (e.g. 'PKR', 'USD'). */
  currency?: string | null;
  /**
   * How a seeker reaches this hostel.
   *
   * `HostelInput` has always accepted an `email`; this side never declared one, so the form
   * could send an address and never read it back. Optional because it is not certain every
   * serializer returns it — a blank field is the same thing the form showed before either way.
   */
  email?: string | null;
  primary_phone: string;
  secondary_phone?: string | null;
  nearby_landmarks?: string | null;
  availed_trial?: boolean | null;
  /** Queued-for-review timestamp — when the host submitted the listing; null until submitted. */
  q_at?: string | null;
  /** Record creation timestamp (present on most builds of HostelSerializer). */
  created_at?: string | null;
  updated_at?: string | null;
  host?: HostelUser | null;
  manager?: HostelUser | null;
  hostel_offers: HostelOffer[];
  /** Flat list of the hostel's selected offers (amenities) — HostelSerializer `offers`. */
  offers?: {
    id: number | string;
    name: string;
    slug: string;
    icon?: string | null;
  }[];
  attachments: HostelAttachment[];
  banner: HostelAttachment[]; // has_many :banner → array
  room_types: RoomType[];
  rooms: HostelRoom[];
  status?: HostelStatus | null;
  disposition?: HostelDisposition | null;
}

// ── search hostel (Elasticsearch `_source`) — index ──────────────────────────

/**
 * GET /api/hostels → `{ hostels: HostelSearchResult[], pagination }`.
 * The Elasticsearch `_source` (search_data in HostelIndex) — flatter than HostelDetail,
 * with `host: {id,name}` and a `location` geo-point, plus the relevance `_score`.
 */
export interface HostelSearchResult {
  id: number;
  description?: string | null;
  address_1?: string | null;
  address_2?: string | null;
  city?: string | null;
  state?: string | null;
  country?: string | null;
  area?: string | null;
  gender_type: HostelGenderType;
  property_type: HostelPropertyType;
  total_rooms?: number | null;
  total_floors?: number | null;
  starting_price?: number | null; // search "from" price (min_price/max_price deprecated)
  latitude?: number | string | null;
  longitude?: number | string | null;
  nearby_landmarks?: string | null;
  created_at?: string | null;
  host?: { id: number; name: string } | null;
  status?: HostelStatus | null;
  disposition?: HostelDisposition | null;
  location?: { lat: number | null; lon: number | null } | null;
  attachments?: HostelAttachment[];
  _score?: number | null;
}

/** The Rails `pagination` envelope (Pagy via Searchkick). */
export interface HostelPagination {
  current_page: number;
  next_page: number | null;
  prev_page: number | null;
  total_pages: number;
  total_count: number;
}

// ── contract / subscription (ContractSerializer) ─────────────────────────────

/** Embedded product ref (Contract/Payment `product`). */
export interface ProductRef {
  id: number;
  product_type?: string | null;
  price?: number | null;
  name?: string | null;
  currency?: string | null;
  duration?: number | null;
}

/** PaymentSerializer (cyclic back-refs to hostel/contract intentionally omitted). */
export interface HostelPayment {
  id: number;
  amount?: number | null;
  transaction_id?: string | null;
  payment_method?: string | null;
  currency?: string | null;
  created_at?: string | null;
  paid_at?: string | null;
  product?: ProductRef | null;
  host?: HostelUser | null;
  status?: HostelStatus | null;
  disposition?: HostelDisposition | null;
}

/**
 * GET /api/hostels/:id/current_subscription → `{ subscription: HostelSubscription | null }`.
 * The hostel's most recent contract (ContractSerializer); `null` when none exists.
 */
export interface HostelSubscription {
  id: number;
  contract_type?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  price?: number | null;
  created_at?: string | null;
  updated_at?: string | null;
  product?: ProductRef | null;
  host?: HostelUser | null;
  hostel?: HostelDetail | null;
  status?: HostelStatus | null;
  disposition?: HostelDisposition | null;
  payment?: HostelPayment | null;
}

// ── request bodies (create / update) — Rails strong-params (hostel_params) ────

/** A nested hostel_offers_attributes row (accepts_nested_attributes_for). */
export interface HostelOfferInput {
  id?: number;
  offer_id: number;
  _destroy?: boolean;
}
/** A nested room_types_attributes row. */
/**
 * A nested `room_types_attributes` row, matching the backend's permitted params.
 *
 * The five named tiers are gone: `name` is now free text the host writes ("Deluxe 6 Bed
 * Private Ensuite"), and the axis a seeker shops on is `occupancy_type`.
 */
export interface RoomTypeInput {
  id?: number;
  name: string;
  description?: string;
  capacity: number;
  price: number;
  /**
   * `private` | `shared`. Private rooms sell whole rooms; shared rooms sell beds — which is
   * what makes the same `price` mean per-room on one row and per-bed on the next.
   */
  occupancy_type?: string;
  /** Optional. When set, this is the price charged. Must be strictly below `price`. */
  discounted_price?: number | null;
  /** Whether the discount is live. Derived from `discounted_price` rather than set by hand. */
  is_discountable?: boolean;
  /** The host's online-booking toggle. A room that is not bookable never reaches the picker. */
  is_bookable?: boolean;
  /** Room photos. Capped at 3 by the form. */
  attachment_ids?: (number | string)[];
  _destroy?: boolean;
}
/** A nested rooms_attributes row. */
export interface RoomInput {
  id?: number;
  room_number?: string;
  room_type_id?: number;
  capacity?: number;
  current_occupancy?: number;
  _destroy?: boolean;
}

/** The permitted fields of `hostel_params`. Enums accept the slug or the integer. */
export interface HostelInput {
  name?: string;
  description?: string;
  gender_type?: HostelGenderType | number;
  property_type?: HostelPropertyType | number;
  /**
   * `month` | `night` — how this hostel prices everything.
   *
   * A hostel field, not a per-room one. Pricing one room monthly and another nightly would be
   * incoherent to a seeker comparing them, and holding the rule here makes a mixed hostel
   * unrepresentable rather than merely rejected on save.
   *
   * The frontend says "nightly" and translates at this boundary — see `util/pricing-period`.
   */
  billing_frequency?: string;
  total_rooms?: number;
  total_floors?: number;
  address_1?: string;
  address_2?: string;
  email?: string;
  city?: string;
  state?: string;
  country?: string;
  area?: string;
  latitude?: number | string;
  longitude?: number | string;
  min_price?: number;
  max_price?: number;
  /** ISO-4217 currency code the hostel's prices are quoted in. */
  currency?: string;
  primary_phone?: string;
  secondary_phone?: string;
  nearby_landmarks?: string;
  manager_id?: number | null;
  notes?: string;
  banner_id?: number | null;
  hostel_offers_attributes?: HostelOfferInput[];
  room_types_attributes?: RoomTypeInput[];
  rooms_attributes?: RoomInput[];
  attachment_ids?: (number | string)[];
  /** Selected amenity/offer ids — Rails' has_many `offer_ids=` setter replaces the whole set. */
  offer_ids?: (number | string)[];
}

/** Request body for create/update — Rails expects the payload nested under `hostel`. */
export interface HostelWriteRequest {
  hostel: HostelInput;
}

/** Typed query for GET /api/hostels (cancan-scoped to the caller's hostels). */
export interface HostelSearchQuery {
  page?: number;
  /** Server param is `limit` (per_page); backend default is 30. */
  limit?: number;
  city?: string;
  gender_type?: HostelGenderType | number;
  property_type?: HostelPropertyType | number;
  /** Map viewport — emitted as `f[bounding][...]`. */
  bounds?: { north: number; south: number; east: number; west: number };
  /** Sort map, e.g. `{ id: 'desc' }` (backend default). */
  sort?: Record<string, 'asc' | 'desc'>;
}

// ── raw response envelopes (success → { ...payload, success: true }) ──────────

export interface HostelListResponse {
  success: boolean;
  hostels: HostelSearchResult[];
  pagination: HostelPagination;
  errors?: string[];
}
export interface HostelResponse {
  success: boolean;
  hostel?: HostelDetail;
  errors?: string[];
}
/**
 * The enum choices a hostel form offers, once an endpoint has answered.
 *
 * Named because two dashboards answer it from two different endpoints — `/api/hostels/new` for
 * the host console, `/api/moderator/hostels/new` for review — and the form takes whichever its
 * parent hands it rather than picking an endpoint on their behalf. That is the whole reason
 * one form can serve both consoles instead of the two drifting into different sets of fields.
 */
export interface HostelFormOptions {
  genderTypes: HostelEnumOption[];
  propertyTypes: HostelEnumOption[];
  billingFrequencyTypes: HostelEnumOption[];
  occupancyTypes: HostelEnumOption[];
  attachmentLabels: AttachmentLabel[];
}

/** What a form shows while the options are in flight, or after the call failed. */
export const EMPTY_HOSTEL_FORM_OPTIONS: HostelFormOptions = {
  genderTypes: [],
  propertyTypes: [],
  billingFrequencyTypes: [],
  occupancyTypes: [],
  attachmentLabels: [],
};

export interface HostelFormOptionsResponse {
  success: boolean;
  gender_types: HostelEnumOption[];
  property_types: HostelEnumOption[];
  /**
   * `month` | `night` — how a hostel prices everything.
   *
   * Both spellings are declared because the endpoint sends the singular and this contract has
   * always asked for the plural, so `billingFrequencyTypes` has in fact been empty every time
   * and the form has been running on its hardcoded fallback. Reading either is what makes that
   * stop being true without betting on which one a given deploy sends.
   */
  billing_frequency_type?: HostelEnumOption[];
  billing_frequency_types?: HostelEnumOption[];
  /** `shared` | `private_room` — how one room type is sold. Singular, like the key above. */
  occupancy_type?: HostelEnumOption[];
  occupancy_types?: HostelEnumOption[];
  attachment_labels?: AttachmentLabel[];
  errors?: string[];
}
export interface HostelRoomTypesResponse {
  success: boolean;
  room_types: RoomType[];
  errors?: string[];
}
export interface HostelSubscriptionResponse {
  success: boolean;
  subscription?: HostelSubscription | null;
  errors?: string[];
}
