// Moderation domain models. **Stub pending Q-API** — mirrored from design-mockups
// 20-moderation-queue, 21-moderation-review, 22-delta-media, 23-moderation-listings,
// 24-moderation-audit, 25-moderation-settings. Shapes stay stable when the real SDK
// lands; only the service bodies swap from `of(...)` to HTTP.

import { OfferCategory } from './offer';
import { RoomType } from './hostel';

export type ListingKind = 'boys' | 'girls' | 'coliving';

/** Why an item sits in the moderator's primary review queue. */
export type QueueReason = 'new' | 'resubmitted';

/** A listing awaiting first-pass moderation (screen 20). */
export interface QueueItem {
  id: string;
  name: string;
  kind: ListingKind;
  kindLabel: string; // 'Co-living', 'Girls', 'Boys'
  photoCount: number;
  /** First hostel photo URL, or null when the hostel has no images (render a placeholder). */
  thumb: string | null;
  city: string;
  host: string;
  submitted: string; // ISO date
  submittedLabel: string; // '09 Jun'
  /** Hours the item has waited — drives the days-in-queue badge + tone. */
  hoursInQueue: number;
  reason: QueueReason;
}

export type PhotoDecision = 'pending' | 'approved' | 'rejected';

/** A single photo in the review photo grid (screen 21). */
export interface ReviewPhoto {
  id: string;
  url: string;
  decision: PhotoDecision;
  primary: boolean;
  rejectReason?: string; // e.g. 'blurry'
  labelId?: string | number | null;
  /** Label name from the API — seeds the dropdown option when formOptions hasn't loaded yet. */
  labelName?: string | null;
}

export type AuditDot = 'brand' | 'neutral';

/** An entry in the per-listing audit sidebar (screen 21). */
export interface ReviewAuditItem {
  id: string;
  text: string;
  meta: string; // 'Maria S. · 2 min ago'
  dot: AuditDot;
}

/** A group of amenities for the review Amenities card — built from the hostel's
 * `hostel_offers`, categorised against the `GET /api/offer_categories` catalogue. */
export interface ReviewAmenityGroup {
  category: string; // 'Kitchen and Dining'
  items: string[]; // selected offer names in this category
  /** Total offers the catalogue lists for this category (for "3 of 8"); omitted when unmatched. */
  total?: number;
}

/** Full review detail for one queued listing (screen 21).
 * Hydrated from `GET /api/hostels/:id` (HostelSerializer) + `GET /api/users/:hostId`
 * (host) + `GET /api/offer_categories` (amenity catalogue). */
export interface ReviewDetail {
  id: string;
  name: string;
  kindLabel: string; // property type — 'Building', 'Apartment' …
  genderLabel: string; // gender — 'Co-living', 'Boys', 'Girls'
  propertyType: string; // raw property_type slug, for the editable Type dropdown
  genderType: string; // raw gender_type slug, for the editable AccommodationType dropdown
  description: string;
  landmarks: string;
  photos: ReviewPhoto[];
  host: string; // host name
  city: string;
  submittedLabel: string; // '09 Jun 2026'
  daysInQueueLabel: string; // '2 days'
  daysInQueueTone: PillTone;
  paymentLabel: string; // 'Verified'
  audit: ReviewAuditItem[];

  // ── host (GET /api/users/:hostId, falls back to the embedded hostel.host) ──
  hostId: number | null;
  hostEmail: string | null;
  hostPhone: string | null;
  hostActive: boolean | null;
  hostMemberSince: string | null; // 'Member since Jan 2026', null when unknown

  // ── listing status + location (HostelSerializer) ──
  statusLabel: string | null; // status.name, e.g. 'In Review'
  dispositionLabel: string | null; // disposition.name
  address: string | null; // single-line address (display-only)
  lat: number | string | null;
  lng: number | string | null;
  country: string;
  state: string;
  area: string;
  address1: string;

  amenities: ReviewAmenityGroup[];

  /** Full amenity catalogue (GET /api/offer_categories) for the editable accordion. */
  offerCatalog: OfferCategory[];
  /** Slugs of the offers the hostel currently has — pre-selects the catalogue. */
  selectedOfferSlugs: string[];

  total_rooms: number;
  room_types: RoomType[];
}

