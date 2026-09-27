import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Observable, of } from 'rxjs';
import { provideI18nTesting } from '@core/i18n/provide-i18n-testing';
import { ACTIONS_BY_LANE, BookingAction, BookingDetailsPanel } from './booking-details-panel';
import { BookingOccupancy, HostBooking, HostBookingsApi } from './host-bookings-api';

function booking(slug: string, over: Partial<HostBooking> = {}): HostBooking {
  return {
    id: 'b1',
    ref: 'HH-1',
    guest: { name: 'Ali Raza', phone: '923001234567', email: '' },
    checkIn: '2026-10-10',
    checkOut: '2026-10-13',
    nights: 3,
    guests: 6,
    roomType: { name: 'King size room', occupancyType: 'private_room', capacity: 4, price: 12000 },
    total: 67200,
    deposit: 6720,
    paid: 0,
    balanceDue: 67200,
    room: null,
    renter: null,
    status: { name: slug, slug },
    disposition: { name: slug, slug },
    notes: '',
    lines: [
      { roomTypeId: 'KGJwMC', name: 'King size room', shared: false, units: 2, guests: 4, subtotal: 60000 },
      { roomTypeId: 'MqVuEl', name: 'Dormitory', shared: true, units: 2, guests: 2, subtotal: 7200 },
    ],
    currency: 'PKR',
    cancellationReason: '',
    source: '',
    createdAt: '2026-09-27',
    ...over,
  };
}

class ApiStub {
  rows: BookingOccupancy[] = [];
  occupancies = vi.fn((): Observable<BookingOccupancy[]> => of(this.rows));
  releaseOccupancy = vi.fn((): Observable<void> => of(undefined));
}

@Component({
  imports: [BookingDetailsPanel],
  template: `<hh-booking-details-panel hostelId="MjvuEl" [booking]="booking()" [busy]="busy()" (act)="acted.push($event.action)" />`,
})
class Host {
  readonly booking = signal<HostBooking | null>(null);
  readonly busy = signal(false);
  acted: BookingAction[] = [];
}

