import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { Button, DateRange, DateRangePicker } from '@hostelhive/ui';
import { SessionStore } from '@core/auth';
import { PricingPeriod, periodLabel } from '@util/pricing-period';
import { BookingBasket } from './booking-basket';
import { BasketLine, lineTotal, lineTotalUndiscounted, unitFor } from './room-offer';
import { TranslocoPipe } from '@jsverse/transloco';
import { CurrencySymbolPipe } from '@app/shared/currency/currency-symbol.pipe';

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
  imports: [Button, DateRangePicker, DecimalPipe, TranslocoPipe, CurrencySymbolPipe],
  templateUrl: './booking-rail.html',
})
export class BookingRail {
  readonly period = input<PricingPeriod>('nightly');
  readonly currency = input<string | null | undefined>('PKR');
  /** Lowest price across both groups, shown before anything is selected. */
  readonly fromPrice = input<number | null>(null);

  /** Emitted when the basket is payable. The page decides whether that means sign in first. */
  readonly book = output<void>();

  /**
   * The empty-basket call to action — "Choose a room".
   *
   * Raised rather than handled here for the same reason {@link book} is: whether it scrolls to
   * the picker or asks the seeker to sign in first is the page's decision, and the page is
   * where the sign-in gate already lives.
   */
  readonly chooseRoom = output<void>();

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
   * The basket holds `Date`s; the picker speaks `YYYY-MM-DD`.
   *
   * Formatted from the local parts rather than `toISOString()`, which converts to UTC and
   * would hand the picker the previous day for anyone west of Greenwich — the same bug
   * `parseDate` exists to avoid on the way back in.
   */
  private iso(d: Date | null): string | null {
    if (!d) return null;
    const m = `${d.getMonth() + 1}`.padStart(2, "0");
    const day = `${d.getDate()}`.padStart(2, "0");
    return `${d.getFullYear()}-${m}-${day}`;
  }

  protected readonly checkInIso = computed(() => this.iso(this.basket.checkIn()));
  protected readonly checkOutIso = computed(() => this.iso(this.basket.checkOut()));

  /** A stay cannot start in the past, so the calendar will not offer it. */
  protected readonly todayIso = this.iso(new Date()) ?? '';

  protected remove(roomId: string): void {
    this.basket.remove(roomId);
  }

  /**
   * `<input type="date">` yields `yyyy-MM-dd`, which `new Date()` reads as UTC midnight —
   * enough to shift a check-in a day backwards west of Greenwich. Parsed by parts instead, so
   * the date the seeker picked is the date the booking carries.
   */
  private parseDate(value: string | null): Date | null {
    if (!value) return null;
    const [y, m, d] = value.split('-').map(Number);
    return y && m && d ? new Date(y, m - 1, d) : null;
  }

  /**
   * Both ends at once, because the picker only reports a range once it has one.
   *
   * That is the point of moving off two `<input type="date">`: a seeker could set a
   * check-out before their check-in and the rail would price the gap as negative nights.
   * The calendar cannot express that — the second click is always the later day.
   */
  protected onRange(range: DateRange): void {
    this.basket.checkIn.set(this.parseDate(range.from));
    this.basket.checkOut.set(this.parseDate(range.to));
  }

}
