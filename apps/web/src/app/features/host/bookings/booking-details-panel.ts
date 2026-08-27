import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { Button } from '@hostelhive/ui';
import { laneFor } from './booking-month';
import { HostBooking } from './host-bookings-api';
import { isPrivateOccupancy } from '@util/occupancy-type';

/**
 * The request behind a pending allotment — everything a host needs before placing it.
 *
 * One layout for both occupancy types. The design makes that explicit: only the "Asked for"
 * field changes, reading "1 shared bed · 1 guest" or "1 private room · 2 guests", and the
 * primary action then either opens the bed stepper or the room list. Two panels would drift.
 *
 * Read-only by construction. Everything here is a fact the host is deciding *on*; the two
 * things they can do about it are the buttons at the bottom, and both belong to the page.
 */
@Component({
  selector: 'hh-booking-details-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, DecimalPipe, Button],
  templateUrl: './booking-details-panel.html',
})
export class BookingDetailsPanel {
  readonly booking = input<HostBooking | null>(null);
  /** Set by the page when an action could not be sent, so the footer can say why. */
  readonly actionError = input('');

  readonly closed = output<void>();
  readonly assign = output<HostBooking>();
  readonly decline = output<HostBooking>();

  /** Only a stay still waiting on a room can be placed or turned away from here. */
  protected readonly actionable = computed(
    () => this.booking()?.disposition.slug === 'pending-allotment',
  );

  protected readonly badge = computed(
    () => laneFor(this.booking()?.disposition.slug ?? '')?.badge ?? 'bg-ink-100 text-ink-600',
  );

  protected readonly isShared = computed(
    () => !isPrivateOccupancy(this.booking()?.roomType.occupancyType),
  );

  /**
   * "3 shared beds" / "1 private room" — the line the design says carries the room type.
   *
   * Beds are counted per guest on a dorm. A private booking has no quantity on the record, so
   * it is the fewest rooms of that type that seat the party — the same derivation the assign
   * panel uses, and named the same way so the two cannot disagree.
   */
  protected readonly askedFor = computed(() => {
    const b = this.booking();
    if (!b) return '';
    if (this.isShared()) {
      const n = Math.max(1, b.guests);
      return `${n} shared bed${n === 1 ? '' : 's'}`;
    }
    const n = Math.max(1, Math.ceil(b.guests / (b.roomType.capacity || 1)));
    return `${n} private room${n === 1 ? '' : 's'}`;
  });

  /** "1 guest · Dormitory" — the qualifier under "Asked for". */
  protected readonly askedForDetail = computed(() => {
    const b = this.booking();
    if (!b) return '';
    return `${b.guests} guest${b.guests === 1 ? '' : 's'} · ${b.roomType.name}`;
  });

  /** Whether the deposit has actually been taken, which changes what declining costs. */
  protected readonly depositPaid = computed(() => (this.booking()?.paid ?? 0) > 0);

  /** "12 minutes ago" from `created_at`, so the wait is legible without doing the sum. */
  protected readonly requestedAgo = computed(() => {
    const iso = this.booking()?.createdAt;
    if (!iso) return '';
    const then = new Date(iso).getTime();
    if (!Number.isFinite(then)) return '';
    const mins = Math.max(0, Math.round((Date.now() - then) / 60_000));
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins} minute${mins === 1 ? '' : 's'} ago`;
    const hours = Math.round(mins / 60);
    if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
    const days = Math.round(hours / 24);
    return `${days} day${days === 1 ? '' : 's'} ago`;
  });

  protected close(): void {
    this.closed.emit();
  }

  protected onAssign(): void {
    const b = this.booking();
    if (b) this.assign.emit(b);
  }

  protected onDecline(): void {
    const b = this.booking();
    if (b) this.decline.emit(b);
  }

  protected initials(name: string): string {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    return parts.length
      ? parts
          .map((p) => p[0])
          .slice(0, 2)
          .join('')
          .toUpperCase()
      : '–';
  }
}