describe('BookingDetailsPanel', () => {
  let fixture: ComponentFixture<Host>;
  let api: ApiStub;

  function render(b: HostBooking): HTMLElement {
    api = new ApiStub();
    TestBed.configureTestingModule({
      imports: [Host],
      providers: [provideI18nTesting(), { provide: HostBookingsApi, useValue: api }],
    });
    fixture = TestBed.createComponent(Host);
    fixture.componentInstance.booking.set(b);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }
  const buttons = (el: HTMLElement) =>
    [...el.querySelectorAll<HTMLButtonElement>('footer button')].map((b) => b.textContent?.trim());

  it('offers each stage only the moves the lifecycle allows', () => {
    expect(ACTIONS_BY_LANE).toEqual({
      pending: ['cancel', 'confirm'],
      confirmed: ['cancel', 'noShow', 'checkIn'],
      'checked-in': ['cancel', 'invoice', 'checkOut'],
      'checked-out': ['invoice'],
      'no-show': ['invoice'],
      cancelled: [],
    });
  });

  it('never offers confirm off pending, nor check-in off confirmed — the server does not guard either', () => {
    for (const [lane, actions] of Object.entries(ACTIONS_BY_LANE)) {
      if (lane !== 'pending') expect(actions).not.toContain('confirm');
      if (lane !== 'confirmed') expect(actions).not.toContain('checkIn');
    }
  });

  it('draws the moves for a pending booking, confirm last', () => {
    expect(buttons(render(booking('pending')))).toEqual(['Cancel booking', 'Confirm']);
  });

  it('treats an older pending-allotment record as pending', () => {
    expect(buttons(render(booking('pending-allotment')))).toEqual(['Cancel booking', 'Confirm']);
  });

  it('draws check-in and no-show for a confirmed booking', () => {
    expect(buttons(render(booking('confirmed', { paid: 67200, balanceDue: 0 })))).toEqual([
      'Cancel booking',
      'Mark no show',
      'Check in',
    ]);
  });

  // Mark as paid (Trello #81): only on a payable stage, only while money is owed, and never
  // displacing the stage's own finishing move from the end.
  it('offers mark as paid on a confirmed booking with a balance, before check-in', () => {
    expect(buttons(render(booking('confirmed')))).toEqual(['Cancel booking', 'Mark no show', 'Mark as paid', 'Check in']);
  });

  it('does not offer mark as paid once nothing is owed', () => {
    expect(buttons(render(booking('checked-out', { paid: 67200, balanceDue: 0 })))).toEqual(['Generate invoice']);
  });

  it('does not offer mark as paid on a booking the hostel has not confirmed', () => {
    expect(buttons(render(booking('pending')))).not.toContain('Mark as paid');
  });

  it('does not offer mark as paid on a no-show, even one that still owes', () => {
    expect(buttons(render(booking('no-show')))).toEqual(['Generate invoice']);
  });

  it('offers only a Close on a cancelled booking', () => {
    expect(buttons(render(booking('cancelled')))).toEqual(['Close']);
  });

  it('emits the move rather than making it', () => {
    const el = render(booking('pending'));
    [...el.querySelectorAll<HTMLButtonElement>('footer button')].find((b) => b.textContent?.includes('Confirm'))?.click();
    expect(fixture.componentInstance.acted).toEqual(['confirm']);
  });

  it('holds every move while one is in flight', () => {
    const el = render(booking('pending'));
    fixture.componentInstance.busy.set(true);
    fixture.detectChanges();
    const all = [...el.querySelectorAll<HTMLButtonElement>('footer button')];
    expect(all.every((b) => b.disabled)).toBe(true);
  });

  it('lists what was booked, line by line, in the booking currency', () => {
    const text = render(booking('pending')).textContent ?? '';
    expect(text).toContain('2 rooms · King size room');
    expect(text).toContain('2 beds · Dormitory');
    expect(text).toContain('Rs 67,200');
  });

  it('shows who is in which room once checked in, and releases one', () => {
    const b = booking('checked-in');
    api = new ApiStub();
    TestBed.configureTestingModule({
      imports: [Host],
      providers: [provideI18nTesting(), { provide: HostBookingsApi, useValue: api }],
    });
    api.rows = [
      { id: 'o1', roomId: 'r1', roomNumber: '101', guests: 2, active: true },
      { id: 'o2', roomId: 'r2', roomNumber: '102', guests: 1, active: false },
    ];
    fixture = TestBed.createComponent(Host);
    fixture.componentInstance.booking.set(b);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;

    expect(api.occupancies).toHaveBeenCalledWith('MjvuEl', 'b1');
    expect(el.textContent).toContain('Room 101 · 2 guests');
    expect(el.textContent).toContain('Released');

    [...el.querySelectorAll<HTMLButtonElement>('button')].find((x) => x.textContent?.trim() === 'Release')?.click();
    expect(api.releaseOccupancy).toHaveBeenCalledWith('MjvuEl', 'b1', 'o1');
    // Re-read after the release — on the next change detection, as the page would get it.
    fixture.detectChanges();
    expect(api.occupancies).toHaveBeenCalledTimes(2);
  });

  it('does not re-read the rooms when the same booking comes back marked paid', () => {
    const b = booking('checked-in');
    api = new ApiStub();
    TestBed.configureTestingModule({
      imports: [Host],
      providers: [provideI18nTesting(), { provide: HostBookingsApi, useValue: api }],
    });
    fixture = TestBed.createComponent(Host);
    fixture.componentInstance.booking.set(b);
    fixture.detectChanges();
    expect(api.occupancies).toHaveBeenCalledTimes(1);

    // The page swaps in the server's reply to mark_as_paid: same booking, now settled.
    fixture.componentInstance.booking.set({ ...b, paid: b.total, balanceDue: 0 });
    fixture.detectChanges();
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';

    expect(api.occupancies).toHaveBeenCalledTimes(1);
    expect(text).not.toContain('Mark as paid');
  });

  it('does not ask for rooms on a booking that is not checked in', () => {
    render(booking('confirmed'));
    expect(api.occupancies).not.toHaveBeenCalled();
  });

  it("shows the host's reason on a cancelled booking when the server sends one", () => {
    const text = render(booking('cancelled', { cancellationReason: 'Water leak in dorm' })).textContent ?? '';
    expect(text).toContain('Water leak in dorm');
  });
});
