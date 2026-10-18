import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { HostOpsApi, HostPropertyStore, UtilityBillUpdate } from '@services';
import { HostRoom, Tenant, UtilityBill, UtilityType } from '@hostelhive/data-access';
import { CANCAN_MESSAGE, RefusalKind, refusalError } from '@app/testing/backend-refusals';
import { HOSTEL_ID, roomsReply, sessionUser } from '@app/testing/host-builders';
import { hostPageDeps, hostPageProviders } from '@app/testing/host-page';
import { seedHostPropertyStore } from '@app/testing/host-stubs';
import { LIST_LOAD_REFUSALS, kindsShowing, loadSurface } from '@app/testing/load-refusal-surface';
import type { Role } from '@core/auth/roles';
import { SessionStore } from '@core/auth/session-store';
import { AddBill } from './add-bill';

const ROOM: HostRoom = {
  id: 'bCGPAU',
  number: '01',
  floor: 'ground',
  type: 'Triple sharing',
  capacity: 3,
  occupied: 2,
  rentPerBed: 8000,
  attachedBath: false,
  createdAt: '2026-10-01',
};

function tenant(id: string, name: string): Tenant {
  return {
    id,
    name,
    phone: '',
    initials: name.slice(0, 2).toUpperCase(),
    roomId: ROOM.id,
    roomNumber: ROOM.number,
    joined: '2026-09-01',
    rent: 8000,
    deposit: 0,
    messBreakfast: false,
    messLunch: false,
    messDinner: false,
    status: 'active',
  } as Tenant;
}

/** Room 01's October electricity: 300 kWh at 92, split between Ali (31 days) and Sara (15). */
function bill(over: Partial<UtilityBill> = {}): UtilityBill {
  return {
    id: 'aVXGyz',
    roomId: ROOM.id,
    roomNumber: ROOM.number,
    tenantName: 'Ali, Sara',
    type: 'electricity',
    startReading: 2000,
    endReading: 2300,
    units: 300,
    rate: 92,
    total: 27600,
    received: 0,
    split: 'prorata',
    issuedDate: '2026-10-01T00:00:00.000+05:00',
    dueDate: '2026-10-30T00:00:00.000+05:00',
    splits: [
      { id: 'rbAli1', tenantId: 'tAli01', name: 'Ali Khan', amount: 18600, days: 31, received: 0 },
      { id: 'rbSar2', tenantId: 'tSar02', name: 'Sara Ahmed', amount: 9000, days: 15, received: 0 },
    ],
    ...over,
  };
}

/** The form's own state, which the template reads; reached here without rendering it. */
interface Form {
  rows(): { tenantId: string; days: number; share: number }[];
  total(): number;
  rateInput: { set(v: string): void };
  setDays(tenantId: string, value: string): void;
  addToBatch(): void;
}

function open(opts: { saved?: UtilityBill; tenants?: Tenant[] } = {}) {
  const updates: { hostelId: string; billId: string; body: UtilityBillUpdate }[] = [];
  const creates: unknown[] = [];
  const api = {
    rooms: () => of({ rooms: [ROOM] }),
    renters: () =>
      of({ renters: opts.tenants ?? [tenant('tAli01', 'Ali Khan'), tenant('tSar02', 'Sara Ahmed')] }),
    utilityBillFormOptions: () => of([]),
    utilityMeta: (type: UtilityType) => ({ type, label: type, icon: '', metered: true, unit: 'kWh', split: 'prorata' }),
    getUtilityBill: () => of(opts.saved ?? bill()),
    updateUtilityBill: (hostelId: string, billId: string, body: UtilityBillUpdate) => {
      updates.push({ hostelId, billId, body });
      return of(null);
    },
    createUtilityBill: (_hostelId: string, body: unknown) => {
      creates.push(body);
      return of(null);
    },
  };
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      { provide: HostOpsApi, useValue: api },
      { provide: HostPropertyStore, useValue: { selected: signal('DZNqAc'), timeZoneOf: () => of(null) } },
      { provide: ActivatedRoute, useValue: { snapshot: { paramMap: convertToParamMap({ billId: 'aVXGyz' }) } } },
    ],
  });
  TestBed.overrideComponent(AddBill, { set: { template: '', imports: [] } });
  const fixture = TestBed.createComponent(AddBill);
  fixture.detectChanges();
  return { form: fixture.componentInstance as unknown as Form, updates, creates };
}

/**
 * Editing a utility bill.
 *
 * Seen live on 2026-10-11 (bill aVXGyz): changing the rate from 92 to 93 and saving moved the
 * renter's share to 27,900 while the bill kept total_amount 27,600 and rate 92, because only the
 * shares were sent. Re-opening it then showed the share as 27,600, recomputed from the bill,
 * rather than the 27,900 the renter had been billed.
 */
