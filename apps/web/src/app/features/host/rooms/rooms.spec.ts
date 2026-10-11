import { of } from 'rxjs';
import { TRANSLOCO_LOADER } from '@jsverse/transloco';
import { HOSTEL_ID, room, roomsReply } from '@app/testing/host-builders';
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
