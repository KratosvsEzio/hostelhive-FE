import { ChangeDetectionStrategy, Component, OnInit, computed, input, output, signal } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { ConfirmModal, Input as HhInput, PhoneInput } from '@hostelhive/ui';
import { GuestBooking, GuestBookingPatch } from './my-bookings-api';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Changing who a pending booking is for, and the note to the hostel.
 *
 * The same four fields, labels and rules as the form the booking was made with, so a guest
 * correcting a typo meets the form they already filled in. Dates and rooms are not here: the
 * server cannot reprice a booking after it is made (see `MyBookingsApi.update`).
 */
@Component({
  selector: 'app-booking-edit-modal',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ConfirmModal, HhInput, PhoneInput, TranslocoPipe],
  templateUrl: './booking-edit-modal.html',
})
export class BookingEditModal implements OnInit {
  readonly booking = input.required<GuestBooking>();
  readonly saving = input(false);
  /** The server's reason, shown in the dialog the guest is looking at. */
  readonly error = input('');

  readonly saved = output<GuestBookingPatch>();
  readonly dismissed = output<void>();

  protected readonly notesMax = 500;
  protected readonly guestName = signal('');
  protected readonly guestPhone = signal('');
  protected readonly guestEmail = signal('');
  protected readonly notes = signal('');
  private readonly attempted = signal(false);

  ngOnInit(): void {
    const b = this.booking();
    this.guestName.set(b.guest.name);
    this.guestPhone.set(asE164(b.guest.phone));
    this.guestEmail.set(b.guest.email);
    this.notes.set(b.notes);
  }

  protected readonly nameError = computed(() => this.attempted() && !this.guestName().trim());
  /** `hh-phone-input` emits a number only once it is valid, and `''` until then. */
  protected readonly phoneError = computed(() => this.attempted() && !this.guestPhone().trim());
  /** Optional, as on the booking form's server side — but if given, it has to be an address. */
  protected readonly emailError = computed(
    () => this.attempted() && !!this.guestEmail().trim() && !EMAIL.test(this.guestEmail().trim()),
  );

  protected submit(): void {
    this.attempted.set(true);
    if (this.nameError() || this.phoneError() || this.emailError() || this.saving()) return;
    this.saved.emit({
      guestName: this.guestName(),
      guestPhone: this.guestPhone(),
      guestEmail: this.guestEmail(),
      notes: this.notes(),
    });
  }
}

/**
 * The stored number as the phone field reads it. The server keeps digits only
 * (`923001234567`); the field parses E.164, which needs the `+` to know the country.
 */
export function asE164(phone: string): string {
  const p = phone.trim();
  if (!p || p.startsWith('+')) return p;
  const digits = p.replace(/\D/g, '');
  return digits ? `+${digits}` : '';
}
