import { Injectable, Signal, computed, inject, signal } from '@angular/core';
import { ApiError } from '@hostelhive/data-access';
import { SessionStore } from '@app/core/auth/session-store';

/** Why the host API refused a hostel's request: no live plan, or a plan without CRM. */
export type HostAccessKind = 'inactive' | 'crmRequired';

export interface HostAccessRefusal {
  hostelId: string;
  kind: HostAccessKind;
}

export interface HostAccessObservation extends HostAccessRefusal {
  /** Id of the session user who saw the refusal. */
  owner: string;
  /** Monotonic order of observation; see {@link HostAccessEvents.mark}. */
  seq: number;
}

export const CRM_REQUIRED_CODE = 'crm_required';
export const CRM_REQUIRED_MESSAGE = 'Your plan does not include CRM';

const HOST_HOSTEL_URL = /\/api\/host\/hostels\/([^/?#]+)(?:[/?#]|$)/;
const INACTIVE_MESSAGE = /need to subscribe/i;

/**
 * Recognises the host API's plan refusals for one hostel: a 400 "You need to subscribe…" when the
 * hostel has no live plan, and a 403 `crm_required` when its plan lacks CRM (matched on the message
 * when the body carries no code). Returns null for any other failure or any other URL, including the
 * hostel index. The hostel id is used exactly as captured.
 */
export function classifyHostAccess(
  url: string,
  err: Pick<ApiError, 'status' | 'serverMessages'> & { code?: string },
): HostAccessRefusal | null {
  const hostelId = HOST_HOSTEL_URL.exec(url)?.[1];
  if (!hostelId) return null;
  const messages = err.serverMessages ?? [];
  if (err.status === 400 && messages.some((m) => INACTIVE_MESSAGE.test(m))) {
    return { hostelId, kind: 'inactive' };
  }
  if (
    err.status === 403 &&
    (err.code === CRM_REQUIRED_CODE || messages.includes(CRM_REQUIRED_MESSAGE))
  ) {
    return { hostelId, kind: 'crmRequired' };
  }
  return null;
}

/**
 * Plan refusals the host API has answered with, so the console can lock or warn before billing
 * says so. Observations belong to the user who saw them and are only exposed while that user is
 * signed in. A repeat of the same refusal replaces the earlier one with a fresh seq.
 */
@Injectable({ providedIn: 'root' })
export class HostAccessEvents {
  private readonly session = inject(SessionStore);
  private readonly all = signal<readonly HostAccessObservation[]>([]);
  private nextSeq = 0;

  /** The session user's observations only (owner === SessionStore.user()?.id); [] when signed out. */
  readonly observations: Signal<readonly HostAccessObservation[]> = computed(() => {
    const owner = this.session.user()?.id;
    if (!owner) return [];
    return this.all().filter((o) => o.owner === owner);
  });

  /** No-op without a session user. Assigns the next seq. */
  record(r: HostAccessRefusal): void {
    const owner = this.session.user()?.id;
    if (!owner) return;
    const observation: HostAccessObservation = {
      hostelId: r.hostelId,
      kind: r.kind,
      owner,
      seq: this.nextSeq++,
    };
    this.all.update((list) => [
      ...list.filter(
        (o) => !(o.owner === owner && o.hostelId === r.hostelId && o.kind === r.kind),
      ),
      observation,
    ]);
  }

  /** The seq the next record() will get. Read it before starting a load. */
  mark(): number {
    return this.nextSeq;
  }

  /** Drops this hostel's observations with seq < upTo. */
  clear(hostelId: string, upTo: number): void {
    const list = this.all();
    const kept = list.filter((o) => o.hostelId !== hostelId || o.seq >= upTo);
    if (kept.length !== list.length) this.all.set(kept);
  }
}
