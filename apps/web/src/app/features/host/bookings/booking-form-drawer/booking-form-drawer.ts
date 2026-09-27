import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { catchError, map, of, startWith, switchMap } from 'rxjs';
import {
  Button,
  DateRange,
  DateRangePicker,
  Drawer,
  Dropdown,
  DropdownOption,
  Input,
  PhoneInput,
  Skeleton,
} from '@hostelhive/ui';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { LocaleStore } from '@core/i18n/locale-store';
import { HostelsApi } from '@services';
import { RoomType } from '@hostelhive/data-access';
import { countryTimeZone } from '@core/geo/country-time-zones';
import { localDateAtWallTime } from '@util/zoned-time';
import { CHECK_IN_HOUR, CHECK_OUT_HOUR } from '@features/public/listing/booking/booking-request';
import { HostBookingsApi } from '../host-bookings-api';

/**
 * A room type as this form needs it: what it is called, how it is sold, what it costs.
 *
 * Room types, not rooms. The lifecycle (Trello #80) books types and places guests in rooms
 * at check-in — a walk-in is written down the same way a guest's own booking is, and the
 * room is chosen when they are checked in.
 */
interface PickableRoom {
  /** The room type id the booking's line carries. */
  id: string;
  title: string;
  kind: 'private' | 'shared';
  /** Sleeping places in one room of this type. */
  capacity: number;
  /** Per unit, per night — the rate the server will record: discounted when it applies. */
  price: number;
}

interface RoomsState {
  loading: boolean;
  error: string;
  rooms: PickableRoom[];
  /** The hostel's IANA zone, from its country — what 'check-in at 14:00' is measured in. */
  zone: string;
}

/** Local midnight as `yyyy-mm-dd`, which is what the API takes. */
function isoDay(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * The booking a host writes down for someone standing at the desk.
 *
 * A walk-in has already happened by the time it is recorded, so this form takes no payment
 * and holds nothing. It lands as pending, like any other booking, and moves through the same
 * lifecycle: confirmed, then checked in — which is where rooms are chosen and bed capacity is
 * enforced, since the server keeps no availability for a booking before that.
 */
@Component({
  selector: 'hh-booking-form-drawer',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DecimalPipe, Button, DateRangePicker, Drawer, Dropdown, Input, PhoneInput, Skeleton, TranslocoPipe],
  templateUrl: './booking-form-drawer.html',
})
export class BookingFormDrawer {
  readonly hostelId = input.required<string>();

  readonly closed = output<void>();
  readonly saved = output<void>();

  private readonly bookings = inject(HostBookingsApi);
  private readonly hostels = inject(HostelsApi);
  private readonly i18n = inject(TranslocoService);
  private readonly locale = inject(LocaleStore);

  protected readonly guestName = signal('');
  protected readonly guestPhone = signal('');
  protected readonly guestEmail = signal('');
  protected readonly guests = signal(1);

  /** Tonight to tomorrow: the shortest real stay, and the one a walk-in usually wants. */
  protected readonly checkIn = signal<string | null>(isoDay(new Date()));
  protected readonly checkOut = signal<string | null>(
    isoDay(new Date(Date.now() + 24 * 60 * 60 * 1000)),
  );

  /**
   * Both ends move together, because a stay is one thing.
   *
   * Two separate pickers let a host set a check-out before the check-in and then told
   * them off for it; a range picker cannot express that state in the first place, which
   * is the better way to prevent it.
   */
  protected onRangePicked(range: DateRange): void {
    this.checkIn.set(range.from);
    this.checkOut.set(range.to);
  }

  /** How many units of each room, keyed by room id. Absent means none. */
  private readonly picked = signal<Record<string, number>>({});

  protected readonly saving = signal(false);
  protected readonly saveError = signal('');

