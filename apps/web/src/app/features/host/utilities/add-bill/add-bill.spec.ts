import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { Observable, of, throwError } from 'rxjs';
import { HostOpsApi, HostPropertyStore, UtilityBillUpdate } from '@services';
import { ApiError, HostRoom, Tenant, UtilityBill, UtilityType } from '@hostelhive/data-access';
import { CANCAN_MESSAGE, RefusalKind, refusalError } from '@app/testing/backend-refusals';
import { HOSTEL_ID, roomsReply, sessionUser } from '@app/testing/host-builders';
import { hostPageDeps, hostPageProviders } from '@app/testing/host-page';
import { NotificationSpy, seedHostPropertyStore } from '@app/testing/host-stubs';
import { LIST_LOAD_REFUSALS, PLAN_REFUSALS, kindsShowing, loadSurface } from '@app/testing/load-refusal-surface';
import type { Role } from '@core/auth/roles';
import { provideI18nTesting } from '@core/i18n/provide-i18n-testing';
import { PAGE_SIZE } from '@util/pagination';
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
  submitError: { (): string | null; set(v: string | null): void };
  type: { set(v: UtilityType): void };
  roomId: { set(v: string): void };
  totalInput: { set(v: string): void };
}

/** The options a quiet request carries, so the interceptor raises no toast of its own. */
const QUIET = { suppressErrorToast: true };

interface OpenOptions {
  saved?: UtilityBill;
  tenants?: Tenant[];
  /** The bill being edited; `null` opens the add form. */
  billId?: string | null;
  /** Signs in as this role; left signed out otherwise. */
  role?: Role;
  create?: () => Observable<unknown>;
  update?: () => Observable<unknown>;
}

/** Fills the add form with a water bill for the room and saves it. */
function saveNew(form: Form): void {
  form.type.set('water');
  form.roomId.set(ROOM.id);
  form.totalInput.set('500');
  form.addToBatch();
}

