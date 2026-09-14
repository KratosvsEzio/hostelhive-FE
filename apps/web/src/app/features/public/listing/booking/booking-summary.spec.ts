import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideI18nTesting } from '@core/i18n/provide-i18n-testing';
import { BookingBasket } from './booking-basket';
import { BookingSummary } from './booking-summary';
import { ROOM_OFFERS } from './room-offers.fixture';

@Component({
  imports: [BookingSummary],
  template: `<hh-booking-summary
    currency="PKR"
    [hostelName]="name()"
    [error]="err()"
    [reference]="ref()"
  />`,
  providers: [BookingBasket],
})
class Host {
  readonly name = signal('Ever Care Hostel');
  readonly err = signal('');
  readonly ref = signal<string | null>(null);
}

/**
 * The last screen before a booking exists.
 *
 * Online payment used to be this step. A guest who had misread the dates or the room count met
 * a card form — a poor place to find out, but a place. With the payment gone, **Book now**
 * would otherwise create the booking straight from a side rail the guest may not have looked
 * at since they set the dates, so this restates the whole thing and asks once.
 *
 * What it must never do is quote a figure the rail never showed: both read the basket rather
 * than recomputing, and these pin that they agree.
 */
describe('BookingSummary', () => {
  let fixture: ComponentFixture<Host>;
  let basket: BookingBasket;

  function setUp(): string {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [Host],
      providers: [provideI18nTesting()],
    });
    fixture = TestBed.createComponent(Host);
    basket = fixture.debugElement.injector.get(BookingBasket);

    basket.checkIn.set(new Date(2026, 8, 1));
    basket.checkOut.set(new Date(2026, 8, 4)); // three nights
    // No guest count to seed: the basket derives it from what is in it.
    const [first, second] = ROOM_OFFERS;
    basket.setQuantity(first, 2);
    basket.setQuantity(second, 1);

    fixture.detectChanges();
    return (fixture.nativeElement.textContent ?? '').replace(/\s+/g, ' ');
  }

  it('names every room in the basket', () => {
    const text = setUp();
    for (const line of basket.lines()) expect(text).toContain(line.title);
  });

  it('shows the stay it is pricing', () => {
    const text = setUp();

    expect(text).toContain('1 Sep');
    expect(text).toContain('4 Sep 2026');
    // Three nights, not four days — nobody pays for the morning they leave.
    expect(basket.nights()).toBe(3);
  });

  /**
   * The total is the basket's, to two decimals.
   *
   * Recomputing it here would be a second opinion, and a summary that disagrees with the rail
   * it was opened from is worse than no summary — the guest cannot tell which one they are
   * about to be charged.
   */
  it('quotes the basket’s own total, and it is the sum of the rooms above it', () => {
    const text = setUp();
    const money = (n: number) =>
      n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    // As the number pipe renders it, separators and all — what a guest actually reads.
    expect(text).toContain(money(basket.total()));

    // The rooms have to add up to it. A summary whose lines do not reach its own total is
    // the one thing a guest checking a total will spot, and it is unanswerable.
    const summary = fixture.debugElement.children[0].componentInstance as BookingSummary;
    const rows = (summary as unknown as { rooms(): { total: number }[] }).rooms();
    const summed = rows.reduce((n, r) => n + r.total, 0);

    expect(money(summed)).toBe(money(basket.total()));
    for (const row of rows) expect(text).toContain(money(row.total));
  });

  it('says nothing is being charged now', () => {
    const text = setUp();
    expect(text).toContain('publicBooking.theHostelWillConfirm');
  });

  it('shows a failure in place, rather than sending the guest away', () => {
    setUp();
    fixture.componentInstance.err.set('Only 1 left of Mixed Dorm for those dates.');
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Only 1 left of Mixed Dorm');
  });

  it('emits rather than booking — the page owns the request', () => {
    setUp();
    const summary = fixture.debugElement.children[0].componentInstance as BookingSummary;
    let confirmed = 0;
    summary.confirmed.subscribe(() => confirmed++);

    summary.confirmed.emit();
    expect(confirmed).toBe(1);
  });
});

/**
 * The receipt.
 *
 * Once the booking exists, the modal stops being a review of something about to happen and
 * becomes the record of something that has. The reference is the whole reason it stays on
 * screen at all: it is what the guest quotes when they ring the hostel, and it used to appear
 * only in a toast that removed itself after a few seconds.
 */
describe('BookingSummary — once the booking exists', () => {
  let fixture: ComponentFixture<Host>;

  function setUp(reference: string | null): string {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [Host],
      providers: [provideI18nTesting()],
    });
    fixture = TestBed.createComponent(Host);
    const basket = fixture.debugElement.injector.get(BookingBasket);
    basket.checkIn.set(new Date(2026, 8, 1));
    basket.checkOut.set(new Date(2026, 8, 4));
    basket.setQuantity(ROOM_OFFERS[0]!, 2);
    fixture.componentInstance.ref.set(reference);
    fixture.detectChanges();
    return (fixture.nativeElement.textContent ?? '').replace(/\s+/g, ' ');
  }

  it('shows the reference', () => {
    expect(setUp('HH-2026-5CW0EZ0N')).toContain('HH-2026-5CW0EZ0N');
  });

  /**
   * The rooms and the total go. They were the case for confirming, and that decision is made
   * — leaving them up invites a guest to keep reading a quote as though it were still an
   * offer. What is left is only what they did not already know.
   */
  it('stops reviewing the basket', () => {
    const text = setUp('HH-2026-5CW0EZ0N');

    expect(text).not.toContain(ROOM_OFFERS[0]!.title);
  });

  // Nothing to cancel out of any more — a receipt has one button and it closes.
  it('offers one way out rather than confirm-or-cancel', () => {
    setUp('HH-2026-5CW0EZ0N');
    const buttons = [...fixture.nativeElement.querySelectorAll('button')] as HTMLButtonElement[];
    const labels = buttons.map((b) => (b.textContent ?? '').trim()).filter(Boolean);

    expect(labels).not.toContain('publicBooking.confirmBooking');
    expect(labels.some((l) => l.includes('common.done'))).toBe(true);
  });

  /**
   * No reference means no receipt. The listing page falls back to closing the modal in that
   * case, so this only has to not render a box with a hole where the number goes.
   */
  it('stays a review when nothing came back to quote', () => {
    const text = setUp(null);

    expect(text).toContain(ROOM_OFFERS[0]!.title);
    expect(text).toContain('publicBooking.confirmBooking');
  });
});
