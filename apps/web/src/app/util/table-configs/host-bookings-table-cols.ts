import { format, parseISO } from 'date-fns';
import { CellDef, ColumnDef } from '@hostelhive/ui';
import { HostBooking } from '@features/host/bookings/host-bookings-api';
import { laneFor } from '@features/host/bookings/booking-month';

/**
 * The host's booking table, below the month calendar on the same page.
 *
 * A row is a **booking**. The real endpoint gives each one a single room type rather than a
 * basket of lines, so there is nothing left for the expandable child rows to reveal — the
 * Room column already says everything the expander used to.
 *
 * The status pill borrows its colours from the calendar's lanes rather than declaring its
 * own. The two are the same five dispositions on one screen, and a booking that reads amber
 * in the grid and grey in the table below it is a page arguing with itself.
 */

function day(iso: string | undefined | null): string {
  if (!iso) return '—';
  try {
    return format(parseISO(iso), 'd MMM');
  } catch {
    return '—';
  }
}

function dayYear(iso: string | undefined | null): string {
  if (!iso) return '—';
  try {
    return format(parseISO(iso), 'd MMM yyyy');
  } catch {
    return '—';
  }
}

/** "Dormitory · shared", or just the name when the API omits the occupancy. */
function roomLine(b: HostBooking): string {
  const { name, occupancyType } = b.roomType;
  return occupancyType ? `${name} · ${occupancyType}` : name;
}

/** PKR with thousands separators and no decimals — whole rupees is how the app quotes. */
function pkr(amount: number): string {
  return `PKR ${Math.round(amount).toLocaleString('en-PK')}`;
}

/**
 * Where the money is: **derived from the amounts, not read from `status`**.
 *
 * The record does carry a payment `status`, and it cannot be used. Live rows come back as
 * `status: { name: 'Paid' }` alongside `paid_amount: 0` and `balance_due: 616000` — so the
 * field is tracking something other than money received, and rendering it would print
 * "Paid" directly beside "PKR 616,000 due". A pill that contradicts the number next to it
 * is worse than no pill. These three come off the same figures the cell already shows, so
 * the badge and the amount can never disagree.
 *
 * "Unpaid" rather than "Due" because the figure it sits in front of already ends in "due",
 * and on a wholly unpaid row — which is most of them — the pair read "Due PKR 616,000 due".
 * Paid / Partial / Unpaid also parse as one set, which Paid / Partial / Due does not.
 *
 * It is deliberately the quiet one. Nothing-paid-yet is where every booking starts, so
 * on a normal list it is most of the column; in red it would cry wolf on rows where nothing
 * is wrong, and a host would learn to skip the column. Grey keeps green and amber meaning
 * "something has happened here", and the outstanding figure is still on the line below.
 *
 * No dot, unlike the disposition badge: these three labels say what they are in words, so
 * hue is not carrying the distinction on its own.
 */
function payment(b: HostBooking): { text: string; class: string } {
  if (b.balanceDue <= 0) return { text: 'Paid', class: 'bg-ok/10 text-ok' };
  if (b.paid > 0) return { text: 'Partial', class: 'bg-warn/10 text-warn' };
  return { text: 'Unpaid', class: 'bg-ink-100 text-ink-600' };
}

const CONFIG: Record<string, Omit<ColumnDef, 'key'>> = {
  guest: {
    label: 'Guest',
    cell: (r) => {
      const b = r as HostBooking;
      return {
        kind: 'composite',
        primary: b.guest.name,
        // The reference, not the phone: it is what a host quotes back on the phone, and the
        // number is one tap away in the row menu.
        secondary: b.ref || b.guest.phone || undefined,
      } satisfies CellDef;
    },
  },

  stay: {
    label: 'Stay',
    sortable: true,
    cell: (r) => {
      const b = r as HostBooking;
      return {
        kind: 'composite',
        primary: `${day(b.checkIn)} – ${dayYear(b.checkOut)}`,
        secondary: b.nights ? `${b.nights} night${b.nights === 1 ? '' : 's'}` : undefined,
      } satisfies CellDef;
    },
  },

  room: {
    label: 'Room',
    cell: (r) => ({ kind: 'text', value: roomLine(r as HostBooking) }) satisfies CellDef,
  },

  guests: {
    label: 'Guests',
    cell: (r) => {
      const n = (r as HostBooking).guests;
      return { kind: 'text', value: `${n} guest${n === 1 ? '' : 's'}` } satisfies CellDef;
    },
  },

  /**
   * The disposition, not the payment status.
   *
   * `status` on the wire is `paid` / `cancelled` — where the money is. `disposition` is where
   * the stay is, which is what a host scanning this list is actually after, and what the
   * calendar above counts. Rendered as a badge rather than a pill because a pill only offers
   * four tones and there are five dispositions; the badge carries the lane's own colours.
   *
   * The dot is the lane's too. Five states in one column is more than colour alone can carry
   * — three of the five are warm hues a red-green colourblind reader cannot separate — so the
   * badge leads with the same dot the calendar's lanes and bars use, and a host learns one
   * vocabulary for the whole page instead of two.
   */
  status: {
    label: 'Status',
    cell: (r) => {
      const b = r as HostBooking;
      const lane = laneFor(b.disposition.slug);
      return {
        kind: 'badge',
        text: b.disposition.name || '—',
        class: lane?.badge ?? 'bg-ink-100 text-ink-600',
        dot: lane?.dot ?? 'bg-ink-400',
      } satisfies CellDef;
    },
  },

  /**
   * What the stay is worth on the first line; where its payment stands on the second.
   *
   * The pill sits on the second line, in front of the outstanding figure, because that is
   * what it qualifies. Beside the total it would read as a fact about the total — and on a
   * part-paid row "Partial" next to the full price says the wrong thing.
   *
   * The figure keeps its own condition: nothing is outstanding on a settled row, so the pill
   * stands alone there rather than printing "PKR 0 due".
   */
  total: {
    label: 'Total',
    align: 'right',
    sortable: true,
    cell: (r) => {
      const b = r as HostBooking;
      return {
        kind: 'composite',
        primary: pkr(b.total),
        secondaryBadge: payment(b),
        secondary: b.balanceDue > 0 ? `${pkr(b.balanceDue)} due` : undefined,
      } satisfies CellDef;
    },
  },
};

export const HOST_BOOKINGS_TABLE_COLS: ColumnDef[] = Object.entries(CONFIG).map(
  ([key, def]) => ({ key, ...def }),
);
