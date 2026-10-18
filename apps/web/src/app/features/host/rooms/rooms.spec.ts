import { WritableSignal } from '@angular/core';
import { of, throwError } from 'rxjs';
import { TRANSLOCO_LOADER } from '@jsverse/transloco';
import { HOSTEL_ID, apiError, room, roomsReply } from '@app/testing/host-builders';
import { HostPage, hostPageDeps, openHostPage } from '@app/testing/host-page';
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
