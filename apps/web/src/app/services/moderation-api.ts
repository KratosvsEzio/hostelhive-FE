import { differenceInHours, format, parseISO } from 'date-fns';
import { Injectable, inject } from '@angular/core';
import { Observable, forkJoin, of } from 'rxjs';
import { catchError, delay, map, switchMap } from 'rxjs/operators';
import {
  AttachmentLabel,
  HostelAttachment,
  HostelDetail,
  HostelEnumOption,
  HostelOffer,
  OfferCategory,
  User,
} from '@hostelhive/data-access';
import { ApiClient } from '@core/api-resource';
import { HostelsApi } from './hostels-api';
import { OffersApi } from './offers-api';
import { UsersApi } from './users-api';
import {
  AUDIT,
  DELTA_GROUPS,
  DISPOSITIONS,
  MANAGED,
  PROFILE,
} from './moderation.fixtures';
import {
  AttachmentPage,
  AuditEntry,
  DeltaGroup,
  Disposition,
  DispositionMeta,
  ListingKind,
  ManagedListing,
  ModeratorAttachment,
  ModeratorProfile,
  PhotoDecision,
  PillTone,
  QueueItem,
  QueueReason,
  ReviewAmenityGroup,
  ReviewDetail,
  ReviewPhoto,
} from '@hostelhive/data-access';

/**
 * Moderation API. **Stub pending Q-API (§0)** — backed by fixtures with a small
 * delay to exercise loading states (mirrors ListingsApi). When the typed SDK
 * lands, swap the `of(...)` bodies for `httpResource`/`HttpClient`; the public
 * shape stays the same.
 */
@Injectable({ providedIn: 'root' })
export class ModerationApi {
  private readonly api = inject(ApiClient);
  private readonly hostels = inject(HostelsApi);
  private readonly users = inject(UsersApi);
  private readonly offers = inject(OffersApi);

  /**
   * Review queue — `GET /api/moderator/hostels` (moderator-scoped hostels awaiting review).
   * Returns the full list; the page filters by reason tab (new / resubmitted) client-side.
   * `sortDir` maps to `sort[q_at]=asc|desc`; omit for the API default order.
   */
  queue(
    page = 1,
    limit = 10,
    sortDir?: 'asc' | 'desc' | null,
    searchField?: 'name' | 'host' | 'city',
    searchTerm?: string,
  ): Observable<{ items: QueueItem[]; total: number; totalPages: number }> {
    const params: Record<string, string | number> = { page, limit };
    if (sortDir) params['sort[q_at]'] = sortDir;
    if (searchTerm?.trim()) {
      const apiField = searchField === 'host' ? 'host.name' : searchField === 'city' ? 'city' : 'name';
      params[`s[${apiField}]`] = searchTerm.trim();
    }
    return this.api
      .get<ModeratorHostelsResponse>('/api/moderator/hostels', params)
      .pipe(map((res) => {
        const items = extractHostels(res).map(toQueueItem);
        return {
          items,
          total: res.pagination?.total_count ?? items.length,
          totalPages: res.pagination?.total_pages ?? 1,
        };
      }));
  }

  /**
   * Full review detail for one queued listing (screen 21) — hydrated live from
   * `GET /api/hostels/:id` (HostelSerializer), enriched with the host
   * (`GET /api/users/:hostId`) and the amenity catalogue (`GET /api/offer_categories`).
   * Host / catalogue failures degrade gracefully (embedded host, amenities without totals).
   */
  getById(id: string): Observable<ReviewDetail> {
    return this.hostels.getById(id).pipe(
      switchMap((hostel) =>
        forkJoin({
          host:
            hostel.host?.id != null
              ? this.users
                  .getById(hostel.host.id)
                  .pipe(catchError(() => of<User | null>(null)))
              : of<User | null>(null),
          catalog: this.offers
            .categories()
            .pipe(catchError(() => of<OfferCategory[]>([]))),
        }).pipe(
          map(({ host, catalog }) => toReviewDetail(hostel, host, catalog)),
        ),
      ),
    );
  }