  /**
   * The hostel's room types and its country, from the one detail call that carries both.
   *
   * Loaded once per hostel rather than per date change: nothing here depends on the dates.
   * The server keeps no availability for a booking before check-in either, so none is shown;
   * capacity is checked when the guests are placed.
   */
  protected readonly state = toSignal(
    toObservable(this.hostelId).pipe(
      switchMap((hostelId) => {
        if (!hostelId) return of<RoomsState>({ loading: false, error: '', rooms: [], zone: countryTimeZone(null) });
        return this.hostels.getById(hostelId).pipe(
          map(
            (h): RoomsState => ({
              loading: false,
              error: '',
              rooms: (h.room_types ?? []).map((rt) => this.toPickable(rt)),
              zone: countryTimeZone(h.country),
            }),
          ),
          startWith<RoomsState>({ loading: true, error: '', rooms: [], zone: countryTimeZone(null) }),
          catchError((e: Error) =>
            of<RoomsState>({ loading: false, error: e.message, rooms: [], zone: countryTimeZone(null) }),
          ),
        );
      }),
    ),
    { initialValue: { loading: true, error: '', rooms: [], zone: countryTimeZone(null) } as RoomsState },
  );

  /**
   * A room type in the terms this form deals in. Priced at the rate the server records —
   * the discounted one when the type is discountable — so the total here is the total there.
   */
  private toPickable(rt: RoomType): PickableRoom {
    const wire = rt as RoomType & { discounted_price?: number | string | null; is_discountable?: boolean | null };
    const list = Number(rt.price) || 0;
    const discounted = Number(wire.discounted_price) || 0;
    return {
      id: String(rt.id),
      title: rt.name,
      kind: rt.occupancy_type === 'private_room' ? 'private' : 'shared',
      capacity: Number(rt.capacity) || 1,
      price: wire.is_discountable && discounted > 0 ? discounted : list,
    };
  }

  protected readonly nights = computed(() => {
    const from = this.checkIn();
    const to = this.checkOut();
    if (!from || !to || to <= from) return 0;
    return Math.round(
      (new Date(to).getTime() - new Date(from).getTime()) / (24 * 60 * 60 * 1000),
    );
  });

  /** What the host has typed into the picker. Filtering is local — the list is small. */
  protected readonly roomQuery = signal('');

  /**
   * The rooms, as the picker shows them: name, what it costs, how much is left.
   *
   * Sorted so the two kinds are contiguous, because the dropdown starts a new group
   * header wherever the group *changes* — interleaved rooms would print "Private room"
   * and "Shared room" over and over down the list.
   *
   * A room with nothing free stays in the list rather than being filtered out. Its
   * absence would read as "there is no such room", which is a different and more
   * alarming thing than "that one is taken this week".
   */
  protected readonly roomOptions = computed<DropdownOption[]>(() => {
    // Read as a gate, not only as a dependency: `ready()` already made this recompute when the
    // language file lands, but translating *before* it lands logs "Missing translation" for two
    // keys that every locale file has. The blank is replaced the moment this runs again.
    const ready = this.locale.ready();
    const lang = this.locale.active();
    const shared = ready ? this.i18n.translate<string>('search.sharedRoom') : '';
    const priv = ready ? this.i18n.translate<string>('search.privateRoom') : '';
    const q = this.roomQuery().trim().toLowerCase();

    return this.state()
      .rooms.filter((r) => !q || r.title.toLowerCase().includes(q))
      .slice()
      .sort((a, b) => Number(a.kind === 'shared') - Number(b.kind === 'shared'))
      .map((r) => ({
        value: r.id,
        label: r.title,
        group: r.kind === 'private' ? priv : shared,
        // Whole rupees, matching the rows below and the total. A price carrying two
        // decimals in one place and none in another reads as two different prices.
        subtitle: `Rs ${Math.round(r.price).toLocaleString(lang)} · ${
          r.kind === 'private' ? `whole room · sleeps ${r.capacity}` : 'per bed'
        }`,
      }));
  });

  /** The picker reflects what has been chosen; the counts live in `picked`. */
  protected readonly pickedIds = computed(() => Object.keys(this.picked()));

  /**
   * Choosing a room takes one unit of it, and un-choosing gives it all back.
   *
   * One is the useful default — most walk-ins are one bed — and the row that appears
   * underneath is where a bigger number is entered. A count already set survives being
   * re-emitted, so opening the picker and closing it does not quietly reset the basket.
   */
  protected onRoomsPicked(ids: string | string[] | null): void {
    const next = Array.isArray(ids) ? ids : ids ? [ids] : [];
    const rooms = this.state().rooms;
    this.picked.update((all) => {
      const out: Record<string, number> = {};
      for (const id of next) {
        const room = rooms.find((r) => r.id === id);
        if (!room) continue;
        out[id] = all[id] || 1;
      }
      return out;
    });
  }

