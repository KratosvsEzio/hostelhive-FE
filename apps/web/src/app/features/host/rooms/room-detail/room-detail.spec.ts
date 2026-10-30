import { WritableSignal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { Subject, of, throwError } from 'rxjs';
import { TRANSLOCO_LOADER } from '@jsverse/transloco';
import {
  BillingMode,
  HOSTEL_ID,
  apiError,
  bookingPage,
  hostBooking,
  occupancy,
  room,
  roomRenter,
  roomShow,
} from '@app/testing/host-builders';
import { HostPage, HostPageDeps, hostPageDeps, openHostPage } from '@app/testing/host-page';
import { HostBooking, HostBookingPage } from '@features/host/bookings/host-bookings-api';
import { HostPropertyStore, RoomRenter } from '@services';
import { RoomCalendar } from '../room-calendar/room-calendar';
import { RoomDetail } from './room-detail';

const ROOM_ID = 'r-101';

/** Real copy for the strings whose parameters the assertions read; every other key echoes itself. */
const COPY = {
  hostRooms: {
    bedsOccupiedOf: '{{filled}} of {{total}} beds occupied',
    guestCount: '{{count}} guests',
    untilDate: 'Until {{date}}',
  },
};

const LOADER = { provide: TRANSLOCO_LOADER, useValue: { getTranslation: () => of(COPY) } };

interface OpenOptions {
  capacity?: number;
  /** `occupied` as the server's room payload reports it (active renters only). */
  serverOccupied?: number;
  renters?: RoomRenter[];
  bookings?: HostBooking[];
  billing?: BillingMode;
  deps?: HostPageDeps;
}

/** A checked-in booking holding `guests` beds in `roomId`. */
function checkedIn(id: string, over: Partial<HostBooking> = {}, roomId = ROOM_ID, guests = 2): HostBooking {
  return hostBooking('checked-in', {
    id,
    ref: `BK-${id}`,
    guest: { name: `Guest ${id}`, phone: '', email: '' },
    occupancies: [occupancy({ id: `oc-${id}`, roomId, guests })],
    ...over,
  });
}

async function openDetail(opts: OpenOptions = {}): Promise<HostPage<RoomDetail>> {
  const deps = opts.deps ?? hostPageDeps();
  deps.ops.roomShow.mockReturnValue(
    of(
      roomShow({
        room: room({ id: ROOM_ID, capacity: opts.capacity ?? 4, occupied: opts.serverOccupied ?? 0 }),
        renters: opts.renters ?? [],
      }),
    ),
  );
  if (opts.bookings) deps.bookings.list.mockReturnValue(of(bookingPage(opts.bookings)));
  const page = await openHostPage(
    `/host/${HOSTEL_ID}/rooms/${ROOM_ID}`,
    RoomDetail,
    { roomDetail: RoomDetail },
    { deps, billing: opts.billing ?? 'night', providers: [LOADER] },
  );
  await showDetails(page);
  return page;
}

/** Moves off the calendar tab to the details half, where the tenants and guests cards live. */
async function showDetails(page: HostPage<RoomDetail>): Promise<void> {
  await page.settle();
  const tab = Array.from(page.el.querySelectorAll<HTMLElement>('button, [role="tab"]')).find((b) =>
    b.textContent?.includes('hostRooms.detailsTab'),
  );
  if (tab) tab.click();
  else (page.component as unknown as { view: WritableSignal<string> }).view.set('details');
  await page.settle();
  await page.settle();
}

function cardTitled(el: HTMLElement, titleKey: string): HTMLElement | null {
  const title = Array.from(el.querySelectorAll('p')).find((p) => p.textContent?.trim() === titleKey);
  return (title?.closest('div.rounded-2xl') as HTMLElement | null) ?? null;
}

const guestsCard = (el: HTMLElement) => cardTitled(el, 'hostRooms.guestsOnBookings');
const guestRows = (el: HTMLElement) => Array.from(guestsCard(el)?.querySelectorAll('li') ?? []);
const text = (n: Element | null | undefined) => (n?.textContent ?? '').replace(/\s+/g, ' ').trim();

describe('RoomDetail guests on bookings', () => {
  it('lists only active occupancies in this room, summing guests per booking', async () => {
    const multi = hostBooking('checked-in', {
      id: 'multi',
      ref: 'BK-multi',
      guest: { name: 'Multi Stay', phone: '', email: '' },
      occupancies: [
        occupancy({ id: 'a', roomId: ROOM_ID, guests: 2 }),
        occupancy({ id: 'b', roomId: ROOM_ID, guests: 1 }),
        occupancy({ id: 'c', roomId: 'r-202', guests: 5 }),
      ],
    });
    const released = checkedIn('released', {
      occupancies: [occupancy({ id: 'x', roomId: ROOM_ID, guests: 2, active: false })],
    });
    const elsewhere = checkedIn('elsewhere', {}, 'r-202', 2);

    const page = await openDetail({ capacity: 8, bookings: [multi, released, elsewhere] });

    const rows = guestRows(page.el);
    expect(rows).toHaveLength(1);
    expect(text(rows[0])).toContain('Multi Stay');
    expect(text(rows[0])).toContain('3 guests');
    expect(text(guestsCard(page.el))).not.toContain('Guest released');
    expect(text(guestsCard(page.el))).not.toContain('Guest elsewhere');
  });

  it('links the booking reference to the booking and shows the date the stay runs until', async () => {
    const page = await openDetail({ bookings: [checkedIn('bk-9', { checkOut: '2026-10-13' })] });

    const link = guestRows(page.el)[0].querySelector('a');
    expect(text(link)).toBe('BK-bk-9');
    expect(link?.getAttribute('href')).toContain(`/host/${HOSTEL_ID}/bookings/bk-9`);
    expect(text(guestRows(page.el)[0])).toContain('Until Oct 13, 2026');
  });

  it('asks the bookings index for this room only, with the toast suppressed', async () => {
    const deps = hostPageDeps();
    await openDetail({ deps });

    expect(deps.bookings.list).toHaveBeenCalledWith(
      HOSTEL_ID,
      1,
      100,
      { 'f[occupied_room_ids]': ROOM_ID },
      { suppressErrorToast: true },
    );
  });
});

describe('RoomDetail occupancy figures', () => {
  it('counts active tenants plus booking guests in the header, the beds line and the pill', async () => {
    const page = await openDetail({
      capacity: 6,
      serverOccupied: 2,
      renters: [roomRenter({ id: 't-1' }), roomRenter({ id: 't-2', name: 'Bilal Khan', initials: 'BK' })],
      bookings: [checkedIn('g1', {}, ROOM_ID, 3)],
    });

    expect(text(page.el)).toContain('5 of 6 beds occupied');
    expect(text(page.el)).toContain('5 / 6');
    expect(text(page.el)).toContain('Partial');
  });

  it('reads full once tenants and guests fill every bed', async () => {
    const page = await openDetail({
      capacity: 4,
      serverOccupied: 1,
      renters: [roomRenter({ id: 't-1' })],
      bookings: [checkedIn('g1', {}, ROOM_ID, 3)],
    });

    expect(text(page.el)).toContain('4 of 4 beds occupied');
    expect(text(page.el)).toContain('4 / 4');
    expect(text(page.el)).toContain('Full');
  });

  it('does not call a room available when only booking guests are in it', async () => {
    const page = await openDetail({
      capacity: 4,
      serverOccupied: 0,
      renters: [],
      bookings: [checkedIn('g1', {}, ROOM_ID, 2)],
    });

    expect(text(page.el)).toContain('2 of 4 beds occupied');
    expect(text(page.el)).toContain('Partial');
    expect(text(page.el)).not.toContain('Available');
  });
});

describe('RoomDetail guests card states', () => {
  it('shows a skeleton while the bookings are loading', async () => {
    const deps = hostPageDeps();
    const pending = new Subject<HostBookingPage>();
    deps.bookings.list.mockReturnValue(pending);

    const page = await openDetail({ deps, renters: [roomRenter()] });

    expect(guestsCard(page.el)?.querySelector('hh-skeleton')).not.toBeNull();
    expect(guestRows(page.el)).toHaveLength(0);

    pending.next(bookingPage([checkedIn('late')]));
    await page.settle();
    expect(guestsCard(page.el)?.querySelector('hh-skeleton')).toBeNull();
    expect(guestRows(page.el)).toHaveLength(1);
  });

  it('keeps the tenants listed and says the guests failed to load when the bookings read fails', async () => {
    const deps = hostPageDeps();
    deps.bookings.list.mockReturnValue(throwError(() => apiError(500, [], 'GET')));

    const page = await openDetail({
      deps,
      renters: [roomRenter({ id: 't-1', name: 'Saad Ali' })],
    });

    expect(text(page.el)).toContain('Saad Ali');
    expect(text(guestsCard(page.el))).toContain('hostRooms.couldNotLoadBookingGuests');
    expect(text(guestsCard(page.el))).not.toContain('hostRooms.noBookingGuests');
    expect(deps.notifications.raised).toHaveLength(0);
  });

  it('shows an empty state when no booking has beds in the room', async () => {
    const page = await openDetail({ bookings: [] });

    expect(text(guestsCard(page.el))).toContain('hostRooms.noBookingGuests');
    expect(guestRows(page.el)).toHaveLength(0);
  });
});

const headerPill = (el: HTMLElement) => el.querySelector('div.rounded-2xl')?.querySelector('hh-status-pill') ?? null;

function occupiedFigure(el: HTMLElement): string {
  const label = Array.from(el.querySelectorAll('p')).find((p) => text(p) === 'common.occupied');
  return text(label?.nextElementSibling);
}

function tenantsSubtitle(el: HTMLElement): string {
  const title = Array.from(el.querySelectorAll('p')).find((p) => text(p) === 'hostRooms.currentTenants');
  return text(title?.nextElementSibling);
}

describe('RoomDetail while the guest count is unknown', () => {
  it('hides the status pill, the occupied figure and the beds line while the bookings load', async () => {
    const deps = hostPageDeps();
    deps.bookings.list.mockReturnValue(new Subject<HostBookingPage>());

    const page = await openDetail({ deps, capacity: 4, serverOccupied: 1, renters: [roomRenter()] });

    expect(headerPill(page.el)).toBeNull();
    expect(occupiedFigure(page.el)).toBe('—');
    expect(text(page.el)).not.toContain('beds occupied');
    expect(guestsCard(page.el)?.querySelector('hh-skeleton')).not.toBeNull();
  });

  it('hides them too when the bookings read fails, and the guests card says so', async () => {
    const deps = hostPageDeps();
    deps.bookings.list.mockReturnValue(throwError(() => apiError(500, [], 'GET')));

    const page = await openDetail({ deps, capacity: 4, serverOccupied: 1, renters: [roomRenter()] });

    expect(headerPill(page.el)).toBeNull();
    expect(occupiedFigure(page.el)).toBe('—');
    expect(text(page.el)).not.toContain('beds occupied');
    expect(text(guestsCard(page.el))).toContain('hostRooms.couldNotLoadBookingGuests');
  });

  it('shows the pill and figures once the guests load, and a guests-only room is never available', async () => {
    const deps = hostPageDeps();
    const pending = new Subject<HostBookingPage>();
    deps.bookings.list.mockReturnValue(pending);
    const page = await openDetail({ deps, capacity: 4, serverOccupied: 0 });
    expect(headerPill(page.el)).toBeNull();

    pending.next(bookingPage([checkedIn('g1', {}, ROOM_ID, 2)]));
    await page.settle();

    expect(text(headerPill(page.el))).toBe('Partial');
    expect(occupiedFigure(page.el)).toBe('2 / 4');
    expect(text(page.el)).toContain('2 of 4 beds occupied');
    expect(text(page.el)).not.toContain('Available');
  });

  it('reads full when loaded guests fill every bed', async () => {
    const page = await openDetail({ capacity: 2, bookings: [checkedIn('g1', {}, ROOM_ID, 2)] });

    expect(text(headerPill(page.el))).toBe('Full');
    expect(occupiedFigure(page.el)).toBe('2 / 2');
  });

  it('shows the pill and figures at once on a month-billed hostel, which never asks for guests', async () => {
    const deps = hostPageDeps();
    const page = await openDetail({
      deps,
      billing: 'month',
      capacity: 4,
      renters: [roomRenter({ id: 't-1', status: 'active' })],
    });

    expect(deps.bookings.list).not.toHaveBeenCalled();
    expect(text(headerPill(page.el))).toBe('Partial');
    expect(occupiedFigure(page.el)).toBe('1 / 4');
    expect(text(page.el)).toContain('1 of 4 beds occupied');
  });

  it('still reports past renters, without a leading separator', async () => {
    const deps = hostPageDeps();
    deps.bookings.list.mockReturnValue(new Subject<HostBookingPage>());

    const page = await openDetail({
      deps,
      renters: [roomRenter({ id: 't-old', status: 'inactive', name: 'Old Tenant', initials: 'OT' })],
    });

    const subtitle = tenantsSubtitle(page.el);
    expect(subtitle).toContain('hostRooms.nNoLongerActive');
    expect(subtitle).not.toContain('·');
    expect(subtitle).not.toContain('beds occupied');
  });
});

describe('RoomDetail on a month-billed hostel', () => {
  it('has no guests card, asks for no bookings, and counts only active tenants', async () => {
    const deps = hostPageDeps();
    const page = await openDetail({
      deps,
      billing: 'month',
      capacity: 4,
      renters: [
        roomRenter({ id: 't-1', status: 'active' }),
        roomRenter({ id: 't-2', status: 'active', name: 'Bilal Khan', initials: 'BK' }),
        roomRenter({ id: 't-3', status: 'inactive', name: 'Old Tenant', initials: 'OT' }),
      ],
    });

    expect(guestsCard(page.el)).toBeNull();
    expect(deps.bookings.list).not.toHaveBeenCalled();
    expect(text(page.el)).toContain('2 of 4 beds occupied');
    expect(text(page.el)).toContain('2 / 4');
    expect(text(page.el)).toContain('Old Tenant');
  });
});

describe('RoomDetail when the billing cycle is unknown', () => {
  it('still asks for the booking guests', async () => {
    const deps = hostPageDeps();
    await openDetail({ deps, billing: '' });

    expect(deps.bookings.list).toHaveBeenCalledTimes(1);
    expect(deps.bookings.list.mock.calls[0][3]).toEqual({ 'f[occupied_room_ids]': ROOM_ID });
  });
});

/** The page left on its calendar tab, which `openDetail` moves off. */
async function openCalendar(deps: HostPageDeps, billing: BillingMode = 'night'): Promise<HostPage<RoomDetail>> {
  deps.ops.roomShow.mockReturnValue(of(roomShow({ room: room({ id: ROOM_ID }) })));
  const page = await openHostPage(
    `/host/${HOSTEL_ID}/rooms/${ROOM_ID}`,
    RoomDetail,
    { roomDetail: RoomDetail },
    { deps, billing, providers: [LOADER] },
  );
  await page.settle();
  return page;
}

const calendarEl = (page: HostPage<RoomDetail>) => page.el.querySelector('hh-room-calendar');
const calendarSkeleton = (page: HostPage<RoomDetail>) => page.el.querySelector('hh-skeleton.h-64');

/** The zone the room calendar was handed, read off the mounted component. */
function calendarZone(page: HostPage<RoomDetail>): string | null | undefined {
  const node = page.harness.fixture.debugElement.query(By.directive(RoomCalendar));
  return (node?.componentInstance as RoomCalendar | undefined)?.timeZone();
}

describe('RoomDetail calendar zone', () => {
  it('shows a skeleton and no calendar while the hostel zone is still being read', async () => {
    const deps = hostPageDeps();
    const pending = new Subject<string | null>();
    deps.shell.hostelTimeZone.mockReturnValue(pending);

    const page = await openCalendar(deps);

    expect(calendarEl(page)).toBeNull();
    expect(calendarSkeleton(page)).not.toBeNull();

    pending.next('Asia/Karachi');
    await page.settle();
    expect(calendarSkeleton(page)).toBeNull();
    expect(calendarEl(page)).not.toBeNull();
    expect(calendarZone(page)).toBe('Asia/Karachi');
  });

  it.each<[string, string | null]>([
    ['the hostel zone', 'Asia/Karachi'],
    ['null when the hostel has none', null],
  ])('renders the calendar with %s', async (_label, zone) => {
    const deps = hostPageDeps();
    deps.shell.timeZone = zone;

    const page = await openCalendar(deps);

    expect(calendarSkeleton(page)).toBeNull();
    expect(calendarEl(page)).not.toBeNull();
    expect(calendarZone(page)).toBe(zone);
    expect(deps.shell.hostelTimeZone).toHaveBeenCalledWith(HOSTEL_ID);
  });

  it('does not ask for a zone on a month-billed hostel, which has no calendar', async () => {
    const deps = hostPageDeps();

    const page = await openDetail({ deps, billing: 'month' });

    expect(deps.shell.hostelTimeZone).not.toHaveBeenCalled();
    expect(calendarEl(page)).toBeNull();
  });

  it('reads the zone of the hostel the host switches to', async () => {
    const deps = hostPageDeps();
    const second = new Subject<string | null>();
    deps.shell.hostelTimeZone.mockImplementation((id) =>
      id === HOSTEL_ID ? of('Asia/Karachi') : second,
    );
    const page = await openCalendar(deps);
    expect(calendarZone(page)).toBe('Asia/Karachi');

    TestBed.inject(HostPropertyStore).selected.set('h2');
    await page.settle();

    expect(deps.shell.hostelTimeZone).toHaveBeenCalledWith('h2');
    expect(calendarEl(page)).toBeNull();
    expect(calendarSkeleton(page)).not.toBeNull();

    second.next('Pacific/Kiritimati');
    await page.settle();
    expect(calendarZone(page)).toBe('Pacific/Kiritimati');
  });
});

describe('RoomDetail guest with no name', () => {
  it('shows a dash for the name and a question mark for the initials', async () => {
    const page = await openDetail({
      bookings: [checkedIn('anon', { guest: { name: '   ', phone: '', email: '' } })],
    });

    const row = guestRows(page.el)[0];
    expect(text(row.querySelector('p.font-medium'))).toBe('—');
    expect(text(row.querySelector('hh-avatar'))).toBe('?');
  });
});

/** The app has no plural rules, so a count of one asks for its own singular key. */
describe('RoomDetail capacity count', () => {
  it.each([
    [1, 'common.nBedsOne'],
    [2, 'common.nBeds'],
  ])('shows a capacity of %i as %s', async (capacity, key) => {
    const page = await openDetail({ capacity });

    const label = Array.from(page.el.querySelectorAll('p')).find((p) => text(p) === 'common.capacity');
    expect(text(label?.nextElementSibling)).toBe(key);
  });
});

describe('RoomDetail when the room cannot be read', () => {
  async function openFailing(status: number): Promise<{ page: HostPage<RoomDetail>; deps: HostPageDeps }> {
    const deps = hostPageDeps();
    deps.ops.roomShow.mockReturnValue(throwError(() => apiError(status, [], 'GET')));
    const page = await openHostPage(
      `/host/${HOSTEL_ID}/rooms/25`,
      RoomDetail,
      { roomDetail: RoomDetail },
      { deps, billing: 'night', providers: [LOADER] },
    );
    await page.settle();
    return { page, deps };
  }

  // An old numeric link, or a room that was deleted: a retry can never succeed.
  it('says the room was not found, with no retry, on a 404', async () => {
    const { page } = await openFailing(404);

    const state = page.el.querySelector('[data-testid="room-not-found"]');
    expect(text(state)).toContain('hostRooms.notFoundTitle');
    expect(state?.querySelector('button')).toBeNull();
  });

  it('keeps the generic error for any other status', async () => {
    const { page } = await openFailing(500);

    expect(page.el.querySelector('[data-testid="room-not-found"]')).toBeNull();
    expect(page.el.querySelector('hh-error-state')).not.toBeNull();
  });

  it('reads the room with the global error toast suppressed', async () => {
    const { deps } = await openFailing(404);

    expect(deps.ops.roomShow).toHaveBeenCalledWith(HOSTEL_ID, '25', { suppressErrorToast: true });
  });
});
