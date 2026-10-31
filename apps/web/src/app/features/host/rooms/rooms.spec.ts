import { Provider, WritableSignal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { TRANSLOCO_LOADER } from '@jsverse/transloco';
import { RefusalKind, refusalError } from '@app/testing/backend-refusals';
import { HOSTEL_ID, apiError, room, roomRenter, roomsReply, sessionUser } from '@app/testing/host-builders';
import { HostPage, hostPageDeps, openHostPage } from '@app/testing/host-page';
import { LIST_LOAD_REFUSALS, PLAN_REFUSALS, kindsShowing, loadSurface } from '@app/testing/load-refusal-surface';
import { SessionStore, SessionUser } from '@core/auth/session-store';
import { HostPropertyStore } from '@services/host-property-store';
import { Rooms } from './rooms';

/** Real copy for the two strings the occupancy line is made of, so the count is observable. */
const COPY = {
  hostRooms: { nFree: '{{count}} beds free', full: 'Fully booked' },
};

const LOADER = { provide: TRANSLOCO_LOADER, useValue: { getTranslation: () => of(COPY) } };

async function openRooms(rooms: ReturnType<typeof room>[]): Promise<HostPage<Rooms>> {
  const deps = hostPageDeps();
  deps.ops.rooms.mockReturnValue(of(roomsReply(rooms)));
  const page = await openHostPage(`/host/${HOSTEL_ID}/rooms`, Rooms, { rooms: Rooms }, {
    deps,
    providers: [LOADER],
  });
  await page.settle();
  return page;
}

/** The grid card whose title reads `code` (floor and number), or null. */
function cardFor(el: HTMLElement, code: string): HTMLElement | null {
  const cards = Array.from(el.querySelectorAll<HTMLElement>('[role="button"]'));
  return cards.find((c) => c.textContent?.includes(code)) ?? null;
}

describe('Rooms occupancy grid', () => {
  it('shows how many beds are free on a partly occupied room', async () => {
    const page = await openRooms([room({ id: 'r-1', number: '101', capacity: 4, occupied: 1 })]);

    const card = cardFor(page.el, 'Ground - 101');
    expect(card).not.toBeNull();
    expect(card!.textContent).toContain('3 beds free');
    expect(card!.textContent).not.toContain('Fully booked');
  });

  it('says full instead of a count when every bed is taken', async () => {
    const page = await openRooms([room({ id: 'r-1', number: '102', capacity: 4, occupied: 4 })]);

    const card = cardFor(page.el, 'Ground - 102');
    expect(card).not.toBeNull();
    expect(card!.textContent).toContain('Fully booked');
    expect(card!.textContent).not.toContain('beds free');
  });

  it('says full, never a negative count, when more people than beds are reported', async () => {
    const page = await openRooms([room({ id: 'r-1', number: '103', capacity: 4, occupied: 6 })]);

    const card = cardFor(page.el, 'Ground - 103');
    expect(card).not.toBeNull();
    expect(card!.textContent).toContain('Fully booked');
    expect(card!.textContent).not.toContain('beds free');
    expect(card!.textContent).not.toMatch(/-\d/);
  });

  it('shows the full bed count on an empty room', async () => {
    const page = await openRooms([room({ id: 'r-1', number: '104', capacity: 3, occupied: 0 })]);

    expect(cardFor(page.el, 'Ground - 104')!.textContent).toContain('3 beds free');
  });
});

/** The component's members are `protected`; the spec drives the saves through this shape. */
interface RoomsInternals {
  form: WritableSignal<{ id: string | null; number: string; floor: string; type: string; capacity: string } | null>;
  bulkForm: WritableSignal<{
    mode: 'range' | 'custom' | 'manual';
    prefix: string;
    start: string;
    count: string;
    custom: string;
    rows: { number: string; type: string; capacity: string }[];
    roomType: string;
    capacity: string;
  } | null>;
  saveError(): string | null;
  bulkError(): string | null;
  save(): void;
  bulkCreate(): void;
}

/**
 * A failed room save is shown in its dialog, translated, and only there: the call opts out of
 * the global toast, which would otherwise repeat it.
 */
describe('Rooms save failures', () => {
  const QUIET = { suppressErrorToast: true };
  const refused = () => throwError(() => apiError(422, ['Room number has already been taken']));

  async function failingPage(): Promise<{ page: HostPage<Rooms>; rooms: RoomsInternals }> {
    const page = await openRooms([room({ id: 'r-1', number: '101', capacity: 2, occupied: 0 })]);
    page.deps.ops.createRoom.mockReturnValue(refused());
    page.deps.ops.updateRoom.mockReturnValue(refused());
    page.deps.ops.bulkCreateRooms.mockReturnValue(refused());
    return { page, rooms: page.component as unknown as RoomsInternals };
  }

  it('updates a room quietly and shows the translated failure inline', async () => {
    const { page, rooms } = await failingPage();

    rooms.form.set({ id: 'r-1', number: '101', floor: 'Ground', type: '', capacity: '3' });
    rooms.save();
    await page.settle();

    expect(page.deps.ops.updateRoom).toHaveBeenCalledWith(HOSTEL_ID, 'r-1', expect.anything(), QUIET);
    expect(rooms.saveError()).toBe('hostRooms.couldNotUpdateRoom');
    expect(page.el.textContent).not.toContain('Room number has already been taken');
  });

  it('creates a room quietly and shows the translated failure inline', async () => {
    const { page, rooms } = await failingPage();

    rooms.form.set({ id: null, number: '102', floor: 'Ground', type: '', capacity: '2' });
    rooms.save();
    await page.settle();

    expect(page.deps.ops.createRoom).toHaveBeenCalledWith(HOSTEL_ID, expect.anything(), QUIET);
    expect(rooms.saveError()).toBe('hostRooms.couldNotCreateRoom');
  });

  it('bulk-creates rooms quietly and shows the translated failure inline', async () => {
    const { page, rooms } = await failingPage();

    rooms.bulkForm.set({
      mode: 'manual',
      prefix: '',
      start: '',
      count: '',
      custom: '',
      rows: [{ number: '201', type: '', capacity: '2' }],
      roomType: '',
      capacity: '2',
    });
    rooms.bulkCreate();
    await page.settle();

    expect(page.deps.ops.bulkCreateRooms).toHaveBeenCalledWith(HOSTEL_ID, expect.anything(), QUIET);
    expect(rooms.bulkError()).toBe('hostRooms.couldNotCreateRooms');
  });
});

/** The members the refusal specs drive beyond {@link RoomsInternals}; all `protected` or `private`. */
interface RoomsActions {
  promptDeleteRoom(r: ReturnType<typeof room>): void;
  confirmDeleteRoom(): void;
  deleteRenterPrompt(r: ReturnType<typeof roomRenter>): void;
  confirmRenterDelete(): void;
  deletedRenterIds(): Set<string>;
}

const QUIET_OPTS = { suppressErrorToast: true };

const TOAST_BY_ROLE = {
  host: 'hostBookings.notAllowedOwner',
  manager: 'hostBookings.notAllowed',
} as const;

const PERMISSION_KINDS = ['permissionCanCan', 'permissionRender403'] as const;
const CRM_KINDS = ['crmRequired', 'crmMessageOnly'] as const;

/** A rooms page with one room, signed in as `role`, whose writes all fail with `kind`. */
async function openWithFailingWrites(kind: RefusalKind, role: PageRole): Promise<HostPage<Rooms>> {
  const deps = hostPageDeps();
  deps.ops.rooms.mockReturnValue(of(roomsReply([room({ id: 'r-1', number: '101', capacity: 2, occupied: 0 })])));
  const fail = () => throwError(() => refusalError(kind, { method: 'POST' }));
  deps.ops.createRoom.mockReturnValue(fail());
  deps.ops.updateRoom.mockReturnValue(fail());
  deps.ops.bulkCreateRooms.mockReturnValue(fail());
  deps.ops.deleteRoom.mockReturnValue(fail());
  deps.ops.deleteRenter.mockReturnValue(fail());
  const page = await openHostPage(`/host/${HOSTEL_ID}/rooms`, Rooms, { rooms: Rooms }, {
    deps,
    providers: [signedIn(role)],
  });
  await page.settle();
  return page;
}

const EDIT_FORM = { id: 'r-1', number: '101', floor: 'Ground', type: '', capacity: '3' };
const CREATE_FORM = { id: null, number: '102', floor: 'Ground', type: '', capacity: '2' };
const BULK_FORM = {
  mode: 'manual' as const,
  prefix: '',
  start: '',
  count: '',
  custom: '',
  rows: [{ number: '201', type: '', capacity: '2' }],
  roomType: '',
  capacity: '2',
};

/** Who is told what: a refusal is worded for the owner or for staff, never in the server's English. */
describe('Rooms writes refused for permission or plan', () => {
  afterEach(() => {
    TestBed.inject(HostPropertyStore).clear();
    TestBed.inject(SessionStore).clear();
  });

  describe.each(ROLES)('for the %s', (role) => {
    it.each(PERMISSION_KINDS)('shows the translated refusal inline for a %s update, create and bulk create', async (kind) => {
      const page = await openWithFailingWrites(kind, role);
      const rooms = page.component as unknown as RoomsInternals;

      rooms.form.set(EDIT_FORM);
      rooms.save();
      await page.settle();
      expect(rooms.saveError()).toBe(TOAST_BY_ROLE[role]);

      rooms.form.set(CREATE_FORM);
      rooms.save();
      await page.settle();
      expect(rooms.saveError()).toBe(TOAST_BY_ROLE[role]);

      rooms.bulkForm.set(BULK_FORM);
      rooms.bulkCreate();
      await page.settle();
      expect(rooms.bulkError()).toBe(TOAST_BY_ROLE[role]);
      expect(page.el.textContent).not.toContain('not authorized');
    });

    it.each(PERMISSION_KINDS)('raises one pinned translated toast, quietly, for a %s room delete', async (kind) => {
      const page = await openWithFailingWrites(kind, role);
      const rooms = page.component as unknown as RoomsActions;

      rooms.promptDeleteRoom(room({ id: 'r-1', number: '101' }));
      rooms.confirmDeleteRoom();
      await page.settle();

      expect(page.deps.ops.deleteRoom).toHaveBeenCalledWith(HOSTEL_ID, 'r-1', QUIET_OPTS);
      expect(page.deps.notifications.raised).toEqual([{ kind: 'error', title: TOAST_BY_ROLE[role], ttlMs: 0 }]);
      expect(page.deps.notifications.apiErrors).toEqual([]);
    });

    it.each(PERMISSION_KINDS)('restores the renter and raises one toast for a %s renter delete', async (kind) => {
      const page = await openWithFailingWrites(kind, role);
      const rooms = page.component as unknown as RoomsActions;

      rooms.deleteRenterPrompt(roomRenter({ id: 'rn-1' }));
      rooms.confirmRenterDelete();
      await page.settle();

      expect(page.deps.ops.deleteRenter).toHaveBeenCalledWith(HOSTEL_ID, 'rn-1', QUIET_OPTS);
      expect(rooms.deletedRenterIds().has('rn-1')).toBe(false);
      expect(page.deps.notifications.raised).toEqual([{ kind: 'error', title: TOAST_BY_ROLE[role], ttlMs: 0 }]);
      expect(page.deps.notifications.apiErrors).toEqual([]);
    });
  });

  it.each(CRM_KINDS)('says the plan has no CRM inline for a %s update, create and bulk create', async (kind) => {
    const page = await openWithFailingWrites(kind, 'manager');
    const rooms = page.component as unknown as RoomsInternals;

    rooms.form.set(EDIT_FORM);
    rooms.save();
    await page.settle();
    expect(rooms.saveError()).toBe('hostBookings.planHasNoCrm');

    rooms.form.set(CREATE_FORM);
    rooms.save();
    await page.settle();
    expect(rooms.saveError()).toBe('hostBookings.planHasNoCrm');

    rooms.bulkForm.set(BULK_FORM);
    rooms.bulkCreate();
    await page.settle();
    expect(rooms.bulkError()).toBe('hostBookings.planHasNoCrm');
  });

  it('hands a 404 on a renter delete to the app notifier once, with no toast of its own', async () => {
    const page = await openWithFailingWrites('notFound', 'manager');
    const rooms = page.component as unknown as RoomsActions;

    rooms.deleteRenterPrompt(roomRenter({ id: 'rn-1' }));
    rooms.confirmRenterDelete();
    await page.settle();

    expect(page.deps.notifications.apiErrors).toHaveLength(1);
    expect(page.deps.notifications.apiErrors[0].status).toBe(404);
    expect(page.deps.notifications.raised).toEqual([]);
    expect(rooms.deletedRenterIds().has('rn-1')).toBe(false);
  });

  it('hands a failed room delete other than a refusal to the app notifier once', async () => {
    const page = await openWithFailingWrites('serverError', 'manager');
    const rooms = page.component as unknown as RoomsActions;

    rooms.promptDeleteRoom(room({ id: 'r-1', number: '101' }));
    rooms.confirmDeleteRoom();
    await page.settle();

    expect(page.deps.notifications.apiErrors).toHaveLength(1);
    expect(page.deps.notifications.raised).toEqual([]);
  });

  it('keeps a room save validation failure inline and its generic text', async () => {
    const page = await openWithFailingWrites('unprocessable', 'manager');
    const rooms = page.component as unknown as RoomsInternals;

    rooms.form.set(EDIT_FORM);
    rooms.save();
    await page.settle();

    expect(rooms.saveError()).toBe('hostRooms.couldNotUpdateRoom');
  });
});

/** The page draws its own error state for these two reads, so the global toast would repeat it. */
describe('Rooms reads', () => {
  it('load the list and the room types without the global error toast', async () => {
    const page = await openRooms([]);

    const listCall = page.deps.ops.rooms.mock.calls[0];
    expect(listCall[0]).toBe(HOSTEL_ID);
    expect(listCall.at(-1)).toEqual(QUIET_OPTS);
    expect(page.deps.ops.roomFormOptions).toHaveBeenCalledWith(HOSTEL_ID, QUIET_OPTS);
  });
});

/** The app has no plural rules, so a count of one asks for its own singular key. */
describe('Rooms bulk create button count', () => {
  it.each([
    [1, 'hostRooms.createNRoomsOne'],
    [2, 'hostRooms.createNRooms'],
  ])('labels %i new room(s) with %s', async (count, key) => {
    const page = await openRooms([]);
    const rooms = page.component as unknown as RoomsInternals;

    rooms.bulkForm.set({
      mode: 'range',
      prefix: '',
      start: '201',
      count: String(count),
      custom: '',
      rows: [],
      roomType: '',
      capacity: '2',
    });
    await page.settle();

    expect(page.el.textContent?.match(/hostRooms\.createNRooms(?:One)?/g)).toEqual([key]);
  });
});

const ROLE_BODY = {
  host: 'hostAccess.pageNotAllowedOwner',
  manager: 'hostAccess.pageNotAllowed',
} as const;

type PageRole = keyof typeof ROLE_BODY;

const ROLES = Object.keys(ROLE_BODY) as PageRole[];

/** Signed in before the page opens, because the host store keeps its hostel list per user. */
function signedIn(role: PageRole, over: Partial<SessionUser> = {}): Provider {
  return {
    provide: SessionStore,
    useFactory: () => {
      const session = new SessionStore();
      session.setSession(sessionUser(role, over), 'tok');
      return session;
    },
  };
}

/** The rooms page after its list read was answered with `kind`, as the real interceptor shapes it. */
async function openRefused(
  kind: RefusalKind,
  role: PageRole = 'host',
  session: Partial<SessionUser> = {},
): Promise<HostPage<Rooms>> {
  const deps = hostPageDeps();
  deps.ops.rooms.mockReturnValue(throwError(() => refusalError(kind)));
  const page = await openHostPage(`/host/${HOSTEL_ID}/rooms`, Rooms, { rooms: Rooms }, {
    deps,
    providers: [signedIn(role, session)],
  });
  await page.settle();
  return page;
}

describe('Rooms when the list load is refused', () => {
  afterEach(() => {
    TestBed.inject(HostPropertyStore).clear();
    TestBed.inject(SessionStore).clear();
  });

  describe('for a missing permission', () => {
    const cases = kindsShowing('permission').flatMap((kind) => ROLES.map((role) => [kind, role] as const));

    it.each(cases)('a %s refusal for the %s shows the permission panel and nothing else', async (kind, role) => {
      const page = await openRefused(kind, role);

      const reading = loadSurface(page.el);
      expect(reading.surfaces).toEqual([LIST_LOAD_REFUSALS[kind]]);
      expect(reading.heading).toBe('coreForbidden.accessBlocked');
      expect(reading.body).toBe(ROLE_BODY[role]);
      expect(reading.retry).toBe(false);
      expect(page.el.querySelector('[role="button"]')).toBeNull();
      expect(reading.text).not.toMatch(/not authorized|subscribe/i);
    });

    it('stays on the page, still reading as failed rather than loaded', async () => {
      const page = await openRefused('permissionCanCan', 'manager');

      expect(page.url()).toBe(`/host/${HOSTEL_ID}/rooms`);
      expect((page.component as unknown as { state(): { error: boolean } }).state().error).toBe(true);
    });
  });

  describe('for a plan refusal, which the console lock owns', () => {
    it.each(PLAN_REFUSALS)(
      'a %s refusal shows the generic error with Retry, not the panel',
      async (kind) => {
        const page = await openRefused(kind);

        const reading = loadSurface(page.el);
        expect(reading.surfaces).toEqual([LIST_LOAD_REFUSALS[kind]]);
        expect(reading.heading).toBe('states.somethingWentWrong');
        expect(reading.retry).toBe(true);
      },
    );
  });

  describe('for any other reason the server answered', () => {
    const kinds = kindsShowing('error').filter((kind) => !PLAN_REFUSALS.includes(kind));

    it.each(kinds)('a %s refusal shows the generic error with Retry', async (kind) => {
      const page = await openRefused(kind);

      const reading = loadSurface(page.el);
      expect(reading.surfaces).toEqual([LIST_LOAD_REFUSALS[kind]]);
      expect(reading.heading).toBe('states.somethingWentWrong');
      expect(reading.retry).toBe(true);
    });
  });

  describe('when the server cannot be reached', () => {
    it.each(kindsShowing('network'))('a %s failure shows the connection error with Retry', async (kind) => {
      const page = await openRefused(kind);

      const reading = loadSurface(page.el);
      expect(reading.surfaces).toEqual([LIST_LOAD_REFUSALS[kind]]);
      expect(reading.heading).toBe('states.cantConnect');
      expect(reading.retry).toBe(true);
    });
  });

  describe('header actions', () => {
    const actions = (el: HTMLElement) => ({
      add: el.querySelector<HTMLButtonElement>('button[aria-label="a11y.addRoom"]'),
      bulk: el.querySelector<HTMLButtonElement>('button[aria-label="a11y.bulkAddRooms"]'),
    });

    /** A manager's flags go stale, and a session with none is not gated: either way the buttons show. */
    it.each([
      ['no permission flags', []],
      ['a flag for creating rooms', ['host:Room:create']],
    ])('stay enabled for a manager holding %s when the list is refused for permission', async (_name, permissions) => {
      const page = await openRefused('permissionCanCan', 'manager', { permissions });

      const { add, bulk } = actions(page.el);
      expect(loadSurface(page.el).surfaces).toEqual(['permission']);
      expect(add).not.toBeNull();
      expect(bulk).not.toBeNull();
      expect(add?.disabled).toBe(false);
      expect(bulk?.disabled).toBe(false);
    });

    it('stay enabled after a no-live-plan refusal, which the console lock answers, not the page', async () => {
      const page = await openRefused('inactive', 'manager');

      const { add, bulk } = actions(page.el);
      expect(add).not.toBeNull();
      expect(bulk).not.toBeNull();
      expect(add?.disabled).toBe(false);
      expect(bulk?.disabled).toBe(false);
    });
  });
});
