import { PLATFORM_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Observable, Subject, defer } from 'rxjs';
import type { Permission, Role } from '@core/auth/roles';
import { SessionStore, SessionUser } from '@core/auth/session-store';
import type { BillingSubscription, HostBilling } from '@hostelhive/data-access';
import { HostAccessEvents } from '@app/core/host-access/host-access';
import { BillingApi } from './billing-api';
import { HostBillingStore } from './host-billing-store';

const NOW = Date.parse('2026-10-11T12:00:00Z');
const DAY = 86_400_000;

function subscription(overrides: Partial<BillingSubscription> = {}): BillingSubscription {
  return {
    id: 'sub1',
    status: { id: 1, name: 'Active', slug: 'active' },
    currency: 'PKR',
    plan: { id: 'qTFruf', code: 'listing_crm', name: 'Listing + CRM', features: ['crm'] },
    current_period_start: new Date(NOW - 20 * DAY).toISOString(),
    current_period_end: new Date(NOW + 10 * DAY).toISOString(),
    grace_until: null,
    scheduled_plan: null,
    cancel_at_period_end: false,
    billed_by: 'invoice',
    safepay_status: null,
    ...overrides,
  };
}

function billing(overrides: Partial<HostBilling> = {}): HostBilling {
  return {
    currency: 'PKR',
    country_code: 'PK',
    payment_methods: ['safepay'],
    auto_renew: false,
    saved_card: null,
    subscription: subscription(),
    features: ['listing', 'crm'],
    open_invoice: null,
    plans: [],
    ...overrides,
  };
}

function user(id: string, opts: { permissions?: Permission[]; role?: Role } = {}): SessionUser {
  const role = opts.role ?? 'host';
  return {
    id,
    name: `User ${id}`,
    email: `${id}@h.pk`,
    role,
    allRoles: [role],
    permissions: opts.permissions ?? [],
  };
}

/** `BillingApi.billing()` with every request left pending until the test answers it. */
class BillingApiStub {
  readonly calls: string[] = [];
  private readonly pending: Subject<HostBilling>[] = [];

  billing(hostelId: string): Observable<HostBilling> {
    return defer(() => {
      this.calls.push(hostelId);
      const response = new Subject<HostBilling>();
      this.pending.push(response);
      return response;
    });
  }

  respond(index: number, value: HostBilling): void {
    this.pending[index].next(value);
    this.pending[index].complete();
  }

  fail(index: number, status: number): void {
    this.pending[index].error({ status, code: 'unknown_error', message: 'x' });
  }
}

let api: BillingApiStub;
let session: SessionStore;
let events: HostAccessEvents;
let store: HostBillingStore;
let now: number;

function setUp(opts: { signedIn?: SessionUser; platform?: 'browser' | 'server' } = {}): void {
  localStorage.clear();
  TestBed.resetTestingModule();
  api = new BillingApiStub();
  TestBed.configureTestingModule({
    providers: [
      { provide: BillingApi, useValue: api },
      { provide: PLATFORM_ID, useValue: opts.platform ?? 'browser' },
    ],
  });
  session = TestBed.inject(SessionStore);
  session.setSession(opts.signedIn ?? user('A'), 'tok');
  events = TestBed.inject(HostAccessEvents);
  store = TestBed.inject(HostBillingStore);
}

