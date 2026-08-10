import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { ApiClient } from '@core/api-resource';

export interface Review {
  id: string;
  score: number;
  comments: string;
  createdAt: string;
  userName: string;
}

interface RawReview {
  id: string;
  score: number | string;
  comments?: string;
  comment?: string;
  created_at?: string;
  user_name?: string;
  user?: { name?: string; full_name?: string };
  renter?: { name?: string; full_name?: string };
}

export enum InteractiveNotificationType {
  MealConfirmation = 'meal_confirmation',
  RenterConfirmation = 'renter_confirmation',
}

export enum ReadonlyNotificationType {
  Receipt = 'receipt',
  Rent = 'rent',
  General = 'general',
  ReviewRequest = 'review_request',
}

const INTERACTIVE_TYPES = new Set<string>(Object.values(InteractiveNotificationType));

export function isInteractiveType(type: string): boolean {
  return INTERACTIVE_TYPES.has(type);
}

/** A "leave a review" prompt — carries the hostel to review in `associatedId`. */
export function isReviewRequestType(type: string): boolean {
  return type === ReadonlyNotificationType.ReviewRequest;
}

export interface UserInvite {
  id: string;
  inviteType: string;
  status: 'pending' | 'accepted' | 'rejected';
  isRead: boolean;
  message: string;
  expiredAt: string;
  createdAt: string;
  /** Id of the entity this notification refers to — the hostel id for a review request. */
  associatedId: string;
}

export interface InvitesResult {
  items: UserInvite[];
  unread: number;
}

interface RawNotification {
  id: string;
  invitation_acceptance_type?: string;
  is_accepted?: boolean;
  accepted_at?: string | null;
  is_rejected?: boolean;
  rejected_at?: string | null;
  is_read?: boolean;
  message?: string;
  expired_at?: string;
  created_at?: string;
  associated_id?: string;
}

interface NotificationsResponse {
  success: boolean;
  user_invites: RawNotification[];
  aggs?: { unread?: number; accepted?: number; rejected?: number; pending?: number };
}

interface ActionResponse {
  success: boolean;
  message?: string;
}

@Injectable({ providedIn: 'root' })
export class StudentApi {
  private readonly api = inject(ApiClient);

  listInvites(): Observable<InvitesResult> {
    return this.api
      .get<NotificationsResponse>('/api/notifications')
      .pipe(
        map((r) => ({
          items: (r.user_invites ?? []).map(mapInvite),
          unread: r.aggs?.unread ?? 0,
        })),
      );
  }

  markAsRead(id: string): Observable<ActionResponse> {
    return this.api.patch<ActionResponse>(
      `/api/notifications/${id}/mark_as_read`,
      {},
    );
  }

  /** DELETE /api/notifications/:id — permanently removes a notification for the user. */
  deleteNotification(id: string): Observable<unknown> {
    return this.api.delete(`/api/notifications/${id}`);
  }

  acceptInvite(id: string): Observable<ActionResponse> {
    return this.api.post<ActionResponse>(
      `/api/notifications/${id}/mark_as_accepted`,
      {},
    );
  }

  rejectInvite(id: string): Observable<ActionResponse> {
    return this.api.post<ActionResponse>(
      `/api/notifications/${id}/mark_as_rejected`,
      {},
    );
  }

  addReview(notificationId: string, score: number, comments: string): Observable<unknown> {
    return this.api.post(`/api/notifications/${notificationId}/add_review`, {
      nps_rating: { score: String(score), comments },
    });
  }

  getReviews(hostelId: string): Observable<Review[]> {
    // The endpoint returns the list under `ratings` (older builds used `nps_ratings`).
    return this.api
      .get<{ ratings?: RawReview[]; nps_ratings?: RawReview[] }>('/api/nps_ratings', { 'f[id]': hostelId })
      .pipe(map((r) => (r.ratings ?? r.nps_ratings ?? []).map(mapReview)));
  }
}

function mapReview(raw: RawReview): Review {
  return {
    id: raw.id,
    score: Number(raw.score) || 0,
    comments: raw.comments ?? raw.comment ?? '',
    createdAt: raw.created_at ?? '',
    userName: raw.user_name ?? raw.user?.name ?? raw.user?.full_name ?? raw.renter?.name ?? raw.renter?.full_name ?? 'Anonymous',
  };
}

function mapInvite(raw: RawNotification): UserInvite {
  let status: UserInvite['status'] = 'pending';
  if (raw.is_accepted) status = 'accepted';
  else if (raw.is_rejected) status = 'rejected';

  return {
    id: raw.id,
    inviteType: raw.invitation_acceptance_type ?? '',
    status,
    isRead: raw.is_read ?? false,
    message: raw.message ?? '',
    expiredAt: raw.expired_at ?? '',
    createdAt: raw.created_at ?? '',
    associatedId: raw.associated_id ?? '',
  };
}