  /** Live listings with pending photos in the delta-media pipeline (screen 22). */
  deltaMedia(): Observable<DeltaGroup[]> {
    return of(DELTA_GROUPS).pipe(delay(150));
  }

  /** Pending media attachments — `GET /api/moderator/attachments`. */
  attachments(page = 1, status?: string): Observable<AttachmentPage> {
    const params: Record<string, string | number> = { page, limit: 10 };
    if (status) params['f[status.slug]'] = status;
    return this.api
      .get<ModeratorAttachmentsResponse>('/api/moderator/attachments', params)
      .pipe(map((res) => extractModerationAttachments(res)));
  }

  /** Disposition counts for the stat strip + filter chips (screen 23). */
  dispositions(): Observable<DispositionMeta[]> {
    return of(DISPOSITIONS).pipe(delay(150));
  }

  /** Managed listings, optionally filtered by disposition (screen 23). */
  listings(
    disposition: Disposition | 'all' = 'all',
  ): Observable<ManagedListing[]> {
    const items =
      disposition === 'all'
        ? MANAGED
        : MANAGED.filter((l) => l.disposition === disposition);
    return of(items).pipe(delay(150));
  }

  /** Global audit timeline, optionally filtered by action group (screen 24). */
  audit(group: AuditEntry['group'] | 'all' = 'all'): Observable<AuditEntry[]> {
    const items =
      group === 'all' ? AUDIT : AUDIT.filter((a) => a.group === group);
    return of(items).pipe(delay(150));
  }

  /** Signed-in moderator profile + preferences (screen 25). */
  profile(): Observable<ModeratorProfile> {
    return of(PROFILE).pipe(delay(150));
  }

  /** `PUT /api/moderator/attachments/:id/update_label` — set or clear the label on one attachment. */
  updateAttachmentLabel(
    attachmentId: string,
    labelId: string | number | null,
  ): Observable<void> {
    return this.api.put<void>(
      `/api/moderator/attachments/${attachmentId}/update_label`,
      {
        attachment_label_id: labelId,
      },
    );
  }

  /** `PUT /api/moderator/hostels/:id/mark_as_active` — approve and publish a queued listing. */
  markAsActive(id: string): Observable<void> {
    return this.api.put<void>(`/api/moderator/hostels/${id}/mark_as_active`, {});
  }

  /** `PUT /api/moderator/attachments/:id/mark_as_active` — approve one media attachment. */
  markAttachmentAsActive(id: string): Observable<void> {
    return this.api.put<void>(
      `/api/moderator/attachments/${id}/mark_as_active`,
      {},
    );
  }

  /** `PUT /api/moderator/attachments/:id/mark_as_rejected` — reject one media attachment with a note for the host. */
  markAttachmentAsRejected(id: string, notes: string): Observable<void> {
    return this.api.put<void>(
      `/api/moderator/attachments/${id}/mark_as_rejected`,
      { attachment: { notes } },
    );
  }

  /** `GET /api/moderator/hostels/new` — enum options for the review edit form. */
  formOptions(): Observable<ModFormOptions> {
    return this.api.get<ModNewResponse>('/api/moderator/hostels/new').pipe(
      map((r) => ({
        genderTypes: r.gender_types ?? [],
        propertyTypes: r.property_types ?? [],
        attachmentLabels: r.attachment_labels ?? [],
      })),
    );
  }
}

/* ----------------------------------------------- attachments (moderator API) */

interface ModeratorAttachmentsResponse {
  success?: boolean;
  attachments?: ModeratorAttachment[];
  pagination?: {
    current_page?: number | null;
    next_page?: number | null;
    total_count?: number | null;
    total_pages?: number | null;
  } | null;
  possible_statuses?: { slug: string; name: string }[] | null;
}

