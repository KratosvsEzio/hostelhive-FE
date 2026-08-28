import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { TranslocoPipe } from '@jsverse/transloco';
import { ConfirmModal } from '@hostelhive/ui';
import { BookingBasket } from './booking-basket';
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
  imports: [ConfirmModal, DecimalPipe, DatePipe, TranslocoPipe],
  templateUrl: './booking-summary.html',
})
export class BookingSummary {
  readonly currency = input<string | null | undefined>('PKR');
  readonly hostelName = input('');

  /** True while the request is in flight — the confirm button is the only thing that changes. */
  readonly submitting = input(false);

  /** Whatever the API said went wrong, verbatim. Empty when nothing has failed. */
  readonly error = input('');

  readonly confirmed = output<void>();
  readonly dismissed = output<void>();

  protected readonly basket = inject(BookingBasket);

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