describe('AddBill — editing a bill', () => {
  it('shows the shares and days the bill was saved with', () => {
    const { form } = open();

    expect(form.rows().map((r) => [r.tenantId, r.days, r.share])).toEqual([
      ['tAli01', 31, 18600],
      ['tSar02', 15, 9000],
    ]);
  });

  it('shows saved shares even when they no longer match the total', () => {
    const saved = bill();
    saved.splits![0] = { ...saved.splits![0], amount: 18900 };

    const { form } = open({ saved });

    expect(form.rows().map((r) => r.share)).toEqual([18900, 9000]);
  });

  it('still shows the saved shares when the bill comes back without days', () => {
    // The show endpoint's renter bills carry no bill_days (seen live, 2026-10-11), which the
    // mapper turns into 0; the form falls back to the month's days.
    const saved = bill();
    saved.splits = saved.splits!.map((s) => ({ ...s, days: 0 }));

    const { form } = open({ saved });

    expect(form.rows().map((r) => [r.days, r.share])).toEqual([
      [31, 18600],
      [31, 9000],
    ]);
  });

  it('re-splits once the host changes the total', () => {
    const { form } = open();

    form.rateInput.set('93');

    expect(form.total()).toBe(27900);
    expect(form.rows().reduce((n, r) => n + r.share, 0)).toBe(27900);
  });

  it('re-splits once the host changes someone’s days', () => {
    const { form } = open();

    form.setDays('tSar02', '31');

    expect(form.rows().map((r) => r.share)).toEqual([13800, 13800]);
  });

  it('keeps the renters it was issued to, not who lives in the room now', () => {
    // Sara has moved out; Bilal has moved in since the bill was issued.
    const { form } = open({ tenants: [tenant('tAli01', 'Ali Khan'), tenant('tBil03', 'Bilal Raza')] });

    expect(form.rows().map((r) => r.tenantId)).toEqual(['tAli01', 'tSar02']);
  });

  it('saves the bill figures with the shares, each share on its own renter bill', () => {
    const { form, updates, creates } = open();

    form.rateInput.set('93');
    form.addToBatch();

    expect(creates).toEqual([]);
    expect(updates).toHaveLength(1);
    const { hostelId, billId, body } = updates[0];
    expect([hostelId, billId]).toEqual(['DZNqAc', 'aVXGyz']);
    expect(body).toMatchObject({
      total_amount: 27900,
      cost_per_unit: 93,
      consumed_units: 300,
      previous_units: 2000,
      current_units: 2300,
      issued_date: '2026-10-01',
      due_date: '2026-10-30',
    });
    const shares = body.renter_bills_attributes;
    expect(shares.map((r) => [r.id, r.bill_days])).toEqual([
      ['rbAli1', 31],
      ['rbSar2', 15],
    ]);
    expect(shares.reduce((n, r) => n + r.amount, 0)).toBe(27900);
    expect(shares[0].break_down).toEqual({ electricity_bill: shares[0].amount });
  });

  it('saves the stored shares unchanged when the split was not touched', () => {
    const saved = bill();
    saved.splits![0] = { ...saved.splits![0], amount: 18900 };
    const { form, updates } = open({ saved });

    form.addToBatch();

    expect(updates[0].body.renter_bills_attributes.map((r) => r.amount)).toEqual([18900, 9000]);
  });
});

const HOSTEL_API = `https://api.test/api/host/hostels/${HOSTEL_ID}`;

/** The three reads the form waits on, each with the endpoint it hits. */
const LOAD_URLS = {
  rooms: `${HOSTEL_API}/rooms`,
  renters: `${HOSTEL_API}/renters`,
  utilityBillFormOptions: `${HOSTEL_API}/utility_bills/new`,
} as const;

type Load = keyof typeof LOAD_URLS;

const LOADS = Object.keys(LOAD_URLS) as Load[];

const ROLE_SENTENCES = [
  { role: 'host', sentence: 'hostAccess.pageNotAllowedOwner' },
  { role: 'manager', sentence: 'hostAccess.pageNotAllowed' },
] as const satisfies readonly { role: Role; sentence: string }[];

