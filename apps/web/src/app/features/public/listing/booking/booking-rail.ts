import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { Button } from '@hostelhive/ui';
import { SessionStore } from '@core/auth';
import { PricingPeriod, periodLabel } from '@util/pricing-period';
import { BookingBasket } from './booking-basket';
import { BasketLine, lineTotal, lineTotalUndiscounted, unitFor } from './room-offer';
import { TranslocoPipe } from '@jsverse/transloco';

/**
 * The sticky panel beside the room list: what you have chosen, what it costs, and the button.
 *
 * Two figures matter here and must never be mistaken for one another — the **total** for the
 * whole stay, and **payable now**, the deposit taken today. Everything else in this component
 * exists to make those two legible: the per-line arithmetic is shown rather than just its
 * answer, because somebody looking at a six-figure total wants to see where it came from.
 */
@Component({
  selector: 'hh-booking-rail',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Button, DecimalPipe, DatePipe, TranslocoPipe],
  templateUrl: './booking-rail.html',
})
export class BookingRail {
  readonly period = input<PricingPeriod>('nightly');
  readonly currency = input<string | null | undefined>('PKR');
  /** Lowest price across both groups, shown before anything is selected. */
  readonly fromPrice = input<number | null>(null);

  /** Emitted when the basket is payable. The page decides whether that means sign in first. */
  readonly book = output<void>();

  protected readonly basket = inject(BookingBasket);
  private readonly session = inject(SessionStore);

  protected readonly signedIn = computed(() => !!this.session.user());

  /**
   * Browsing is open; booking is not.
   *
   * The wall is here rather than on Add so that the picker, the prices and the basket stay
   * available to anyone — those are the pages that get indexed and the ones a seeker judges
   * the hostel on. It is also why the basket holds nothing on the server until this point.
   */
  protected readonly cta = computed(() => (this.signedIn() ? 'Book now' : 'Sign in to book'));

  protected periodLabel(): string {
    return periodLabel(this.period());
  }

  protected lineTotal(line: BasketLine): number {
    return lineTotal(line, this.basket.nights());
  }

  protected lineWas(line: BasketLine): number {
    return lineTotalUndiscounted(line, this.basket.nights());
  }

  protected hasLineDiscount(line: BasketLine): boolean {
    return line.actualPrice > line.unitPrice;
  }

  /** "2 Rooms" / "3 Beds" — the same unit language the picker uses. */
  protected unitLabel(line: BasketLine): string {
    const unit = unitFor(line.kind);
    return `${line.quantity} ${unit}${line.quantity === 1 ? '' : 's'}`;
  }

  /** Per-night cost of the whole line, before nights are applied. */
  protected linePerNight(line: BasketLine): number {
    return line.unitPrice * line.quantity;
  }

  /**
   * The running tally that replaces a validation error on submit.
   *
   * "3 of 4 guests placed" while they are still choosing beats "your selection does not match
   * your guest count" after they think they are finished — the second leaves them to work out
   * which of two numbers to change.
   */
  protected readonly tally = computed(() => {
    const fit = this.basket.fit();
    const guests = this.basket.guests();
    if (this.basket.isEmpty()) return null;
    if (fit.overBedded) {
      const spare = fit.beds - guests;
      return `${spare} bed${spare === 1 ? '' : 's'} more than guests`;
    }
    if (fit.shortfall > 0) return `${fit.seated} of ${guests} guests placed`;
    return null;
  });

  protected remove(roomId: string): void {
    this.basket.remove(roomId);
  }

  /**
   * `<input type="date">` yields `yyyy-MM-dd`, which `new Date()` reads as UTC midnight —
   * enough to shift a check-in a day backwards west of Greenwich. Parsed by parts instead, so
   * the date the seeker picked is the date the booking carries.
   */
  private parseDate(value: string): Date | null {
    const [y, m, d] = value.split('-').map(Number);
    return y && m && d ? new Date(y, m - 1, d) : null;
  }

  protected onCheckIn(value: string): void {
    this.basket.checkIn.set(this.parseDate(value));
  }

  protected onCheckOut(value: string): void {
    this.basket.checkOut.set(this.parseDate(value));
  }

  protected onGuests(value: string): void {
    const n = Number(value);
    this.basket.guests.set(Number.isFinite(n) && n > 0 ? Math.floor(n) : 1);
  }
}
