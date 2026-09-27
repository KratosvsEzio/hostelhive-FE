import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { DatePipe } from '@angular/common';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { catchError, of, startWith, switchMap } from 'rxjs';
import { Button, Skeleton } from '@hostelhive/ui';
import { ALL_ROOMS_LIMIT, HostOpsApi } from '@services';
import { HostRoom } from '@util/models/host-ops';
import { HostBooking } from './host-bookings-api';

export interface AssignRow {
  room: HostRoom;
  /** Beds not already taken. Zero means the row is shown but cannot take anyone. */
  free: number;
  /** Guests placed here. */
  placed: number;
}

export interface AssignGroup {
  type: string;
  /** A type the guest booked — listed first, since that is where they expect to sleep. */
  booked: boolean;
  rows: AssignRow[];
}

/** One allocation per room — what `mark_as_checked_in` takes. */
export interface AssignSelection {
  bookingId: string;
  rooms: { roomId: string; roomNumber: string; guests: number }[];
}

interface RoomsState {
  loading: boolean;
  error: boolean;
  rooms: HostRoom[];
}

/**
 * Checking a booking in: placing its guests in rooms.
 *
 * The lifecycle (Trello #80) assigns rooms at check-in, not before, and the host "may put
 * guests in any room type" — so every room on the property is offered, the types the guest
 * booked first, each with a stepper for how many of the party sleep there. One room or
 * several: a party of four can be two in 101, one in 102 and one in a dorm.
 *
 * Capped at each room's free beds, and at the booking's headcount — placing more people than
 * booked is a new booking, not a check-in. Placing fewer is allowed (somebody did not come),
 * and the server then records the headcount as what was placed; the footer says so.
 */
@Component({
  selector: 'hh-assign-rooms-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, Button, Skeleton],
  templateUrl: './assign-rooms-panel.html',
})
export class AssignRoomsPanel {
  readonly hostelId = input('');
  /** The booking being checked in. `null` closes the panel. */
  readonly booking = input<HostBooking | null>(null);
  /** The server's refusal, shown in the footer — "Room 101 has only 1 bed(s) available". */
  readonly submitError = input('');
  /** The check-in is being sent; the button waits for it. */
  readonly busy = input(false);

  readonly closed = output<void>();
  readonly assign = output<AssignSelection>();

  private readonly api = inject(HostOpsApi);

  private readonly rooms = toSignal(
    toObservable(computed(() => (this.booking() ? this.hostelId() : ''))).pipe(
      switchMap((hostelId) =>
        !hostelId
          ? of<RoomsState>({ loading: false, error: false, rooms: [] })
          : // Every room in one page: a second page would silently hide the room the host wants.
            this.api.rooms(hostelId, 1, ALL_ROOMS_LIMIT).pipe(
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

  /** The party to place: the booking's headcount. */
  protected readonly needed = computed(() => Math.max(1, this.booking()?.guests ?? 1));

  /** The room types the guest booked, by name — the rooms list carries names, not type ids. */
  private readonly bookedTypes = computed(() => {
    const b = this.booking();
    if (!b) return new Set<string>();
    return new Set(b.lines.length ? b.lines.map((l) => l.name) : [b.roomType.name]);
  });

  /** Guests placed per room id. Cleared whenever the panel opens on another booking. */
  private readonly placed = signal<Record<string, number>>({});
  private lastBookingId = '';

  protected readonly groups = computed<AssignGroup[]>(() => {
    const b = this.booking();
    if (!b) return [];
    if (b.id !== this.lastBookingId) {
      this.lastBookingId = b.id;
      queueMicrotask(() => this.placed.set({}));
    }
    const placed = this.placed();
    const booked = this.bookedTypes();
    const byType = new Map<string, AssignRow[]>();
    for (const room of this.rooms().rooms) {
      const rows = byType.get(room.type) ?? [];
      rows.push({ room, free: Math.max(0, room.capacity - room.occupied), placed: placed[room.id] ?? 0 });
      byType.set(room.type, rows);
    }
    return [...byType.entries()]
      .map(([type, rows]) => ({
        type,
        booked: booked.has(type),
        rows: rows.sort((a, x) => x.free - a.free || a.room.number.localeCompare(x.room.number)),
      }))
      .sort((a, x) => Number(x.booked) - Number(a.booked) || a.type.localeCompare(x.type));
  });

  protected readonly allocated = computed(() =>
    this.groups().reduce((n, g) => n + g.rows.reduce((m, r) => m + r.placed, 0), 0),
  );
  protected readonly remaining = computed(() => Math.max(0, this.needed() - this.allocated()));
  protected readonly complete = computed(() => this.allocated() === this.needed());
  /** Some placed, not all: allowed, and the footer says the headcount will change. */
  protected readonly partial = computed(() => this.allocated() > 0 && !this.complete());

  /** "101 × 2 · 102 × 1", the sentence the footer confirms with. */
  protected readonly summaryLine = computed(() =>
    this.groups()
      .flatMap((g) => g.rows)
      .filter((r) => r.placed > 0)
      .map((r) => `${r.room.number} × ${r.placed}`)
      .join(' · '),
  );

  protected step(row: AssignRow, by: number): void {
    this.placed.update((p) => {
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
    return row.placed < row.free && this.remaining() > 0;
  }

  protected submit(): void {
    const b = this.booking();
    if (!b || !this.allocated() || this.busy()) return;
    this.assign.emit({
      bookingId: b.id,
      rooms: this.groups()
        .flatMap((g) => g.rows)
        .filter((r) => r.placed > 0)
        .map((r) => ({ roomId: r.room.id, roomNumber: r.room.number, guests: r.placed })),
    });
  }

  protected close(): void {
    if (this.busy()) return;
    this.placed.set({});
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
