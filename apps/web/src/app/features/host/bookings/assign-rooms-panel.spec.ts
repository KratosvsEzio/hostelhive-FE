import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Observable, of } from 'rxjs';
import { HostOpsApi } from '@services';
import { HostRoom } from '@util/models/host-ops';
import { AssignGroup, AssignRoomsPanel, AssignRow, AssignSelection } from './assign-rooms-panel';
import { HostBooking } from './host-bookings-api';

function room(over: Partial<HostRoom> = {}): HostRoom {
  return {
    id: 'r1',
    number: '101',
    floor: 'ground',
    type: 'Dormitory',
    capacity: 6,
    occupied: 4,
    rentPerBed: 2000,
    attachedBath: false,
    createdAt: '2026-01-01',
    ...over,
  };
}

/** A confirmed booking for four: one king room for three, one dorm bed. */
function booking(over: Partial<HostBooking> = {}): HostBooking {
  return {
    id: 'b1',
    ref: 'HH-1',
    guest: { name: 'Ayesha Khan', phone: '', email: '' },
    checkIn: '2026-10-10',
    checkOut: '2026-10-13',
    nights: 3,
    guests: 4,
    roomType: { name: 'King size room', occupancyType: 'private_room', capacity: 4, price: 12000 },
    total: 33600,
    deposit: 3360,
    paid: 0,
    balanceDue: 33600,
    room: null,
    renter: null,
    status: { name: 'Confirmed', slug: 'confirmed' },
    disposition: { name: 'Confirmed', slug: 'confirmed' },
    notes: '',
    lines: [
      { roomTypeId: 'KGJwMC', name: 'King size room', shared: false, units: 1, guests: 3, subtotal: 30000 },
      { roomTypeId: 'MqVuEl', name: 'Dormitory', shared: true, units: 1, guests: 1, subtotal: 3600 },
    ],
    currency: 'PKR',
    cancellationReason: '',
    source: '',
    createdAt: '2026-09-27',
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
  template: `<hh-assign-rooms-panel hostelId="h1" [booking]="booking()" [busy]="busy()" (assign)="last = $event" />`,
})
class Host {
  readonly booking = signal<HostBooking | null>(booking());
  readonly busy = signal(false);
  last: AssignSelection | null = null;
}

/**
 * Checking in is placing a party in rooms: how many are left to seat, what each room can take,
 * and whether the host may press the button. Each can fail silently — an over-full room still
 * looks fine on screen until two guests are sent to the same bed.
 */
