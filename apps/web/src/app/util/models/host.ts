// Local domain models for the host console shell.
// **Stub pending Q-API (§0)** — these mirror the shapes the host endpoints are
// expected to return; swap the fixture-backed service for the typed SDK later.

/** Lifecycle of a host's property listing. */
export type ListingStatus = 'onboarding' | 'in-review' | 'published' | 'paused';

import { AccommodationType } from './listing';

/**
 * Re-exported rather than redeclared. This was a separate union of the same three values
 * that never gained `backpacker`, so a host viewing their own backpacker property had it
 * typed as something it is not.
 */
export type PropertyAccommodationType = AccommodationType;

/** A single property owned by the signed-in host. */
/** A room type as the hostel list returns it — the same shape the host form edits. */
export interface HostListingRoomType {
  id: string;
  name: string;
  capacity: number;
  price: number;
  discountedPrice: number;
  isDiscountable: boolean;
  isBookable: boolean;
  /** `private` | `shared`. */
  occupancyType: string;
}

export interface HostListing {
  id: string;
  name: string;
  area: string;
  city: string;
  accommodationType: PropertyAccommodationType;
  /** `month` | `night`, or empty when the payload did not say. */
  billingFrequency: string;
  status: ListingStatus;
  image: string;
  /** Total rooms (published/paused properties only). */
  rooms?: number;
  bedsFilled?: number;
  bedsTotal?: number;
  views?: number;
  /** ISO-4217, as the hostel is priced. */
  currency: string;
  /** `house` | `building` | `apartment`. */
  propertyType: string;
  totalFloors?: number;
  /** Every room type on the hostel, so a page needing one does not re-fetch the hostel. */
  roomTypes: HostListingRoomType[];
  /** Amenity ids/slugs, as the offers filter uses them. */
  offers: { id: number; name: string; slug: string }[];
  review: { score: number | null; count: number };
  address?: string;
  state?: string;
  country?: string;
  landmarks?: string;
  lat?: number;
  lng?: number;
  /** Human "submitted N ago" line for in-review listings. */
  submittedAt?: string;
  photos?: number;
}

/** An in-progress onboarding draft the host can resume. */
export interface DraftListing {
  step: number;
  totalSteps: number;
  stepLabel: string;
  savedAt: string;
}

/** Aggregate counters for the listings stat strip. */
export interface ListingStats {
  total: number;
  published: number;
  inReview: number;
  occupancy: number;
}

/** Payload for the listings screen — list, draft, and headline stats. */
export interface HostListingsData {
  listings: HostListing[];
  draft: DraftListing | null;
  stats: ListingStats;
}

/** Staff roles. Both share the same access today (label is organisational). */
export type StaffRole = 'manager' | 'warden';

export type StaffStatus = 'active' | 'inactive';

/** A staff member scoped to a single property. */
export interface StaffMember {
  id: string;
  name: string;
  initials: string;
  role: StaffRole;
  email: string;
  phone?: string;
  status: StaffStatus;
  /** Avatar tint, cycled per row for visual variety. */
  tone: 'cream' | 'sky' | 'mint' | 'brand';
}

/** The property a staff roster belongs to. */
export interface TeamProperty {
  id: string;
  name: string;
}

/** Payload for the team screen — the active property plus its roster. */
export interface HostTeamData {
  property: TeamProperty;
  staff: StaffMember[];
}

/**
 * A staff record scoped to one hostel — `GET /api/host/hostels/:id/staffs`.
 *
 * Distinct from `StaffMember` above, which models a *manager account* created through
 * `add_manager` and can log in. A `Staff` is an employment record: salary, CNIC, joining
 * date. It carries no email, no password and no account, so the two are not interchangeable
 * and neither replaces the other.
 */
export interface Staff {
  id: string;
  name: string;
  /** Free text as the host typed it — "Warden", "Cook", "Night guard". Not an enum. */
  title: string;
  phone: string;
  hostelId: string;
  hostelName: string;
  cnic: string;
  /** `YYYY-MM-DD`. The API sends a full ISO timestamp; the form wants date-only. */
  joiningDate: string;
  leavingDate?: string;
  salaryIssueDate?: string;
  /** The API sends a decimal string ("25000.0"); normalised to a number here. */
  salary: number;

  /**
   * Server-driven status. Deliberately NOT a union like `TenantStatus`: the set is
   * published at runtime by `GET /staffs/new`, so hard-coding members here would make the
   * frontend wrong the moment the backend adds one.
   */
  status: string;
  statusLabel: string;
  createdAt?: string;

  /**
   * This staff member also holds a manager login for the hostel. Set from `is_manager` on
   * the staff payload, which carries the credentials too — there is no separate manager
   * record to cross-reference.
   */
  isManager?: boolean;
  /**
   * The login account this staff is already attached to, when the API reports one. Its
   * presence means the credentials exist already, so granting manager access is just a
   * matter of flipping the flag — no email or password to collect.
   */
  userId?: string;
  /** Login address, present only for a manager. */
  email?: string;

  // ── detail only (`GET /staffs/:id`) ──────────────────────────────────────────
  address?: string;
  updatedAt?: string;
  avatarUrl?: string;
  avatarId?: string;
  /**
   * Read-only. The API returns CNIC images as bare URLs with no attachment id, while it
   * writes them as `cnic_front_id` / `cnic_back_id` — so an existing image can be shown
   * but not re-sent. Safe only because PATCH is partial.
   */
  cnicFrontUrl?: string;
  cnicBackUrl?: string;
}