/** A live listing with pending photos in the delta-media pipeline (screen 22). */
export interface DeltaPhoto {
  id: string;
  url: string;
  tag: string; // 'Rooftop', 'Bedroom' …
}

export interface DeltaGroup {
  id: string;
  listingName: string;
  thumb: string;
  host: string;
  uploadedLabel: string; // '3 photos · 1 hr ago'
  photos: DeltaPhoto[];
}

/** A single attachment from `GET /api/moderator/attachments`. */
export interface ModeratorAttachment {
  id: number | string;
  /** 'attachments' (room photo) | 'banner' | 'logo' | 'avatar'. */
  key?: string | null;
  url?: string | null;
  created_at?: string | null;
  status?: { slug?: string | null } | null;
  is_primary?: boolean | null;
  /** 'Hostel' | 'Tenant' | 'User' | null */
  attached_type?: string | null;
  attachment_label?: { id: number | string; name: string; description?: string | null } | null;
  hostel?: {
    id?: string | null;
    name?: string | null;
    host?: { name?: string | null } | null;
  } | null;
  user?: { id?: string | null; name?: string | null } | null;
}

export interface AttachmentStatusOption {
  slug: string;
  name: string;
}

/** Paginated response shape from `GET /api/moderator/attachments`. */
export interface AttachmentPage {
  items: ModeratorAttachment[];
  totalCount: number;
  nextPage: number | null;
  possibleStatuses: AttachmentStatusOption[];
}

export type Disposition =
  | 'published'
  | 'in-review'
  | 'changes'
  | 'paused'
  | 'rejected'
  | 'removed';

/** A managed listing row in the all-listings table (screen 23). */
export interface ManagedListing {
  id: string;
  name: string;
  kind: ListingKind;
  kindLabel: string;
  photoCount: number;
  thumb: string;
  city: string;
  host: string;
  disposition: Disposition;
  updatedLabel: string; // '2 hrs ago'
  views: number | null;
  removedNote?: string; // 'Removed by admin · policy violation'
}

/** Disposition → display chip + counts (screen 23 filter chips + stat strip). */
export interface DispositionMeta {
  value: Disposition | 'all';
  label: string;
  count: number;
}

export type AuditKind =
  | 'approve'
  | 'reject-photo'
  | 'edit'
  | 'approve-media'
  | 'flag'
  | 'request-changes'
  | 'reject'
  | 'set-primary'
  | 'remove';

export type AuditGroup = 'approvals' | 'rejections' | 'edits' | 'media';

export type PillTone = 'ok' | 'warn' | 'danger' | 'neutral';

/** A diff fragment rendered inside an audit entry (screen 24). */
export interface AuditDiff {
  before: string;
  after: string;
}

/** One row in the global audit timeline (screen 24). */
export interface AuditEntry {
  id: string;
  kind: AuditKind;
  group: AuditGroup;
  icon: string; // Tabler class
  iconTone: PillTone;
  actor: string;
  /** Sentence fragments around the listing link — `{action} <link>{target}</link> {tail}`. */
  action: string;
  target: string;
  targetLink: string; // route path the link points to
  tail: string;
  detail: string; // muted sub-line
  diff?: AuditDiff;
  day: string; // 'Today · 11 June 2026'
  time: string; // '14:32'
}

/** A row in the IP allowlist (screen 25). */
export interface IpRule {
  cidr: string; // '182.176.x.x'
  label: string; // 'Office'
  thisDevice?: boolean;
}

/** An active moderator session (screen 25). */
export interface ModSession {
  id: string;
  device: string; // 'Chrome · Windows · Office network'
  current: boolean;
}

/** The signed-in moderator's profile + preferences (screen 25). */
export interface ModeratorProfile {
  name: string;
  initials: string;
  email: string;
  role: string; // 'Moderator'
  passwordChangedLabel: string; // 'Last changed 12 days ago'
  sessionLengthLabel: string; // 'Moderator sessions expire after 8 hours'
  prefs: {
    defaultSort: string;
    perPage: string;
    badgeNewMedia: boolean;
    emailNewSubmissions: boolean;
    ageingAlert: boolean;
  };
  ipAllowlist: IpRule[];
  sessions: ModSession[];
}
