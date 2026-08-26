import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Observable, of } from 'rxjs';
import { HostOpsApi } from '@services';
import { HostRoom } from '@util/models/host-ops';
import { AssignRoomsPanel, AssignSelection } from './assign-rooms-panel';
import { HostBooking } from './host-bookings-api';

function room(over: Partial<HostRoom> = {}): HostRoom {
  return {
    id: 'r1',
    number: 'Harbour 6',
    floor: '1',
    type: 'Mixed Dorm',
    capacity: 6,
    occupied: 4,
    rentPerBed: 2000,
    attachedBath: false,
    createdAt: '2026-01-01',
    ...over,
  };
}

function booking(over: Partial<HostBooking> = {}): HostBooking {
  return {
    id: 'b1',
    ref: 'HH-1',
    guest: { name: 'Ayesha Khan', phone: '', email: '' },
    checkIn: '2026-08-24',
    checkOut: '2026-08-30',
    nights: 6,
    guests: 3,
    roomType: { name: 'Mixed Dorm', occupancyType: 'shared', capacity: 6 },
    total: 396,
    deposit: 0,
    paid: 0,
    balanceDue: 0,
    status: { name: 'Paid', slug: 'paid' },
    disposition: { name: 'Pending Allotment', slug: 'pending-allotment' },
    createdAt: '2026-08-01',
    ...over,
  };
}

class HostOpsStub {
  rooms$: HostRoom[] = [];
  rooms(): Observable<{ rooms: HostRoom[]; total: number; aggs: unknown; statuses: unknown[] }> {
    return of({ rooms: this.rooms$, total: this.rooms$.length, aggs: {}, statuses: [] });
  }
}

@Component({
  imports: [AssignRoomsPanel],
  template: `<hh-assign-rooms-panel
    hostelId="h1"
    [booking]="booking()"
    (assign)="last = $event"
  />`,
})
class Host {
  readonly booking = signal<HostBooking | null>(booking());
  last: AssignSelection | null = null;
}

/**
 * Assignment is filling a shopping list, not searching a building.
 *
 * The numbers here are the whole feature: how many units the booking still owes, what each
 * room can actually take, and whether the primary action may fire. Every one of them fails
 * silently — an over-allocated booking still looks fine on screen, and a host only finds out
 * when two guests are sent to the same bed.
 */