/** Mounts the real page in add mode, signed in as `role`; each read in `refusals` is refused, the rest succeed. */
async function openRefused(refusals: Partial<Record<Load, RefusalKind>>, role: Role = 'host') {
  const answer = <T>(load: Load, reply: T) =>
    vi.fn(() => {
      const kind = refusals[load];
      return kind ? throwError(() => refusalError(kind, { url: LOAD_URLS[load] })) : of(reply);
    });
  const deps = hostPageDeps();
  Object.assign(deps.ops, {
    rooms: answer('rooms', roomsReply()),
    renters: answer('renters', { renters: [], total: 0 }),
    utilityBillFormOptions: answer('utilityBillFormOptions', []),
    utilityMeta: (type: UtilityType) => ({ type, label: type, icon: '', metered: true, unit: 'kWh', split: 'prorata' }),
  });
  TestBed.configureTestingModule({ providers: hostPageProviders({}, deps) });
  // The host store keeps its hostel list per user, so the session has to exist before it is seeded.
  TestBed.inject(SessionStore).setSession(sessionUser(role), 'tok');
  seedHostPropertyStore('month');
  const fixture = TestBed.createComponent(AddBill);
  for (let round = 0; round < 2; round++) {
    fixture.detectChanges();
    await fixture.whenStable();
  }
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  return { el, shown: loadSurface(el) };
}

describe('AddBill — a refused load in add mode', () => {
  // A signed-in host persists its hostel choice and the session persists itself; neither may reach the next test.
  afterEach(() => {
    TestBed.inject(HostPropertyStore).clear();
    TestBed.inject(SessionStore).clear();
  });

  it('renders the form, and no error surface, when every read succeeds', async () => {
    const { shown } = await openRefused({});

    expect(shown.surfaces).toEqual([]);
    expect(shown.text).toContain('hostUtilities.billDetails');
  });

  describe('for a permission the role lacks', () => {
    const cases = LOADS.flatMap((load) =>
      kindsShowing('permission').flatMap((kind) => ROLE_SENTENCES.map((r) => ({ load, kind, ...r }))),
    );

    it.each(cases)(
      'says a $role account may not see this, and offers no retry, when $load answers a $kind refusal and the other reads succeed',
      async ({ load, kind, role, sentence }) => {
        const { shown } = await openRefused({ [load]: kind }, role);

        expect(shown.surfaces).toEqual([LIST_LOAD_REFUSALS[kind]]);
        expect(shown.heading).toBe('coreForbidden.accessBlocked');
        expect(shown.body).toBe(sentence);
        expect(shown.retry).toBe(false);
        expect(shown.text).not.toContain('common.retry');
        expect(shown.text).not.toContain(CANCAN_MESSAGE);
        expect(shown.text).not.toContain('hostUtilities.billDetails');
      },
    );
  });

  describe('for a plan without CRM on the rooms read', () => {
    it.each<RefusalKind>(['crmRequired', 'crmMessageOnly'])('shows the generic error with Retry, not the panel or the paywall, after a %s refusal', async (kind) => {
      const { shown } = await openRefused({ rooms: kind });

      expect(shown.surfaces).toEqual([LIST_LOAD_REFUSALS[kind]]);
      expect(shown.heading).toBe('states.somethingWentWrong');
      expect(shown.retry).toBe(true);
      expect(shown.text).not.toContain('hostAccess.pageNotAllowed');
    });
  });

  describe('for a hostel with no live plan on the rooms read', () => {
    it.each(kindsShowing('paywall'))('shows the paywall, not the panel or a retry, after a %s refusal', async (kind) => {
      const { shown } = await openRefused({ rooms: kind });

      expect(shown.surfaces).toEqual([LIST_LOAD_REFUSALS[kind]]);
      expect(shown.retry).toBe(false);
      expect(shown.text).not.toContain('hostAccess.pageNotAllowed');
    });
  });

  describe('for a failure on the rooms read that is not a permission or plan refusal', () => {
    it.each<RefusalKind>(['rateLimited', 'notFound', 'unprocessable', 'serverError'])(
      'shows the generic error with Retry after a %s refusal',
      async (kind) => {
        const { shown } = await openRefused({ rooms: kind });

        expect(shown.surfaces).toEqual([LIST_LOAD_REFUSALS[kind]]);
        expect(shown.heading).toBe('states.somethingWentWrong');
        expect(shown.retry).toBe(true);
        expect(shown.text).not.toContain('hostAccess.pageNotAllowed');
      },
    );
  });

  describe('when the server never answers the rooms read', () => {
    it.each(kindsShowing('network'))('shows the connection error with Retry after a %s failure', async (kind) => {
      const { shown } = await openRefused({ rooms: kind });

      expect(shown.surfaces).toEqual([LIST_LOAD_REFUSALS[kind]]);
      expect(shown.heading).toBe('states.cantConnect');
      expect(shown.retry).toBe(true);
      expect(shown.text).not.toContain('hostAccess.pageNotAllowed');
    });
  });
});