function open(opts: OpenOptions = {}) {
  const notifications = new NotificationSpy();
  const options = { create: [] as unknown[], update: [] as unknown[] };
  const updates: { hostelId: string; billId: string; body: UtilityBillUpdate }[] = [];
  const creates: unknown[] = [];
  const api = {
    rooms: () => of({ rooms: [ROOM] }),
    renters: () =>
      of({ renters: opts.tenants ?? [tenant('tAli01', 'Ali Khan'), tenant('tSar02', 'Sara Ahmed')] }),
    utilityBillFormOptions: () => of([]),
    utilityMeta: (type: UtilityType) => ({ type, label: type, icon: '', metered: true, unit: 'kWh', split: 'prorata' }),
    getUtilityBill: () => of(opts.saved ?? bill()),
    updateUtilityBill: (hostelId: string, billId: string, body: UtilityBillUpdate, request?: unknown) => {
      updates.push({ hostelId, billId, body });
      options.update.push(request);
      return opts.update?.() ?? of(null);
    },
    createUtilityBill: (_hostelId: string, body: unknown, request?: unknown) => {
      creates.push(body);
      options.create.push(request);
      return opts.create?.() ?? of(null);
    },
  };
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      provideI18nTesting(),
      notifications.provider(),
      { provide: HostOpsApi, useValue: api },
      { provide: HostPropertyStore, useValue: { selected: signal('DZNqAc'), timeZoneOf: () => of(null) } },
      { provide: ActivatedRoute, useValue: { snapshot: { paramMap: convertToParamMap(opts.billId === null ? {} : { billId: opts.billId ?? 'aVXGyz' }) } } },
    ],
  });
  TestBed.overrideComponent(AddBill, { set: { template: '', imports: [] } });
  if (opts.role) TestBed.inject(SessionStore).setSession(sessionUser(opts.role), 'tok');
  const fixture = TestBed.createComponent(AddBill);
  fixture.detectChanges();
  return { form: fixture.componentInstance as unknown as Form, updates, creates, notifications, options };
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
  return { el, deps, shown: loadSurface(el) };
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

  describe('for a plan refusal on the rooms read, which the console lock owns', () => {
    it.each(PLAN_REFUSALS)('shows the generic error with Retry, not the panel, after a %s refusal', async (kind) => {
      const { shown } = await openRefused({ rooms: kind });

      expect(shown.surfaces).toEqual([LIST_LOAD_REFUSALS[kind]]);
      expect(shown.heading).toBe('states.somethingWentWrong');
      expect(shown.retry).toBe(true);
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

const BILL_URL = `${HOSTEL_API}/utility_bills/aVXGyz`;

const TOAST_BY_ROLE = [
  { role: 'host', key: 'hostBookings.notAllowedOwner' },
  { role: 'manager', key: 'hostBookings.notAllowed' },
] as const satisfies readonly { role: Role; key: string }[];

/** Mounts the real page on the edit route, signed in as `role`; the bill's own read answers with `error`. */
async function openEditRefused(error: ApiError, role: Role = 'host') {
  const deps = hostPageDeps();
  Object.assign(deps.ops, {
    rooms: vi.fn(() => of(roomsReply())),
    renters: vi.fn(() => of({ renters: [], total: 0 })),
    utilityBillFormOptions: vi.fn(() => of([])),
    utilityMeta: (type: UtilityType) => ({ type, label: type, icon: '', metered: true, unit: 'kWh', split: 'prorata' }),
    getUtilityBill: vi.fn(() => throwError(() => error)),
  });
  TestBed.configureTestingModule({
    providers: [
      ...hostPageProviders({}, deps),
      { provide: ActivatedRoute, useValue: { snapshot: { paramMap: convertToParamMap({ billId: 'aVXGyz' }) } } },
    ],
  });
  TestBed.inject(SessionStore).setSession(sessionUser(role), 'tok');
  seedHostPropertyStore('month');
  const fixture = TestBed.createComponent(AddBill);
  for (let round = 0; round < 2; round++) {
    fixture.detectChanges();
    await fixture.whenStable();
  }
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  return { el, deps, shown: loadSurface(el) };
}

describe('AddBill — a refused read of the bill being edited', () => {
  afterEach(() => {
    TestBed.inject(HostPropertyStore).clear();
    TestBed.inject(SessionStore).clear();
  });

  const refusedBill = (kind: RefusalKind, role?: Role) =>
    openEditRefused(refusalError(kind, { url: BILL_URL }), role);

  describe('for a permission the role lacks', () => {
    const cases = kindsShowing('permission').flatMap((kind) => ROLE_SENTENCES.map((r) => ({ kind, ...r })));

    it.each(cases)(
      'says a $role account may not see this, with no form and no retry, after a $kind refusal',
      async ({ kind, role, sentence }) => {
        const { el, shown } = await refusedBill(kind, role);

        expect(shown.surfaces).toEqual(['permission']);
        expect(shown.heading).toBe('coreForbidden.accessBlocked');
        expect(shown.body).toBe(sentence);
        expect(shown.retry).toBe(false);
        expect(shown.text).not.toContain('common.retry');
        expect(shown.text).not.toContain(CANCAN_MESSAGE);
        expect(shown.text).not.toContain('hostUtilities.billDetails');
        expect(el.querySelector('form')).toBeNull();
      },
    );

    it('reads the bill without the global toast', async () => {
      const { deps } = await refusedBill('permissionCanCan');

      // The stub has no getUtilityBill of its own; `open` assigns the mock.
      const ops = deps.ops as unknown as Pick<HostOpsApi, 'getUtilityBill'>;
      expect(ops.getUtilityBill).toHaveBeenCalledWith(HOSTEL_ID, 'aVXGyz', QUIET);
    });
  });

  describe('for a failure that is not a permission refusal', () => {
    it.each<RefusalKind>(['notFound', 'serverError'])('shows the generic error with Retry, not the panel, after a %s refusal', async (kind) => {
      const { shown } = await refusedBill(kind);

      expect(shown.surfaces).toEqual(['error']);
      expect(shown.heading).toBe('states.somethingWentWrong');
      expect(shown.retry).toBe(true);
      expect(shown.text).not.toContain('hostAccess.pageNotAllowed');
    });

    // The bill's own read has no offline variant: only the form's three reads set the page's networkError.
    it.each(kindsShowing('network'))('shows the generic error with Retry after a %s failure', async (kind) => {
      const { shown } = await refusedBill(kind);

      expect(shown.surfaces).toEqual(['error']);
      expect(shown.heading).toBe('states.somethingWentWrong');
      expect(shown.retry).toBe(true);
    });
  });
});

describe('AddBill — the add form reads', () => {
  afterEach(() => {
    TestBed.inject(HostPropertyStore).clear();
    TestBed.inject(SessionStore).clear();
  });

  it('asks for rooms, renters and the bill options without the global toast', async () => {
    const fixtureDeps = await openRefused({});
    // `openRefused` assigns the reads the stub lacks.
    const ops = fixtureDeps.deps.ops as unknown as Pick<HostOpsApi, 'rooms' | 'renters' | 'utilityBillFormOptions'>;

    expect(ops.rooms).toHaveBeenCalledWith(HOSTEL_ID, 1, PAGE_SIZE, {}, QUIET);
    expect(ops.renters).toHaveBeenCalledWith(HOSTEL_ID, 1, PAGE_SIZE, {}, QUIET);
    expect(ops.utilityBillFormOptions).toHaveBeenCalledWith(HOSTEL_ID, QUIET);
  });
});

describe('AddBill — a refused save', () => {
  afterEach(() => TestBed.inject(SessionStore).clear());

  const permissionCases = kindsShowing('permission').flatMap((kind) => TOAST_BY_ROLE.map((r) => ({ kind, ...r })));
  const refused = (kind: RefusalKind, method: string) =>
    throwError(() => refusalError(kind, { method, url: `${HOSTEL_API}/utility_bills` }));

  it.each(permissionCases)(
    'says $role-worded text inline, with no toast, when creating is refused as $kind',
    ({ kind, role, key }) => {
      const { form, creates, notifications } = open({ billId: null, role, create: () => refused(kind, 'POST') });

      saveNew(form);

      expect(creates).toHaveLength(1);
      expect(form.submitError()).toBe(key);
      expect(notifications.raised).toEqual([]);
      expect(notifications.apiErrors).toEqual([]);
    },
  );

  it.each<Role>(['host', 'manager'])('says the plan has no CRM inline, with no toast, when creating is refused for a %s account', (role) => {
    const { form, notifications } = open({ billId: null, role, create: () => refused('crmRequired', 'POST') });

    saveNew(form);

    expect(form.submitError()).toBe('hostBookings.planHasNoCrm');
    expect(notifications.raised).toEqual([]);
    expect(notifications.apiErrors).toEqual([]);
  });

  it('says the plan has no CRM inline, with no toast, when updating is refused', () => {
    const { form, notifications } = open({ role: 'host', update: () => refused('crmMessageOnly', 'PATCH') });

    form.addToBatch();

    expect(form.submitError()).toBe('hostBookings.planHasNoCrm');
    expect(notifications.raised).toEqual([]);
    expect(notifications.apiErrors).toEqual([]);
  });

  it.each(['create', 'update'] as const)('shows the generic line and hands a 422 to the app-wide notifier once when %s fails', (action) => {
    const failing = refused('unprocessable', action === 'create' ? 'POST' : 'PATCH');
    const { form, notifications } =
      action === 'create'
        ? open({ billId: null, role: 'host', create: () => failing })
        : open({ role: 'host', update: () => failing });

    if (action === 'create') saveNew(form);
    else form.addToBatch();

    expect(form.submitError()).toBe('hostUtilities.failedToSaveTheBill');
    expect(notifications.apiErrors).toHaveLength(1);
    expect(notifications.apiErrors[0].status).toBe(422);
    expect(notifications.raised).toEqual([]);
  });

  it('clears the line and leaves the page once a retried save succeeds', () => {
    const { form, creates } = open({ billId: null, role: 'host' });
    form.submitError.set('hostUtilities.failedToSaveTheBill');

    saveNew(form);

    expect(creates).toHaveLength(1);
    expect(form.submitError()).toBeNull();
  });

  it('sends the create and the update without the global toast', () => {
    const created = open({ billId: null, role: 'host' });
    saveNew(created.form);
    expect(created.options.create).toEqual([QUIET]);

    const updated = open({ role: 'host' });
    updated.form.addToBatch();
    expect(updated.options.update).toEqual([QUIET]);
  });
});