describe('AssignRoomsPanel allocation', () => {
  let fixture: ComponentFixture<Host>;
  let panel: AssignRoomsPanel;
  let api: HostOpsStub;

  async function render(rooms: HostRoom[], b: HostBooking = booking()): Promise<void> {
    api = new HostOpsStub();
    api.rooms$ = rooms;
    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [Host],
      providers: [{ provide: HostOpsApi, useValue: api }],
    }).compileComponents();
    fixture = TestBed.createComponent(Host);
    fixture.componentInstance.booking.set(b);
    fixture.detectChanges();
    panel = fixture.debugElement.children[0].componentInstance as AssignRoomsPanel;
    fixture.detectChanges();
  }

  /** The component's members are `protected`; the template reads them, so the tests may too. */
  function p(): Record<string, (...a: unknown[]) => unknown> {
    return panel as unknown as Record<string, (...a: unknown[]) => unknown>;
  }

  afterEach(() => fixture?.destroy());

  it('lists only rooms of the booked type', async () => {
    await render([
      room({ id: 'a', number: 'Harbour 6' }),
      room({ id: 'b', number: 'Loft 4', type: 'Female Dorm' }),
    ]);

    const rows = p()['rows']() as { room: HostRoom }[];
    expect(rows.map((r) => r.room.number)).toEqual(['Harbour 6']);
  });

  it('counts free beds as capacity less what is taken', async () => {
    await render([room({ capacity: 6, occupied: 4 })]);

    expect((p()['rows']() as { free: number }[])[0].free).toBe(2);
  });

  // A dorm booking owes one bed per guest — that is the only reading of the record.
  it('needs one bed per guest on a shared booking', async () => {
    await render([room()], booking({ guests: 3 }));

    expect(p()['needed']()).toBe(3);
    expect(p()['isShared']()).toBe(true);
  });

  /**
   * Private rooms carry no quantity on the record, so the count is derived: the fewest rooms
   * of this type that seat everybody. Six guests in a two-bed suite is three rooms.
   */
  it('derives the room count on a private booking', async () => {
    await render(
      [room({ type: 'King Suite', capacity: 2, occupied: 0 })],
      booking({
        guests: 6,
        roomType: { name: 'King Suite', occupancyType: 'private', capacity: 2 },
      }),
    );

    expect(p()['needed']()).toBe(3);
    expect(p()['isShared']()).toBe(false);
  });

  it('never needs fewer than one', async () => {
    await render([room()], booking({ guests: 0 }));
    expect(p()['needed']()).toBe(1);
  });

  it('steps beds up and down within a room', async () => {
    await render([room({ capacity: 6, occupied: 4 })]);
    const rows = () => p()['rows']() as { picked: number }[];

    p()['stepBeds'](rows()[0], 1);
    fixture.detectChanges();
    expect(rows()[0].picked).toBe(1);

    p()['stepBeds'](rows()[0], -1);
    fixture.detectChanges();
    expect(rows()[0].picked).toBe(0);
  });

  // Two guests sent to a bed that does not exist is the failure this bound prevents.
  it('will not allocate more beds than the room has free', async () => {
    await render([room({ capacity: 6, occupied: 4 })], booking({ guests: 5 }));
    const rows = () => p()['rows']() as { picked: number }[];

    for (let i = 0; i < 5; i++) p()['stepBeds'](rows()[0], 1);
    fixture.detectChanges();

    expect(rows()[0].picked).toBe(2);
  });

  it('will not allocate more beds than the booking asked for', async () => {
    await render([room({ id: 'a', capacity: 10, occupied: 0 })], booking({ guests: 3 }));
    const rows = () => p()['rows']() as { picked: number }[];

    for (let i = 0; i < 6; i++) p()['stepBeds'](rows()[0], 1);
    fixture.detectChanges();

    expect(rows()[0].picked).toBe(3);
    expect(p()['allocated']()).toBe(3);
  });

  it('spreads an allocation across rooms and totals it', async () => {
    await render(
      [
        room({ id: 'a', number: 'Harbour 6', capacity: 6, occupied: 4 }),
        room({ id: 'b', number: 'Garden 10', capacity: 10, occupied: 7 }),
      ],
      booking({ guests: 3 }),
    );
    const rows = () => p()['rows']() as { room: HostRoom; picked: number }[];

    const harbour = rows().find((r) => r.room.id === 'a')!;
    p()['stepBeds'](harbour, 1);
    p()['stepBeds'](harbour, 1);
    fixture.detectChanges();
    p()['stepBeds'](rows().find((r) => r.room.id === 'b')!, 1);
    fixture.detectChanges();

    expect(p()['allocated']()).toBe(3);
    expect(p()['remaining']()).toBe(0);
    expect(p()['complete']()).toBe(true);
  });

  it('keeps the action blocked until every bed is placed', async () => {
    await render([room({ capacity: 6, occupied: 0 })], booking({ guests: 3 }));
    const rows = () => p()['rows']() as { picked: number }[];

    expect(p()['complete']()).toBe(false);
    p()['submit']();
    expect(fixture.componentInstance.last).toBeNull();

    for (let i = 0; i < 3; i++) p()['stepBeds'](rows()[0], 1);
    fixture.detectChanges();
    p()['submit']();

    expect(fixture.componentInstance.last).toEqual({
      bookingId: 'b1',
      rooms: [{ roomId: 'r1', roomNumber: 'Harbour 6', beds: 3 }],
    });
  });

  it('leaves a full room unpickable rather than hiding it', async () => {
    await render([room({ capacity: 4, occupied: 4 })]);
    const rows = () => p()['rows']() as { free: number; picked: number }[];

    expect(rows().length).toBe(1);
    expect(rows()[0].free).toBe(0);

    p()['stepBeds'](rows()[0], 1);
    fixture.detectChanges();
    expect(rows()[0].picked).toBe(0);
  });

  describe('private rooms', () => {
    const priv = (over: Partial<HostBooking> = {}) =>
      booking({
        guests: 2,
        roomType: { name: 'King Suite', occupancyType: 'private', capacity: 2 },
        ...over,
      });

    it('takes a whole room per tick', async () => {
      await render([room({ id: 'a', number: 'King 201', type: 'King Suite', capacity: 2, occupied: 0 })], priv());
      const rows = () => p()['rows']() as { picked: number }[];

      p()['toggleRoom'](rows()[0]);
      fixture.detectChanges();
      expect(rows()[0].picked).toBe(1);
      expect(p()['complete']()).toBe(true);
    });

    it('unticks on a second click', async () => {
      await render([room({ id: 'a', type: 'King Suite', capacity: 2, occupied: 0 })], priv());
      const rows = () => p()['rows']() as { picked: number }[];

      p()['toggleRoom'](rows()[0]);
      fixture.detectChanges();
      p()['toggleRoom'](rows()[0]);
      fixture.detectChanges();

      expect(rows()[0].picked).toBe(0);
    });

    // Otherwise the counter reads "3 of 2" and the host has to work out which to undo.
    it('refuses a tick beyond what the booking needs', async () => {
      await render(
        [
          room({ id: 'a', number: 'King 201', type: 'King Suite', capacity: 2, occupied: 0 }),
          room({ id: 'b', number: 'King 204', type: 'King Suite', capacity: 2, occupied: 0 }),
        ],
        priv({ guests: 2 }),
      );
      const rows = () => p()['rows']() as { picked: number }[];

      p()['toggleRoom'](rows()[0]);
      fixture.detectChanges();
      p()['toggleRoom'](rows()[1]);
      fixture.detectChanges();

      expect(p()['allocated']()).toBe(1);
    });

    it('will not tick an occupied room', async () => {
      await render([room({ id: 'a', type: 'King Suite', capacity: 2, occupied: 2 })], priv());
      const rows = () => p()['rows']() as { picked: number }[];

      p()['toggleRoom'](rows()[0]);
      fixture.detectChanges();
      expect(rows()[0].picked).toBe(0);
    });
  });
});