  protected qty(roomId: string): number {
    return this.picked()[roomId] ?? 0;
  }

  /** Whole units, at least none. Beds are checked against rooms when the guests are placed. */
  protected setQty(room: PickableRoom, raw: string | number): void {
    const n = Math.floor(Number(raw));
    const safe = Number.isFinite(n) ? Math.max(0, n) : 0;
    this.picked.update((all) => {
      const next = { ...all };
      if (safe > 0) next[room.id] = safe;
      else delete next[room.id];
      return next;
    });
  }

  protected readonly lines = computed(() => {
    const picked = this.picked();
    return this.state()
      .rooms.filter((r) => picked[r.id] > 0)
      .map((r) => ({ room: r, quantity: picked[r.id] }));
  });

  /** Rent for everything picked, across the whole stay, before anything comes off. */
  protected readonly subtotal = computed(() =>
    this.lines().reduce((n, l) => n + l.room.price * l.quantity * this.nights(), 0),
  );

  /** What the host will collect at the desk: the rent. Nothing is taken here. */
  protected readonly total = computed(() => this.subtotal());

  /**
   * Beds and rooms a guest can actually sleep in, against the headcount entered.
   *
   * Surfaced rather than enforced: a family of three in a private double is the host's call to
   * make, and a form that refused it would just be wrong more often than they are.
   */
  protected readonly capacity = computed(() =>
    this.lines().reduce(
      (n, l) => n + (l.room.kind === 'private' ? l.room.capacity : 1) * l.quantity,
      0,
    ),
  );

  protected readonly datesValid = computed(() => this.nights() > 0);

  /** The server refuses a booking without a phone number, so the form asks for one. */
  protected readonly phoneMissing = computed(() => !this.guestPhone().trim());

  protected readonly canSave = computed(
    () =>
      !!this.guestName().trim() &&
      !this.phoneMissing() &&
      this.datesValid() &&
      this.lines().length > 0 &&
      !this.saving(),
  );

  /**
   * Who sleeps on each line, which the endpoint wants per line.
   *
   * A shared line is one bed per person, so its guests are its beds. The rest of the party
   * goes to the private lines in order, each taking up to what its rooms sleep and at least
   * one — a room booked for nobody is refused.
   */
  protected readonly lineGuests = computed(() => {
    const lines = this.lines();
    let left = Math.max(1, this.guests()) - lines.filter((l) => l.room.kind === 'shared').reduce((n, l) => n + l.quantity, 0);
    return lines.map((l) => {
      if (l.room.kind === 'shared') return l.quantity;
      const g = Math.max(1, Math.min(l.room.capacity * l.quantity, left));
      left -= g;
      return g;
    });
  });

  protected save(): void {
    if (!this.canSave()) return;
    const from = this.checkIn() as string;
    const to = this.checkOut() as string;
    const zone = this.state().zone;
    const at = (day: string, hour: number) => {
      const [y, m, d] = day.split('-').map(Number);
      return localDateAtWallTime(new Date(y, m - 1, d), hour, 0, zone).toISOString();
    };
    const guests = this.lineGuests();
    this.saving.set(true);
    this.saveError.set('');
    this.bookings
      .create(this.hostelId(), {
        checkInAt: at(from, CHECK_IN_HOUR),
        checkOutAt: at(to, CHECK_OUT_HOUR),
        guestName: this.guestName(),
        guestPhone: this.guestPhone(),
        guestEmail: this.guestEmail(),
        lines: this.lines().map((l, i) => ({
          roomTypeId: l.room.id,
          shared: l.room.kind === 'shared',
          quantity: l.quantity,
          guests: guests[i],
        })),
      })
      .subscribe({
        next: () => {
          this.saving.set(false);
          this.saved.emit();
        },
        error: (e: Error) => {
          this.saving.set(false);
          this.saveError.set(e.message || 'Could not save that booking.');
        },
      });
  }
}
