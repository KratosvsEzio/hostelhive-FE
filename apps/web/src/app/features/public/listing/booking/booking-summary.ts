import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { TranslocoPipe } from '@jsverse/transloco';
import { CurrencySymbolPipe } from '@app/shared/currency/currency-symbol.pipe';
import { ConfirmModal, Input as HhInput } from '@hostelhive/ui';
import { SessionStore } from '@core/auth/session-store';
import { BookingBasket } from './booking-basket';
import { BookingGuest } from './booking-request';
import { BasketLine, lineTotal, unitFor } from './room-offer';

/**
 * The last thing between choosing rooms and the booking existing.
 *
 * Online payment used to be that step: a guest who had misread the dates or the room count
 * found out at a card form, which is a poor place to discover it but at least a place. With
 * the payment gone, pressing **Book now** would otherwise create the booking directly from a
 * side rail the guest may not have looked at since they set the dates — so this restates the
 * whole thing in one place and asks once.
 *
 * It shows and asks; it does not book. The listing page owns the request, because it is the
 * thing that knows which hostel this is and what to do afterwards.
 */
@Component({
  selector: 'hh-booking-summary',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ConfirmModal, DecimalPipe, DatePipe, TranslocoPipe, CurrencySymbolPipe, HhInput],
  templateUrl: './booking-summary.html',
})
export class BookingSummary {
  readonly currency = input<string | null | undefined>('PKR');
  readonly hostelName = input('');

  /** True while the request is in flight — the confirm button is the only thing that changes. */
  readonly submitting = input(false);

  /** Whatever the API said went wrong, verbatim. Empty when nothing has failed. */
  readonly error = input('');

  /**
   * The booking's reference, once it exists — which turns this from a review into a receipt.
   *
   * Shown here rather than in the toast the confirmation used to be. A reference is the one
   * thing a guest needs to keep: it is what they quote when they ring the hostel, and a
   * notification that takes itself off the screen after a few seconds is not somewhere to put
   * a number somebody has to write down.
   */
  readonly reference = input<string | null>(null);

  readonly confirmed = output<BookingGuest>();
  readonly dismissed = output<void>();

  /** A receipt has nothing to cancel out of — one button, and it closes. */
  protected readonly done = computed(() => this.reference() !== null);
  protected readonly copied = signal(false);

  protected copyReference(): void {
    const ref = this.reference();
    if (!ref) return;
    void navigator.clipboard
      ?.writeText(ref)
      .then(() => {
        this.copied.set(true);
        setTimeout(() => this.copied.set(false), 2000);
      })
      // A clipboard the browser will not give up is not worth an error: the reference is on
      // screen and selectable, which is how it was going to be copied anyway.
      .catch(() => undefined);
  }

  protected readonly basket = inject(BookingBasket);
  private readonly session = inject(SessionStore);

  // ── who the booking is for ────────────────────────────────────────────────────
  /**
   * Prefilled from the account, and editable.
   *
   * People book for other people — a parent taking a room for a student is most of this
   * market — so the account holder is a sensible default and a poor assumption. The account
   * carries no phone at all, which settles it: a field that has to be asked for either way is
   * better asked for beside the two that can be filled in.
   */
  protected readonly guestName = signal('');
  protected readonly guestPhone = signal('');
  protected readonly guestEmail = signal('');
  /** Set once the guest has tried to confirm — errors stay quiet until then. */
  protected readonly attempted = signal(false);

  constructor() {
    // `effect` rather than an initial value: the session is restored asynchronously on a cold
    // load, so reading it once at construction gets a blank on exactly the refresh where the
    // guest most wants their details back.
    effect(() => {
      const user = this.session.user();
      if (!user) return;
      if (!this.guestName()) this.guestName.set(user.name ?? '');
      if (!this.guestEmail()) this.guestEmail.set(user.email ?? '');
    });
  }

  protected readonly nameError = computed(() =>
    this.attempted() && !this.guestName().trim() ? 'required' : '',
  );

  /**
   * Digits, not shape.
   *
   * Eight is short enough to admit every national format this app will meet and long enough
   * to reject a number somebody gave up halfway through typing. Anything stricter is a
   * validator that tells a guest with a perfectly good foreign number that it is wrong.
   */
  protected readonly phoneError = computed(() =>
    this.attempted() && this.guestPhone().replace(/\D/g, '').length < 8 ? 'invalid' : '',
  );

  protected readonly emailError = computed(() =>
    this.attempted() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(this.guestEmail().trim())
      ? 'invalid'
      : '',
  );

  /** Whether the details would pass, regardless of whether anybody has tried yet. */
  private readonly detailsValid = computed(
    () =>
      !!this.guestName().trim() &&
      this.guestPhone().replace(/\D/g, '').length >= 8 &&
      /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(this.guestEmail().trim()),
  );

  /**
   * Confirm stays live on an incomplete form, and pressing it shows what is missing.
   *
   * A disabled button is the worse of the two: it says no without saying why, and on a modal
   * where three fields arrive prefilled it is not obvious which one is the problem.
   */
  protected submit(): void {
    this.attempted.set(true);
    if (!this.detailsValid()) return;
    this.confirmed.emit({
      name: this.guestName(),
      phone: this.guestPhone(),
      email: this.guestEmail(),
    });
  }

  /**
   * Rooms, priced. The rail shows the same figures; both read them from the basket rather
   * than recomputing, so the summary cannot quote a total the rail never showed.
   */
  protected readonly rooms = computed(() =>
    this.basket.lines().map((line) => ({
      line,
      unit: unitFor(line.kind),
      total: lineTotal(line, this.basket.nights()),
    })),
  );

  protected units(line: BasketLine): number {
    return line.quantity;
  }
}
