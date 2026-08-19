import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { Staff } from '@hostelhive/data-access';
import { ApiClient } from '@core/api-resource';
import { PAGE_SIZE } from '@util/pagination';

interface ApiPagination {
  current_page?: number;
  total_count?: number;
  total_pages?: number;
}

interface ApiStaffStatus {
  id?: string | number;
  name?: string | null;
  slug?: string | null;
  position?: number | null;
}

interface ApiStaff {
  id?: number | string;
  name?: string | null;
  title?: string | null;
  phone?: string | null;
  hostel_id?: number | string | null;
  cnic_number?: string | null;
  joining_date?: string | null;
  leaving_date?: string | null;
  salary_issue_date?: string | null;
  /** Decimal string on the wire ("25000.0"). */
  salary?: string | number | null;
  address?: string | null;
  /** Plain URLs on read; written back as `cnic_front_id` / `cnic_back_id`. */
  cnic_front?: string | null;
  cnic_back?: string | null;
  status?: ApiStaffStatus | string | null;
  hostel?: { id?: number | string; name?: string | null } | null;
  avatar?: { id?: string | number | null; url?: string | null } | null;
  created_at?: string | null;
  updated_at?: string | null;
  /** The login account this staff is already attached to, when one exists. */
  user?: { id?: string | number | null } | null;
  /** Present once the staff member has been granted a manager login. */
  is_manager?: boolean | null;
  email?: string | null;
}

interface ApiStaffsResponse {
  staffs?: ApiStaff[];
  data?: ApiStaff[];
  pagination?: ApiPagination;
  aggs?: { name: string; slug: string; count: number }[];
}

interface ApiStaffResponse {
  staff?: ApiStaff;
}

/** One page of staff plus the facets the list page renders its tabs from. */
export interface StaffPage {
  items: Staff[];
  total: number;
  totalPages: number;
  /** Per-status counts for the filter tabs. */
  aggs: { name: string; slug: string; count: number }[];
}

/** Everything the staff form can write. Every field optional so PATCH stays partial. */
export interface StaffWrite {
  name?: string;
  title?: string;
  salary?: number;
  salary_issue_date?: string | null;
  phone?: string;
  address?: string;
  cnic_number?: string;
  joining_date?: string;
  leaving_date?: string | null;
  avatar_id?: string;
  cnic_front_id?: string;
  cnic_back_id?: string;
  /**
   * Manager login, carried on the staff payload itself — there is no separate endpoint.
   * Sent only when the host grants manager access; omitted otherwise so a plain edit can
   * never revoke an existing manager by defaulting the flag to false.
   */
  email?: string;
  password?: string;
  is_manager?: boolean;
}

/**
 * Trims an API timestamp to a bare date.
 *
 * String-sliced rather than parsed: the API round-trips the naive wall-clock it was given,
 * so `new Date(raw)` would apply a timezone shift the value never had and could move the
 * date by a day. Same reasoning as the renter mapper.
 */
function toDate(raw: string | null | undefined): string {
  return raw ? raw.slice(0, 10) : '';
}

function toStaff(s: ApiStaff): Staff {
  // `status` is an object on every documented response, but the renter endpoints send a
  // bare slug on some routes — tolerate both rather than crash on the variant.
  const statusObj = typeof s.status === 'object' && s.status !== null ? s.status : null;
  const slug = statusObj?.slug ?? (typeof s.status === 'string' ? s.status : '');
  return {
    id: String(s.id ?? ''),
    name: s.name ?? '—',
    title: s.title ?? '—',
    phone: s.phone ?? '—',
    hostelId: String(s.hostel?.id ?? s.hostel_id ?? ''),
    hostelName: s.hostel?.name ?? '',
    cnic: s.cnic_number ?? '',
    joiningDate: toDate(s.joining_date),
    leavingDate: toDate(s.leaving_date) || undefined,
    salaryIssueDate: toDate(s.salary_issue_date) || undefined,
    // Never `Number(x) || undefined` — that would swallow a legitimate zero.
    salary: Number(s.salary ?? 0),
    status: slug ?? '',
    statusLabel: statusObj?.name ?? '—',
    createdAt: s.created_at ?? undefined,
    isManager: !!s.is_manager,
    userId: s.user?.id != null ? String(s.user.id) : undefined,
    email: s.email ?? undefined,
    address: s.address ?? undefined,
    updatedAt: s.updated_at ?? undefined,
    avatarUrl: s.avatar?.url ?? undefined,
    avatarId: s.avatar?.id?.toString() ?? undefined,
    cnicFrontUrl: s.cnic_front ?? undefined,
    cnicBackUrl: s.cnic_back ?? undefined,
  };
}

/**
 * Staff (employment records) for a hostel.
 *
 * Separate from `HostShellApi`'s manager endpoints, which create *login accounts*. These
 * two resources model different things and neither supersedes the other.
 */
@Injectable({ providedIn: 'root' })
export class StaffApi {
  private readonly api = inject(ApiClient);

  /** GET /api/host/hostels/:hostelId/staffs */
  list(
    hostelId: string,
    page = 1,
    limit = PAGE_SIZE,
    filters: Record<string, string> = {},
  ): Observable<StaffPage> {
    return this.api
      .get<ApiStaffsResponse>(`/api/host/hostels/${hostelId}/staffs`, {
        page,
        limit,
        ...filters,
      })
      .pipe(
        map((res) => {
          const rows = res.staffs ?? res.data ?? [];
          return {
            items: rows.map(toStaff),
            total: res.pagination?.total_count ?? rows.length,
            totalPages: res.pagination?.total_pages ?? 1,
            aggs: res.aggs ?? [],
          } satisfies StaffPage;
        }),
      );
  }

  /** GET /api/host/hostels/:hostelId/staffs/:id — the full record, with address + images. */
  getById(hostelId: string, staffId: string): Observable<Staff> {
    return this.api
      .get<ApiStaffResponse>(`/api/host/hostels/${hostelId}/staffs/${staffId}`)
      .pipe(map((res) => toStaff(res.staff ?? {})));
  }

  create(hostelId: string, body: StaffWrite): Observable<Staff> {
    return this.api
      .post<ApiStaffResponse>(`/api/host/hostels/${hostelId}/staffs`, { staff: body })
      .pipe(map((res) => toStaff(res.staff ?? {})));
  }

  /**
   * PATCH, not PUT — the update is partial by design. It matters for the CNIC images: the
   * API returns them as URLs with no id, so an edit cannot re-send them. Omitting the keys
   * leaves the stored attachments alone; sending them as blank would wipe them.
   */
  update(hostelId: string, staffId: string, body: StaffWrite): Observable<Staff> {
    return this.api
      .patch<ApiStaffResponse>(`/api/host/hostels/${hostelId}/staffs/${staffId}`, {
        staff: body,
      })
      .pipe(map((res) => toStaff(res.staff ?? {})));
  }

  remove(hostelId: string, staffId: string): Observable<unknown> {
    return this.api.delete(`/api/host/hostels/${hostelId}/staffs/${staffId}`);
  }
}