describe('HostBillingStore', () => {
  beforeEach(() => {
    now = NOW;
    vi.spyOn(Date, 'now').mockImplementation(() => now);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  describe('tracking', () => {
    it('is idle until a hostel is tracked, and idle again for an empty id', () => {
      setUp();
      expect(store.view()).toBe('idle');
      expect(store.hostelId()).toBe('');

      store.track('h1');
      expect(store.view()).toBe('loading');
      store.track('');

      expect(store.view()).toBe('idle');
      expect(store.hostelId()).toBe('');
      expect(api.calls).toEqual(['h1']);
    });

    it('loads the hostel once while it is loading or loaded', () => {
      setUp();
      store.track('h1');
      store.track('h1');
      expect(store.hostelId()).toBe('h1');
      expect(store.view()).toBe('loading');

      api.respond(0, billing());
      store.track('h1');

      expect(store.view()).toBe('ready');
      expect(store.billing()).toEqual(billing());
      expect(api.calls).toEqual(['h1']);
    });

    it('makes no request and reads forbidden when the billing permission is absent', () => {
      setUp({ signedIn: user('A', { permissions: ['core:Hostel:show'] }) });
      store.track('h1');

      expect(api.calls).toEqual([]);
      expect(store.view()).toBe('forbidden');
      expect(store.billing()).toBeNull();
      expect(store.canManageBilling()).toBe(false);
    });

    it('reads forbidden on a 403', () => {
      setUp();
      store.track('h1');
      expect(store.canManageBilling()).toBe(true);

      api.fail(0, 403);

      expect(store.view()).toBe('forbidden');
      expect(store.billing()).toBeNull();
      expect(store.canManageBilling()).toBe(false);
    });

    it('reads error with no billing on any other failure', () => {
      setUp();
      store.track('h1');
      api.respond(0, billing());
      store.refresh();

      api.fail(1, 500);

      expect(store.view()).toBe('error');
      expect(store.billing()).toBeNull();
      expect(store.canManageBilling()).toBe(true);
    });

    it('keeps the billing on screen while the same hostel reloads', () => {
      setUp();
      store.track('h1');
      api.respond(0, billing());

      store.refresh();
      expect(store.view()).toBe('loading');
      expect(store.billing()).toEqual(billing());

      const renewed = billing({ features: ['listing'] });
      api.respond(1, renewed);
      expect(store.billing()).toEqual(renewed);
    });

    it('clears the billing at once on a hostel switch and drops the late response', () => {
      setUp();
      store.track('h1');
      api.respond(0, billing());
      store.refresh();

      store.track('h2');
      expect(store.hostelId()).toBe('h2');
      expect(store.billing()).toBeNull();

      api.respond(1, billing({ currency: 'USD' }));
      expect(store.hostelId()).toBe('h2');
      expect(store.view()).toBe('loading');
      expect(store.billing()).toBeNull();

      api.respond(2, billing({ currency: 'EUR' }));
      expect(store.billing()?.currency).toBe('EUR');
    });

    it('empties every read for another user, and drops the late response', () => {
      setUp();
      store.track('h1');

      session.setSession(user('B'), 'tok-B');
      api.respond(0, billing());

      expect(store.hostelId()).toBe('');
      expect(store.view()).toBe('idle');
      expect(store.billing()).toBeNull();

      session.setSession(user('A'), 'tok-A');
      expect(store.billing()).toBeNull();
    });

    it('hides a loaded hostel from the next user and loads it afresh for them', () => {
      setUp();
      store.track('h1');
      api.respond(0, billing());

      session.setSession(user('B'), 'tok-B');
      expect(store.billing()).toBeNull();

      store.track('h1');
      expect(api.calls).toEqual(['h1', 'h1']);
      expect(store.view()).toBe('loading');
      expect(store.billing()).toBeNull();
    });
  });

  describe('user switch', () => {
    it('loads again on track when a dropped response left the hostel loading', () => {
      setUp();
      store.track('h1');
      session.setSession(user('B'), 'tok-B');
      api.respond(0, billing({ currency: 'USD' }));
      session.setSession(user('A'), 'tok-A');
      expect(store.view()).toBe('loading');

      store.track('h1');
      expect(api.calls).toEqual(['h1', 'h1']);

      api.respond(1, billing());
      expect(store.view()).toBe('ready');
      expect(store.billing()?.currency).toBe('PKR');
    });

    it('reloads the tracked hostel for the user who takes over', () => {
      setUp();
      store.track('h1');
      api.respond(0, billing());
      TestBed.tick();

      session.setSession(user('B'), 'tok-B');
      TestBed.tick();

      expect(api.calls).toEqual(['h1', 'h1']);
      expect(store.hostelId()).toBe('h1');
      expect(store.view()).toBe('loading');
      expect(store.billing()).toBeNull();

      api.respond(1, billing({ currency: 'USD' }));
      expect(store.billing()?.currency).toBe('USD');
    });

    it('drops the previous user request once the next user takes over', () => {
      setUp();
      store.track('h1');
      TestBed.tick();

      session.setSession(user('B'), 'tok-B');
      TestBed.tick();
      api.respond(0, billing({ currency: 'PKR' }));
      expect(store.view()).toBe('loading');

      api.respond(1, billing({ currency: 'USD' }));
      expect(store.billing()?.currency).toBe('USD');
    });

    it('stops tracking on sign-out and loads nothing for the next sign-in', () => {
      setUp();
      store.track('h1');
      api.respond(0, billing());
      TestBed.tick();

      session.clear();
      TestBed.tick();
      session.setSession(user('B'), 'tok-B');
      TestBed.tick();

      expect(api.calls).toEqual(['h1']);
      expect(store.view()).toBe('idle');
      expect(store.hostelId()).toBe('');
    });

    it('waits while a token is still restoring its user', () => {
      setUp();
      store.track('h1');
      api.respond(0, billing());
      TestBed.tick();

      session.clear();
      session.setAccessToken('tok');
      TestBed.tick();
      session.setSession(user('A'), 'tok');
      TestBed.tick();

      expect(api.calls).toEqual(['h1']);
      expect(store.billing()).toEqual(billing());
    });
  });

  describe('accept', () => {
    it('applies billing for the tracked hostel and drops the load in flight', () => {
      setUp();
      store.track('h1');
      const changed = billing({ features: ['listing'] });

      store.accept('h1', changed);
      expect(store.view()).toBe('ready');
      expect(store.billing()).toEqual(changed);

      api.respond(0, billing());
      expect(store.billing()).toEqual(changed);
    });

    it('ignores another hostel', () => {
      setUp();
      store.track('h1');
      api.respond(0, billing());

      store.accept('h2', billing({ currency: 'USD' }));

      expect(store.hostelId()).toBe('h1');
      expect(store.billing()?.currency).toBe('PKR');
    });

    it('ignores billing once the user has changed', () => {
      setUp();
      store.track('h1');
      api.respond(0, billing());

      session.setSession(user('B'), 'tok-B');
      store.accept('h1', billing({ currency: 'USD' }));
      session.setSession(user('A'), 'tok-A');

      expect(store.billing()?.currency).toBe('PKR');
    });

    it('clears the refusals seen before it', () => {
      setUp();
      store.track('h1');
      events.record({ hostelId: 'h1', kind: 'inactive' });

      store.accept('h1', billing());

      expect(events.observations()).toEqual([]);
    });
  });

  describe('plan refusals', () => {
    it('a load clears only the refusals seen before it started', () => {
      setUp();
      events.record({ hostelId: 'h1', kind: 'inactive' });
      events.record({ hostelId: 'h2', kind: 'inactive' });
      store.track('h1');
      events.record({ hostelId: 'h1', kind: 'crmRequired' });

      api.respond(0, billing());

      expect(events.observations().map((o) => [o.hostelId, o.kind])).toEqual([
        ['h2', 'inactive'],
        ['h1', 'crmRequired'],
      ]);
    });

    it('a failed load clears nothing', () => {
      setUp();
      events.record({ hostelId: 'h1', kind: 'inactive' });
      store.track('h1');

      api.fail(0, 500);

      expect(events.observations()).toHaveLength(1);
    });

    it('refetches on a new refusal only when the last load started over 30 s ago', () => {
      setUp();
      store.track('h1');
      api.respond(0, billing());
      TestBed.tick();

      now = NOW + 10_000;
      events.record({ hostelId: 'h1', kind: 'inactive' });
      TestBed.tick();
      expect(api.calls).toEqual(['h1']);

      now = NOW + 31_000;
      events.record({ hostelId: 'h1', kind: 'inactive' });
      TestBed.tick();
      expect(api.calls).toEqual(['h1', 'h1']);
      expect(store.billing()).toEqual(billing());

      TestBed.tick();
      expect(api.calls).toEqual(['h1', 'h1']);
    });

    it('does not refetch for a refusal on another hostel', () => {
      setUp();
      store.track('h1');
      api.respond(0, billing());
      TestBed.tick();

      now = NOW + 60_000;
      events.record({ hostelId: 'h2', kind: 'inactive' });
      TestBed.tick();

      expect(api.calls).toEqual(['h1']);
    });
  });

  describe('access', () => {
    it('reads offline from an observed refusal while billing is unknown', () => {
      setUp();
      store.track('h1');
      events.record({ hostelId: 'h1', kind: 'inactive' });

      expect(store.offline()).toBe(true);
      expect(store.bodyLock()).toBe('offline');
      expect(store.bannerInput()).toEqual({
        billing: null,
        offlineObserved: true,
        canManageBilling: true,
      });
    });

    it('ignores refusals for another hostel', () => {
      setUp();
      store.track('h1');
      events.record({ hostelId: 'h2', kind: 'crmRequired' });

      expect(store.crmLocked()).toBe(false);
      expect(store.bodyLock()).toBeNull();
    });

    it('locks CRM on a live plan without it', () => {
      setUp();
      store.track('h1');
      api.respond(0, billing({ features: ['listing'] }));

      expect(store.offline()).toBe(false);
      expect(store.crmLocked()).toBe(true);
      expect(store.bodyLock()).toBe('crm');
    });

    it('reads offline from billing with no subscription', () => {
      setUp();
      store.track('h1');
      api.respond(0, billing({ subscription: null, features: [] }));

      expect(store.offline()).toBe(true);
      expect(store.crmLocked()).toBe(false);
      expect(store.bodyLock()).toBe('offline');
    });

    it('never locks an admin', () => {
      setUp({ signedIn: user('A', { role: 'admin' }) });
      store.track('h1');
      api.respond(0, billing({ features: ['listing'] }));

      expect(store.isAdmin()).toBe(true);
      expect(store.crmLocked()).toBe(false);
      expect(store.bodyLock()).toBeNull();
    });

    it('does not exempt a moderator from the CRM or offline locks', () => {
      setUp({ signedIn: user('M', { role: 'moderator' }) });
      store.track('h1');
      api.respond(0, billing({ features: ['listing'] }));

      expect(store.isAdmin()).toBe(false);
      expect(store.crmLocked()).toBe(true);
      expect(store.bodyLock()).toBe('crm');

      events.record({ hostelId: 'h1', kind: 'inactive' });

      expect(store.bodyLock()).toBe('offline');
    });
  });

  describe('server render', () => {
    it('fetches nothing and stays idle', () => {
      setUp({ platform: 'server' });

      store.track('h1');
      store.refresh();
      store.accept('h1', billing());

      expect(api.calls).toEqual([]);
      expect(store.view()).toBe('idle');
      expect(store.billing()).toBeNull();
    });
  });
});