function extractModerationAttachments(
  res: ModeratorAttachmentsResponse | ModeratorAttachment[] | null | undefined,
): AttachmentPage {
  if (Array.isArray(res)) return { items: res, totalCount: res.length, nextPage: null, possibleStatuses: [] };
  const items = res?.attachments ?? [];
  return {
    items,
    totalCount: res?.pagination?.total_count ?? items.length,
    nextPage: res?.pagination?.next_page ?? null,
    possibleStatuses: res?.possible_statuses ?? [],
  };
}

/* ------------------------------------------------- form options (moderator API) */

export interface ModFormOptions {
  genderTypes: HostelEnumOption[];
  propertyTypes: HostelEnumOption[];
  attachmentLabels: AttachmentLabel[];
}

interface ModNewResponse {
  success?: boolean;
  gender_types?: HostelEnumOption[];
  property_types?: HostelEnumOption[];
  attachment_labels?: AttachmentLabel[];
}

/* ----------------------------------------------- review queue (moderator API) */

/** A hostel row from `GET /api/moderator/hostels` (HostelIndex `search_data`). */
interface ApiModeratorHostel {
  id: number | string;
  name?: string | null;
  gender_type?: string | null;
  property_type?: string | null;
  city?: string | null;
  area?: string | null;
  created_at?: string | null;
  submitted_at?: string | null;
  /** Queued-for-review timestamp — preferred source for the "submitted" date. */
  q_at?: string | null;
  host?: { id?: number | string; name?: string } | null;
  attachments?: { url?: string | null }[] | null;
  photos_count?: number | null;
  status?: { slug?: string; name?: string } | null;
  disposition?: { slug?: string; name?: string } | null;
  /** Some builds flag a re-review explicitly; otherwise it's inferred from the disposition slug. */
  resubmitted?: boolean | null;
  is_resubmission?: boolean | null;
}

/** `GET /api/moderator/hostels` → `{ hostels: [...] }` (or a bare array on some builds). */
interface ModeratorHostelsResponse {
  success?: boolean;
  hostels?: ApiModeratorHostel[];
  pagination?: { total_count?: number; total_pages?: number; current_page?: number };
}

function extractHostels(
  res: ModeratorHostelsResponse | ApiModeratorHostel[] | null | undefined,
): ApiModeratorHostel[] {
  if (Array.isArray(res)) return res;
  return res?.hostels ?? [];
}

const KIND_LABEL: Record<ListingKind, string> = {
  boys: 'Boys',
  girls: 'Girls',
  coliving: 'Co-living',
};


/** Map a moderator hostel onto the FE `QueueItem`. */
function toQueueItem(h: ApiModeratorHostel): QueueItem {
  const kind = toKind(h.gender_type);
  const photos = h.attachments ?? [];
  const submitted = h.q_at ?? null;
  return {
    id: String(h.id),
    name: h.name ?? 'Untitled hostel',
    kind,
    kindLabel: KIND_LABEL[kind],
    photoCount: h.photos_count ?? photos.length,
    thumb: photos.find((a) => a?.url)?.url ?? null, // no random fallback — the UI shows a placeholder
    city: h.city ?? '—',
    host: h.host?.name ?? '—',
    submitted: submitted ?? '',
    submittedLabel: submittedLabel(submitted),
    hoursInQueue: hoursSince(submitted),
    reason: deriveReason(h),
  };
}

/** Backend `gender_type` → moderation `ListingKind` ('co-living' and anything else → coliving). */
function toKind(genderType?: string | null): ListingKind {
  switch ((genderType ?? '').toLowerCase().replace(/[_\s]/g, '-')) {
    case 'boys':
      return 'boys';
    case 'girls':
      return 'girls';
    default:
      return 'coliving';
  }
}

