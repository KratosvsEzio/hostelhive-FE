// Local domain models for the host console shell.
// **Stub pending Q-API (§0)** — these mirror the shapes the host endpoints are
// expected to return; swap the fixture-backed service for the typed SDK later.

/** Lifecycle of a host's property listing. */
export type ListingStatus = 'onboarding' | 'in-review' | 'published' | 'paused';

/** Gender policy of a property (matches the public-search vocabulary). */
export type PropertyGender = 'boys' | 'girls' | 'coliving';

/** A single property owned by the signed-in host. */
export interface HostListing {
  id: string;
  name: string;
  area: string;
  city: string;
  gender: PropertyGender;
  status: ListingStatus;
  image: string;
  /** Total rooms (published/paused properties only). */
  rooms?: number;
  bedsFilled?: number;
  bedsTotal?: number;
  views?: number;
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
