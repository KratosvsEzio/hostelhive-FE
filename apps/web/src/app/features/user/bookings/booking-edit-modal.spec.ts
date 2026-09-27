import { TestBed } from '@angular/core/testing';
import { provideI18nTesting } from '@core/i18n/provide-i18n-testing';
import { BookingEditModal } from './booking-edit-modal';
import { GuestBooking, GuestBookingPatch, toGuestBooking } from './my-bookings-api';

function booking(guest: Partial<{ guest_name: string; guest_phone: string; guest_email: string }> = {}): GuestBooking {
  return toGuestBooking({
    id: 'RbNKwO',
    checkin_date: '2026-09-30T14:00:00.000+05:00',
    checkout_date: '2026-10-25T11:00:00.000+05:00',
    guest_name: 'hassan Khossa',
    guest_phone: '923030491909',
    guest_email: 'guest@example.com',
    notes: 'Testing the notes',
    ...guest,
  });
}

interface Internals {
  guestEmail: { set(v: string): void };
  guestName: { set(v: string): void };
  submit(): void;
}

function render(b: GuestBooking) {
  TestBed.configureTestingModule({ imports: [BookingEditModal], providers: [provideI18nTesting()] });
  const fixture = TestBed.createComponent(BookingEditModal);
  fixture.componentRef.setInput('booking', b);
  fixture.detectChanges();
  const emitted: GuestBookingPatch[] = [];
  fixture.componentInstance.saved.subscribe((p) => emitted.push(p));
  return { fixture, cmp: fixture.componentInstance as unknown as Internals, emitted };
}

describe('BookingEditModal', () => {
  it('prefills from the booking, with the stored phone read as E.164', () => {
    const { cmp, emitted } = render(booking());
    cmp.submit();
    expect(emitted).toEqual([
      { guestName: 'hassan Khossa', guestPhone: '+923030491909', guestEmail: 'guest@example.com', notes: 'Testing the notes' },
    ]);
  });

  it('requires the email, as the booking form does', () => {
    const { fixture, cmp, emitted } = render(booking());
    cmp.guestEmail.set('  ');
    cmp.submit();
    fixture.detectChanges();

    expect(emitted).toEqual([]);
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('publicBooking.enterAValidEmail');
  });

  it('refuses an email that is not an address', () => {
    const { cmp, emitted } = render(booking());
    cmp.guestEmail.set('not-an-email');
    cmp.submit();
    expect(emitted).toEqual([]);
  });

  it('requires the name', () => {
    const { cmp, emitted } = render(booking());
    cmp.guestName.set(' ');
    cmp.submit();
    expect(emitted).toEqual([]);
  });

  it('does not submit twice while a save is out', () => {
    const { fixture, cmp, emitted } = render(booking());
    fixture.componentRef.setInput('saving', true);
    cmp.submit();
    expect(emitted).toEqual([]);
  });
});
