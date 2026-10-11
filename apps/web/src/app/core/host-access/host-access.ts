import { isPlatformBrowser } from '@angular/common';
import {
  DestroyRef,
  Injectable,
  PLATFORM_ID,
  Signal,
  computed,
  inject,
  signal,
} from '@angular/core';
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

/** The hostel a host API URL is about, and whether it names something under that hostel. */
export interface HostAccessTarget {
  hostelId: string;
  nested: boolean;
}

export const CRM_REQUIRED_CODE = 'crm_required';
export const CRM_REQUIRED_MESSAGE = 'Your plan does not include CRM';
/** How long a recorded refusal stands, unless seen again, before it is dropped. */
export const HOST_ACCESS_TTL_MS = 2 * 60 * 1000;

const HOST_HOSTEL_URL = /\/api\/host\/hostels\/([^/?#]+)(?:\/([^?#]*))?(?:[?#]|$)/;
const INACTIVE_MESSAGE = /need to subscribe/i;

/**
 * Reads `/api/host/hostels/:id[/…]`. Returns null for any other URL, including the hostel index.
 * The hostel id is used exactly as captured.
 */
export function hostAccessTarget(url: string): HostAccessTarget | null {
  const match = HOST_HOSTEL_URL.exec(url);
  if (!match) return null;
  return { hostelId: match[1], nested: !!match[2] };
}

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
  const hostelId = hostAccessTarget(url)?.hostelId;
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
 * signed in. A repeat of the same refusal replaces the earlier one with a fresh seq. In the
 * browser each observation lapses {@link HOST_ACCESS_TTL_MS} after it was recorded.
 */
@Injectable({ providedIn: 'root' })
export class HostAccessEvents {
  private readonly session = inject(SessionStore);
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly all = signal<readonly HostAccessObservation[]>([]);
  private readonly expiries = new Map<number, ReturnType<typeof setTimeout>>();
  private nextSeq = 0;

  /** The session user's observations only (owner === SessionStore.user()?.id); [] when signed out. */
  readonly observations: Signal<readonly HostAccessObservation[]> = computed(() => {
    const owner = this.session.user()?.id;
    if (!owner) return [];
    return this.all().filter((o) => o.owner === owner);
  });

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      for (const timer of this.expiries.values()) clearTimeout(timer);
      this.expiries.clear();
    });
  }

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
    this.drop((o) => o.owner === owner && o.hostelId === r.hostelId && o.kind === r.kind);
    this.all.update((list) => [...list, observation]);
    this.expireLater(observation.seq);
  }

  /** The seq the next record() will get. Read it before starting a load. */
  mark(): number {
    return this.nextSeq;
  }

  /** Drops this hostel's observations with seq < upTo. */
  clear(hostelId: string, upTo: number): void {
    this.drop((o) => o.hostelId === hostelId && o.seq < upTo);
  }

  /**
   * Drops the session user's observations of this hostel with seq < upTo, limited to `kinds`.
   * For a request the server let through, with upTo read from {@link mark} before it was sent.
   */
  settle(
    hostelId: string,
    upTo: number,
    kinds: readonly HostAccessKind[] = ['inactive', 'crmRequired'],
  ): void {
    const owner = this.session.user()?.id;
    if (!owner) return;
    this.drop(
      (o) =>
        o.owner === owner && o.hostelId === hostelId && o.seq < upTo && kinds.includes(o.kind),
    );
  }

  private drop(gone: (o: HostAccessObservation) => boolean): void {
    const list = this.all();
    const kept = list.filter((o) => !gone(o));
    if (kept.length === list.length) return;
    for (const o of list) {
      if (gone(o)) this.cancelExpiry(o.seq);
    }
    this.all.set(kept);
  }

  private expireLater(seq: number): void {
    if (!this.browser) return;
    const timer = setTimeout(() => {
      this.expiries.delete(seq);
      this.drop((o) => o.seq === seq);
    }, HOST_ACCESS_TTL_MS);
    this.expiries.set(seq, timer);
  }

  private cancelExpiry(seq: number): void {
    const timer = this.expiries.get(seq);
    if (timer === undefined) return;
    clearTimeout(timer);
    this.expiries.delete(seq);
  }
}
