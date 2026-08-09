import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { ApiClient } from '@core/api-resource';

export enum InteractiveNotificationType {
  MealConfirmation = 'meal_confirmation',
}

export enum ReadonlyNotificationType {
  RenterConfirmation = 'renter_confirmation',
  Receipt = 'receipt',
  Rent = 'rent',
  General = 'general',
}

const INTERACTIVE_TYPES = new Set<string>(Object.values(InteractiveNotificationType));

export function isInteractiveType(type: string): boolean {
  return INTERACTIVE_TYPES.has(type);
}

export interface UserInvite {
  id: string;
  inviteType: string;
  status: 'pending' | 'accepted' | 'rejected';
  isRead: boolean;
  message: string;
  expiredAt: string;
  createdAt: string;
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
  };
}
