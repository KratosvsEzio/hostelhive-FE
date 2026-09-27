import { ChangeDetectionStrategy, Component, OnInit, computed, input, output, signal } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { TranslocoPipe } from '@jsverse/transloco';
import { ConfirmModal, Input as HhInput, PhoneInput } from '@hostelhive/ui';
import { CurrencySymbolPipe } from '@app/shared/currency/currency-symbol.pipe';
import { GuestBooking, GuestBookingPatch } from './my-bookings-api';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** The changed stay, as the review shows it before anything is sent. */
export interface StayChangeSummary {
  checkIn: Date;
  checkOut: Date;
  nights: number;
  lines: readonly { title: string; units: number; shared: boolean; guests: number; total: number }[];
  total: number;
  /** What the booking costs now, for the "was" figure. */
  previousTotal: number;
  currency: string;
}

/**
 * The last step of changing a pending booking: who it is for, the note to the hostel and,
 * when the dates or rooms changed, what the stay now is and costs.
 *
 * The same four fields, labels and rules as the form the booking was made with, so a guest
 * changing a booking meets the form they already filled in.
 */
@Component({
  selector: 'app-booking-edit-modal',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ConfirmModal, HhInput, PhoneInput, DatePipe, DecimalPipe, CurrencySymbolPipe, TranslocoPipe],
  templateUrl: './booking-edit-modal.html',
})
export class BookingEditModal implements OnInit {
  readonly booking = input.required<GuestBooking>();
  readonly saving = input(false);
  /** The server's reason, shown in the dialog the guest is looking at. */
  readonly error = input('');
  /** Set when the dates or rooms changed; the dialog then reviews them above the details. */
  readonly stay = input<StayChangeSummary | null>(null);

  /** Only the guest's details — the page adds the stay it is holding. */
  readonly saved = output<Omit<GuestBookingPatch, 'stay'>>();
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
  /**
   * Required, as on the booking form: its label carries the asterisk, and the hostel's
   * confirmation goes to it. The server alone would accept a blank one.
   */
  protected readonly emailError = computed(() => this.attempted() && !EMAIL.test(this.guestEmail().trim()));

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