describe('AssignRoomsPanel — checking in', () => {
  let fixture: ComponentFixture<Host>;
  let panel: AssignRoomsPanel;

  async function render(rooms: HostRoom[], b: HostBooking = booking()): Promise<void> {
    const api = new HostOpsStub();
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
    // The panel clears its picks in a microtask when it opens on a booking.
    await Promise.resolve();
    fixture.detectChanges();
  }

  /** The component's members are `protected`; the template reads them, so the tests may too. */
  const p = () => panel as unknown as Record<string, (...a: unknown[]) => unknown>;
  const groups = () => p()['groups']() as AssignGroup[];
  const row = (number: string) => groups().flatMap((g) => g.rows).find((r) => r.room.number === number) as AssignRow;
  const step = (number: string, by: number) => {
    p()['step'](row(number), by);
    fixture.detectChanges();
  };

  const ROOMS = [
    room({ id: 'd1', number: '101', type: 'Dormitory', capacity: 6, occupied: 4 }),
    room({ id: 'k1', number: '102', type: 'King size room', capacity: 4, occupied: 0 }),
    room({ id: 'k2', number: '103', type: 'King size room', capacity: 4, occupied: 4 }),
    room({ id: 's1', number: '201', type: 'Studio', capacity: 2, occupied: 0 }),
  ];

  afterEach(() => fixture?.destroy());

  it('offers every room on the property, grouped by type, the booked types first', async () => {
    await render(ROOMS);
    expect(groups().map((g) => [g.type, g.booked])).toEqual([
      ['Dormitory', true],
      ['King size room', true],
      ['Studio', false],
    ]);
  });

  it('counts free beds as capacity less what is taken, and lists the freest first', async () => {
    await render(ROOMS);
    const king = groups().find((g) => g.type === 'King size room');
    expect(king?.rows.map((r) => [r.room.number, r.free])).toEqual([
      ['102', 4],
      ['103', 0],
    ]);
  });

  it('aims to place the whole party', async () => {
    await render(ROOMS);
    expect(p()['needed']()).toBe(4);
  });

  it('places guests in any room, of any type, and totals them', async () => {
    await render(ROOMS);
    step('102', 1);
    step('102', 1);
    step('201', 1);
    step('101', 1);

    expect(p()['allocated']()).toBe(4);
    expect(p()['complete']()).toBe(true);
    expect(p()['summaryLine']()).toBe('101 × 1 · 102 × 2 · 201 × 1');
  });

  it('will not place more in a room than it has free beds', async () => {
    await render(ROOMS);
    step('101', 1);
    step('101', 1);
    step('101', 1);
    expect(row('101').placed).toBe(2);
  });

  it('will not place more people than the booking holds', async () => {
    await render(ROOMS);
    for (let i = 0; i < 6; i++) step('102', 1);
    step('201', 1);
    expect(p()['allocated']()).toBe(4);
    expect(row('201').placed).toBe(0);
  });

  it('steps back down, and forgets a room at zero', async () => {
    await render(ROOMS);
    step('102', 1);
    step('102', -1);
    step('102', -1);
    expect(row('102').placed).toBe(0);
  });

  it('shows a full room without a stepper, rather than hiding it', async () => {
    await render(ROOMS);
    const el = fixture.nativeElement as HTMLElement;
    const full = [...el.querySelectorAll('li')].find((li) => li.textContent?.includes('Room 103'));
    expect(full?.textContent).toContain('Full');
    expect(full?.querySelector('button')).toBeNull();
  });

  it('sends one allocation per room, as guests', async () => {
    await render(ROOMS);
    step('102', 1);
    step('102', 1);
    step('102', 1);
    step('101', 1);
    p()['submit']();

    expect(fixture.componentInstance.last).toEqual({
      bookingId: 'b1',
      rooms: [
        { roomId: 'd1', roomNumber: '101', guests: 1 },
        { roomId: 'k1', roomNumber: '102', guests: 3 },
      ],
    });
  });

  it('sends nothing with nobody placed', async () => {
    await render(ROOMS);
    p()['submit']();
    expect(fixture.componentInstance.last).toBeNull();
  });

  it('lets a smaller party be checked in, and says the headcount will change', async () => {
    await render(ROOMS);
    step('102', 1);
    step('102', 1);
    expect(p()['partial']()).toBe(true);
    const footer = (fixture.nativeElement as HTMLElement).querySelector('footer')?.textContent ?? '';
    expect(footer).toContain('records');
    expect(footer).toContain('2 guests');

    p()['submit']();
    expect(fixture.componentInstance.last?.rooms).toEqual([{ roomId: 'k1', roomNumber: '102', guests: 2 }]);
  });

  it('holds the button while the check-in is being sent', async () => {
    await render(ROOMS);
    step('102', 1);
    fixture.componentInstance.busy.set(true);
    fixture.detectChanges();
    p()['submit']();
    expect(fixture.componentInstance.last).toBeNull();
  });

  it('starts from nothing again when opened on another booking', async () => {
    await render(ROOMS);
    step('102', 1);
    fixture.componentInstance.booking.set(booking({ id: 'b2' }));
    fixture.detectChanges();
    await Promise.resolve();
    fixture.detectChanges();
    expect(p()['allocated']()).toBe(0);
  });
});