/** New vs resubmitted — an explicit flag if present, else inferred from the disposition/status slug. */
function deriveReason(h: ApiModeratorHostel): QueueReason {
  if (h.resubmitted || h.is_resubmission) return 'resubmitted';
  const slug =
    `${h.disposition?.slug ?? ''} ${h.status?.slug ?? ''}`.toLowerCase();
  return /resubmit|re-?review|change|updated|amend/.test(slug)
    ? 'resubmitted'
    : 'new';
}

/** 'June 15, 2026' from an ISO date; '—' when missing/invalid. */
function submittedLabel(iso?: string | null): string {
  if (!iso) return '—';
  try { return format(parseISO(iso), 'MMMM d, yyyy'); } catch { return '—'; }
}

/** Whole hours since submission (0 when missing) — drives the in-queue badge. */
function hoursSince(iso?: string | null): number {
  if (!iso) return 0;
  try { return Math.max(0, differenceInHours(new Date(), parseISO(iso))); } catch { return 0; }
}

/* ------------------------------------------- review detail (hostel + host show) */

const GENDER_LABEL: Record<string, string> = {
  'co-living': 'Co-living',
  boys: 'Boys',
  girls: 'Girls',
};
const PROPERTY_LABEL: Record<string, string> = {
  apartment: 'Apartment',
  room: 'Room',
  building: 'Building',
  house: 'House',
};

/** Map the hostel show payload (+ host, + amenity catalogue) onto the FE ReviewDetail. */
function toReviewDetail(
  hostel: HostelDetail,
  host: User | null,
  catalog: OfferCategory[],
): ReviewDetail {
  const submitted = hostel.q_at ?? null; // queued-for-review timestamp, not record creation
  const hours = submitted ? hoursSince(submitted) : null;
  return {
    id: String(hostel.id),
    name: hostel.name?.trim() || 'Untitled hostel',
    kindLabel:
      PROPERTY_LABEL[hostel.property_type] ?? titleCase(hostel.property_type),
    genderLabel:
      GENDER_LABEL[hostel.gender_type] ?? titleCase(hostel.gender_type),
    propertyType: hostel.property_type,
    genderType: hostel.gender_type,
    description: hostel.description ?? '',
    landmarks: hostel.nearby_landmarks ?? '',
    photos: toReviewPhotos(hostel),
    host: host?.name ?? hostel.host?.name ?? '—',
    city: hostel.city || '—',
    submittedLabel: dateLabel(submitted),
    daysInQueueLabel: hours === null ? '—' : queueLabel(hours),
    daysInQueueTone: hours === null ? 'neutral' : queueTone(hours),
    paymentLabel: '',
    audit: [],
    hostId: host?.id ?? hostel.host?.id ?? null,
    hostEmail: host?.email ?? hostel.host?.email ?? null,
    hostPhone: host?.phone ?? hostel.host?.phone ?? null,
    hostActive: host?.is_active ?? hostel.host?.is_active ?? null,
    hostMemberSince: host?.created_at
      ? `Member since ${monthYear(host.created_at)}`
      : null,
    statusLabel: hostel.status?.name ?? null,
    dispositionLabel: hostel.disposition?.name ?? null,
    address: buildAddress(hostel),
    lat: hostel.latitude,
    lng: hostel.longitude,
    country: hostel.country || '',
    state: hostel.state || '',
    area: hostel.area || '',
    address1: hostel.address_1 || '',
    amenities: toAmenityGroups(hostel.hostel_offers ?? [], catalog),
    offerCatalog: catalog,
    // The show payload carries selected amenities in a flat `offers` array; older builds used
    // the `hostel_offers` join. Read both so the catalogue toggles pre-select correctly.
    selectedOfferSlugs: [
      ...(hostel.offers ?? []).map((o) => o.slug),
      ...(hostel.hostel_offers ?? []).map((ho) => ho.offer?.slug),
    ].filter((s): s is string => !!s),
    total_rooms: hostel.total_rooms ?? 0,
    room_types: hostel.room_types ?? [],
  };
}

