import { isPlatformBrowser } from '@angular/common';
import {
  Injectable,
  PLATFORM_ID,
  Signal,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { Subscription } from 'rxjs';
import { HostBilling } from '@hostelhive/data-access';
// Direct paths, not the `@core/auth` barrel: that barrel reaches back into `@services`.
import { SessionStore } from '@app/core/auth/session-store';
import { HostAccessEvents } from '@app/core/host-access/host-access';
import { AccessState, BannerInput, deriveAccess } from '@app/shared/billing/billing-banner';
import { BillingApi } from './billing-api';

export type HostBillingView = 'idle' | 'loading' | 'ready' | 'forbidden' | 'error';

/** The permission the billing endpoint checks; without it the request would only be refused. */
const BILLING_PERMISSION = 'core:Subscription:show';
/** A refusal seen within this long of the last load's start is answered by that load. */
const REFETCH_THROTTLE_MS = 30_000;

interface HostBillingState {
  /** The session user id the state was loaded for. */
  owner: string | null;
  hostelId: string;
  view: HostBillingView;
  billing: HostBilling | null;
}

const IDLE: Omit<HostBillingState, 'owner'> = { hostelId: '', view: 'idle', billing: null };

/**
 * The billing summary of the hostel the host console is showing, and the access it implies.
 *
 * The shell `track()`s the route's hostel; the billing page pushes what it loads through
 * `accept()`. Everything read here belongs to the session user it was loaded for, and reads as
 * idle for anyone else; when another user signs in, the tracked hostel is loaded again for them,
 * and a sign-out stops tracking. A hostel switch drops the previous hostel's billing at once and ignores
 * its late response; a reload of the same hostel keeps the last billing on screen meanwhile.
 *
 * Plan refusals seen by other requests ({@link HostAccessEvents}) feed the same access state, and
 * a fresh one triggers a refetch unless a load started within the last 30 s. A load that succeeds
 * clears the refusals seen before it started. Nothing is fetched during a server render.
 */
@Injectable({ providedIn: 'root' })
export class HostBillingStore {
  private readonly api = inject(BillingApi);
  private readonly session = inject(SessionStore);
  private readonly events = inject(HostAccessEvents);
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));

  private readonly userId = computed(() => this.session.user()?.id ?? null);
  /** The user id, or null once fully signed out; undefined while a token's user is still restoring. */
  private readonly holder = computed<string | null | undefined>(() => {
    const id = this.userId();
    if (id !== null) return id;
    return this.session.accessToken() ? undefined : null;
  });
  private readonly state = signal<HostBillingState>({
    owner: untracked(() => this.userId()),
    ...IDLE,
  });
  /** The state when it belongs to the session user, otherwise idle. */
  private readonly current = computed(() => {
    const state = this.state();
    return state.owner === this.userId() ? state : IDLE;
  });

  /** The tracked hostel id; '' when idle or loaded for another user. */
  readonly hostelId: Signal<string> = computed(() => this.current().hostelId);
  readonly view: Signal<HostBillingView> = computed(() => this.current().view);
  /** Kept during a same-hostel reload; cleared at once on a hostel switch. */
  readonly billing: Signal<HostBilling | null> = computed(() => this.current().billing);
  readonly canManageBilling: Signal<boolean> = computed(
    () => this.session.hasPermission(BILLING_PERMISSION) && this.view() !== 'forbidden',
  );
  readonly isAdmin: Signal<boolean> = computed(() => this.session.hasRole('super-admin', 'admin'));

  private readonly observed = computed(() => {
    const id = this.hostelId();
    const mine = id ? this.events.observations().filter((o) => o.hostelId === id) : [];
    return {
      inactive: mine.some((o) => o.kind === 'inactive'),
      crm: mine.some((o) => o.kind === 'crmRequired'),
      latestSeq: mine.reduce((max, o) => Math.max(max, o.seq), -1),
    };
  });
  private readonly access = computed<AccessState>(() =>
    deriveAccess({
      billing: this.billing(),
      inactiveObserved: this.observed().inactive,
      crmObserved: this.observed().crm,
      isAdmin: this.isAdmin(),
    }),
  );

  readonly offline: Signal<boolean> = computed(() => this.access().offline);
  readonly crmLocked: Signal<boolean> = computed(() => this.access().crmLocked);
  readonly bodyLock: Signal<'offline' | 'crm' | null> = computed(() => this.access().bodyLock);
  readonly bannerInput: Signal<BannerInput> = computed(() => ({
    billing: this.billing(),
    offlineObserved: this.observed().inactive,
    canManageBilling: this.canManageBilling(),
  }));

  private loadSub?: Subscription;
  /** Bumped by every load and accept, so only the latest request may write. */
  private epoch = 0;
  private lastLoadStartedAt = Number.NEGATIVE_INFINITY;
  /** The highest observation seq already answered, so each refusal triggers at most one refetch. */
  private handledSeq = -1;

  constructor() {
    effect(() => {
      const id = this.hostelId();
      const { latestSeq } = this.observed();
      untracked(() => {
        if (!id || latestSeq <= this.handledSeq) return;
        this.handledSeq = latestSeq;
        if (Date.now() - this.lastLoadStartedAt <= REFETCH_THROTTLE_MS) return;
        this.load(id);
      });
    });

    // A different user takes over the tracked hostel, so the shell need not re-track on an account switch.
    effect(() => {
      const holder = this.holder();
      if (holder === undefined || !this.browser) return;
      untracked(() => {
        const state = this.state();
        if (holder === state.owner) return;
        if (holder === null) {
          this.cancel();
          this.state.set({ owner: null, ...IDLE });
          return;
        }
        if (state.hostelId) this.track(state.hostelId);
      });
    });
  }

  /** Follows `hostelId` ('' stops tracking). A hostel already loaded, or with its request still open, is left alone. */
  track(hostelId: string): void {
    if (!this.browser) return;
    untracked(() => {
      const owner = this.userId();
      if (!hostelId || owner === null) {
        this.cancel();
        this.state.set({ owner, ...IDLE });
        return;
      }
      const state = this.state();
      const same = state.owner === owner && state.hostelId === hostelId;
      if (same && (state.view === 'ready' || (state.view === 'loading' && this.requestOpen()))) {
        return;
      }
      this.load(hostelId);
    });
  }

  /** Re-fetches the tracked hostel, keeping its billing on screen meanwhile. */
  refresh(): void {
    if (!this.browser) return;
    untracked(() => {
      const id = this.hostelId();
      if (id) this.load(id);
    });
  }

  /** Takes billing loaded elsewhere, when it is for the tracked hostel and the same user. */
  accept(hostelId: string, billing: HostBilling): void {
    if (!this.browser) return;
    untracked(() => {
      const owner = this.userId();
      const state = this.state();
      if (owner === null || !hostelId || state.owner !== owner || state.hostelId !== hostelId) {
        return;
      }
      // A load still in flight started before this billing was produced, so it may be older.
      this.cancel();
      const mark = this.events.mark();
      this.state.set({ owner, hostelId, view: 'ready', billing });
      this.events.clear(hostelId, mark);
    });
  }

  private load(hostelId: string): void {
    const owner = this.userId();
    const state = this.state();
    const kept = state.owner === owner && state.hostelId === hostelId ? state.billing : null;
    this.cancel();
    const epoch = this.epoch;
    this.lastLoadStartedAt = Date.now();
    if (!this.session.hasPermission(BILLING_PERMISSION)) {
      this.state.set({ owner, hostelId, view: 'forbidden', billing: null });
      return;
    }
    const mark = this.events.mark();
    this.state.set({ owner, hostelId, view: 'loading', billing: kept });
    this.loadSub = this.api.billing(hostelId).subscribe({
      next: (billing) => {
        if (!this.isCurrent(epoch, owner)) return;
        this.state.set({ owner, hostelId, view: 'ready', billing });
        this.events.clear(hostelId, mark);
      },
      error: (err: unknown) => {
        if (!this.isCurrent(epoch, owner)) return;
        const forbidden = (err as { status?: number } | null)?.status === 403;
        this.state.set({ owner, hostelId, view: forbidden ? 'forbidden' : 'error', billing: null });
      },
    });
  }

  /** Drops any request in flight; its response, if it still arrives, is ignored. */
  private cancel(): void {
    this.epoch++;
    this.loadSub?.unsubscribe();
    this.loadSub = undefined;
  }

  private requestOpen(): boolean {
    return this.loadSub !== undefined && !this.loadSub.closed;
  }

  private isCurrent(epoch: number, owner: string | null): boolean {
    return epoch === this.epoch && untracked(() => this.userId()) === owner;
  }
}
