import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { catchError, of, startWith, switchMap } from 'rxjs';
import { Button, Skeleton } from '@hostelhive/ui';
import { HostOpsApi } from '@services';
import { HostRoom } from '@util/models/host-ops';
import { HostBooking } from './host-bookings-api';

/** One room the host can put this booking into, with how much of it is free. */
export interface AssignRow {
  room: HostRoom;
  /** Beds not already taken. Zero means the row is shown but cannot be picked. */
  free: number;
  /** Beds allocated here — 0 or 1 for a private room, 0..free for a dorm. */
  picked: number;
}

/** What the host settled on, for whoever ends up sending it. */
export interface AssignSelection {
  bookingId: string;
  rooms: { roomId: string; roomNumber: string; beds: number }[];
}

interface RoomsState {
  loading: boolean;
  error: boolean;
  rooms: HostRoom[];
}

/**
 * Putting a pending allotment into real rooms.
 *
 * Assignment is not a search — the guest chose the room *type* when they booked, so this is
 * filling a shopping list. The panel lists only rooms of the booked type, counts what is
 * still needed, and keeps the primary action blocked until the count is met. Offering the
 * whole building would invite a host to move somebody into a type they did not pay for,
 * which needs their agreement and a re-price rather than a click.
 *
 * The two modes differ in one thing only. A private room is taken whole, so it is a
 * checkbox. A dorm sells beds, and **beds are allocated by count, never by number** — the
 * desk picks the physical bed at check-in — so it is a stepper bounded by what is free.
 *
 * Where the design shows several sections (a booking of "2 × King Suite + 1 × Deluxe"), the
 * API carries one room type per booking, so there is exactly one section today. The layout
 * is per-type rather than flat so that a multi-line booking needs no rework here.
 */
@Component({
  selector: 'hh-assign-rooms-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, DecimalPipe, Button, Skeleton],
  templateUrl: './assign-rooms-panel.html',
})
export class AssignRoomsPanel {
  readonly hostelId = input('');
  /** The booking being placed. `null` closes the panel. */
  readonly booking = input<HostBooking | null>(null);
  /** Set by the page when a submit could not be sent, so the footer can say why. */
  readonly submitError = input('');

  readonly closed = output<void>();
  readonly assign = output<AssignSelection>();

  private readonly api = inject(HostOpsApi);

  protected readonly open = computed(() => !!this.booking());

  private readonly rooms = toSignal(
    toObservable(computed(() => (this.booking() ? this.hostelId() : ''))).pipe(
      switchMap((hostelId) =>
        !hostelId
          ? of<RoomsState>({ loading: false, error: false, rooms: [] })
          : // A generous page rather than the default: the panel filters to one type, and a
            // second page would silently hide the room the host is looking for.
            this.api.rooms(hostelId, 1, 200).pipe(
              switchMap((r) => of<RoomsState>({ loading: false, error: false, rooms: r.rooms })),
              startWith<RoomsState>({ loading: true, error: false, rooms: [] }),
              catchError(() => of<RoomsState>({ loading: false, error: true, rooms: [] })),
            ),
      ),
    ),
    { initialValue: { loading: true, error: false, rooms: [] } as RoomsState },
  );

  protected readonly loading = computed(() => this.rooms().loading);
  protected readonly error = computed(() => this.rooms().error);

  protected readonly isShared = computed(
    () => this.booking()?.roomType.occupancyType !== 'private',
  );

  /**
   * How many units this booking still owes.
   *
   * Beds for a dorm is the guest count and nothing else. Rooms for a private booking has to
   * be **derived** — the record carries a room type and a headcount but no quantity — so it
   * is the smallest number of rooms of this type that seats everybody. That is a guess where
   * the design had a real line item, and it is why the footer names the figure it used.
   */
  protected readonly needed = computed(() => {
    const b = this.booking();
    if (!b) return 0;
    if (this.isShared()) return Math.max(1, b.guests);
    const per = b.roomType.capacity || 1;
    return Math.max(1, Math.ceil(b.guests / per));
  });

  /** Beds picked per room id. Cleared whenever the panel opens on another booking. */
  private readonly picks = signal<Record<string, number>>({});
  private lastBookingId = '';

  /**
   * Rooms of the booked type, most free first.
   *
   * `HostRoom.type` is the type's *name*, which is what the booking carries too — there is no
   * type id on the room list — so the match is by name. A rename on the backend would empty
   * this list rather than mis-fill it, which is the safer of the two failures.
   */
  protected readonly rows = computed<AssignRow[]>(() => {
    const b = this.booking();
    if (!b) return [];
    // Reset the picks when the panel is reused for a different booking.
    if (b.id !== this.lastBookingId) {
      this.lastBookingId = b.id;
      queueMicrotask(() => this.picks.set({}));
    }
    const picks = this.picks();
    return this.rooms()
      .rooms.filter((r) => r.type === b.roomType.name)
      .map((room) => ({
        room,
        free: Math.max(0, room.capacity - room.occupied),
        picked: picks[room.id] ?? 0,
      }))
      .sort((a, x) => x.free - a.free || a.room.number.localeCompare(x.room.number));
  });

  protected readonly allocated = computed(() =>
    this.rows().reduce((n, r) => n + r.picked, 0),
  );

  protected readonly remaining = computed(() => Math.max(0, this.needed() - this.allocated()));
  protected readonly complete = computed(() => this.allocated() === this.needed());

  /** "Harbour 6 × 2 beds · Garden 10 × 1 bed", the sentence the footer confirms with. */
  protected readonly summaryLine = computed(() => {
    const parts = this.rows()
      .filter((r) => r.picked > 0)
      .map((r) =>
        this.isShared()
          ? `${r.room.number} × ${r.picked} bed${r.picked === 1 ? '' : 's'}`
          : r.room.number,
      );
    return parts.join(' · ');
  });

  /** Nightly rate × units × nights. The type's own price, since only this type is offered. */
  protected readonly total = computed(() => {
    const b = this.booking();
    if (!b) return 0;
    const rate = b.roomType.capacity && !this.isShared() ? 0 : 0;
    void rate;
    // The booking already carries what the guest is paying; assignment does not re-price it.
    return b.total;
  });

  protected toggleRoom(row: AssignRow): void {
    if (!row.free) return;
    this.picks.update((p) => {
      const next = { ...p };
      if (next[row.room.id]) delete next[row.room.id];
      // Never let the host over-fill: the button would still be blocked, but a counter that
      // reads "4 of 3" makes them hunt for which one to undo.
      else if (this.allocated() < this.needed()) next[row.room.id] = 1;
      return next;
    });
  }

  protected stepBeds(row: AssignRow, by: number): void {
    this.picks.update((p) => {
      const current = p[row.room.id] ?? 0;
      const ceiling = Math.min(row.free, current + this.remaining());
      const next = Math.max(0, Math.min(ceiling, current + by));
      const out = { ...p };
      if (next) out[row.room.id] = next;
      else delete out[row.room.id];
      return out;
    });
  }

  protected canAdd(row: AssignRow): boolean {
    return row.picked < row.free && this.remaining() > 0;
  }

  protected submit(): void {
    const b = this.booking();
    if (!b || !this.complete()) return;
    this.assign.emit({
      bookingId: b.id,
      rooms: this.rows()
        .filter((r) => r.picked > 0)
        .map((r) => ({ roomId: r.room.id, roomNumber: r.room.number, beds: r.picked })),
    });
  }

  protected close(): void {
    this.picks.set({});
    this.lastBookingId = '';
    this.closed.emit();
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