/** 'co-living' / 'in_review' → 'Co Living' / 'In Review'; '—' when blank. */
function titleCase(s: string | null | undefined): string {
  if (!s) return '—';
  return s.replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

/** '09 Jun 2026' from an ISO date; '—' when missing/invalid. */
function dateLabel(iso: string | null): string {
  if (!iso) return '—';
  try { return format(parseISO(iso), 'dd MMM yyyy'); } catch { return '—'; }
}

/** 'Jun 2026' from an ISO date; '' when missing/invalid. */
function monthYear(iso: string): string {
  try { return format(parseISO(iso), 'MMM yyyy'); } catch { return ''; }
}

/** Whole-day / hour label for the in-queue badge. */
function queueLabel(hours: number): string {
  if (hours < 24) return `${hours} hr${hours === 1 ? '' : 's'}`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? '' : 's'}`;
}

function queueTone(hours: number): PillTone {
  if (hours >= 72) return 'danger';
  if (hours >= 24) return 'warn';
  return 'ok';
}

/** Single-line address from the hostel's address parts. */
function buildAddress(h: HostelDetail): string | null {
  const parts = [h.address_1, h.address_2, h.area, h.city, h.state]
    .map((p) => p?.trim())
    .filter(Boolean);
  return parts.length ? parts.join(', ') : null;
}

/** Attachments → review photo grid; `is_primary` (else banner URL, else first image) marks primary. */
function toReviewPhotos(h: HostelDetail): ReviewPhoto[] {
  const bannerUrl = (h.banner ?? []).find((b) => b?.url)?.url ?? null;
  const hasPrimaryFlag = (h.attachments ?? []).some((a) => a?.is_primary);
  const photos = (h.attachments ?? [])
    .filter(
      (a): a is HostelAttachment & { url: string } => !!a?.url && isImage(a),
    )
    .map((a, i) => ({
      id: String(a.id ?? `att-${i}`),
      url: a.url,
      decision: 'pending' as PhotoDecision,
      primary: hasPrimaryFlag
        ? !!a.is_primary
        : bannerUrl
          ? a.url === bannerUrl
          : i === 0,
      labelId: a.attachment_label?.id ?? null,
      labelName: a.attachment_label?.name ?? null,
    }));
  if (photos.length && !photos.some((p) => p.primary)) photos[0].primary = true;
  return photos;
}

function isImage(a: HostelAttachment): boolean {
  if (a.content_type) return a.content_type.startsWith('image/');
  if (a.attachment_type) return /image|photo/i.test(a.attachment_type);
  return true; // no type info — assume it's a photo
}

/** Group the hostel's selected offers by category, ordered by the catalogue, with totals. */
function toAmenityGroups(
  offers: HostelOffer[],
  catalog: OfferCategory[],
): ReviewAmenityGroup[] {
  const byCat = new Map<string, string[]>();
  for (const ho of offers) {
    const name = ho.offer?.name;
    if (!name) continue;
    const cat = ho.offer_category?.name ?? 'Other';
    const list = byCat.get(cat) ?? [];
    list.push(name);
    byCat.set(cat, list);
  }

  const totalByName = new Map(
    catalog.map((c) => [c.name.toLowerCase(), c.offers?.length ?? 0]),
  );
  const groups: ReviewAmenityGroup[] = [];
  const seen = new Set<string>();
  const emit = (cat: string): void => {
    if (seen.has(cat)) return;
    const items = byCat.get(cat);
    if (!items || !items.length) return;
    seen.add(cat);
    groups.push({
      category: cat,
      items: [...items].sort((a, b) => a.localeCompare(b)),
      total: totalByName.get(cat.toLowerCase()),
    });
  };

  // catalogue order first, then any categories the catalogue didn't list
  for (const c of catalog) {
    const match = [...byCat.keys()].find(
      (k) => k.toLowerCase() === c.name.toLowerCase(),
    );
    if (match) emit(match);
  }
  for (const cat of byCat.keys()) emit(cat);
  return groups;
}
