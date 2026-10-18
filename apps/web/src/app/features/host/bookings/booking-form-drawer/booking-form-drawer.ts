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
import { HostelsApi, hostelZone } from '@services';
import { RoomType } from '@hostelhive/data-access';
import { todayIn } from '@util/zoned-time';
import { addDays, calendarDaysBetween } from '@util/plain-day';
import { HostBookingsApi } from '../host-bookings-api';
import { RouterLink } from '@angular/router';
import { LocaleLink } from '@core/i18n/locale-link';
import { isSubscriptionError } from '@util/subscription-error';
import { errorStatus } from '@core/errors/api-error-text';
import { bookingSaveFailureKey } from './booking-save-failure';

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
  /** A translation key, or `''` when the rooms loaded. */
  error: string;
  rooms: PickableRoom[];
}

/** The translation key for a room list that would not load. */
function roomsFailureKey(err: unknown): string {
  return errorStatus(err) === 0 ? 'common.cannotReachTheServer' : 'hostBookings.theRoomsForThisProperty';
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
  imports: [DecimalPipe, RouterLink, LocaleLink, Button, DateRangePicker, Drawer, Dropdown, Input, PhoneInput, Skeleton, TranslocoPipe],
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

  /**
   * The hostel's IANA time zone: `undefined` while it is being read, `null` when there is
   * none (the defaults then use the device's date). One cached request per hostel per session.
   */
  private readonly zone = hostelZone(this.hostelId);

  /** The zone is still being read: the date field is a skeleton and the form cannot be saved. */
  protected readonly datesPending = computed(() => this.zone() === undefined);

  /** Read from the clock once, so the defaults cannot move under a host filling the form in. */
  private readonly openedAt = new Date();

  /**
   * Tonight to tomorrow on the hostel's calendar: the shortest real stay, and the one a
   * walk-in usually wants. The server refuses a check-in before the hostel's today, so a
   * device behind the hostel must not default to its own yesterday.
   */
  protected readonly defaultIn = computed(() => todayIn(this.zone() ?? null, this.openedAt));
  private readonly defaultOut = computed(() => addDays(this.defaultIn(), 1));

  /** The range the host picked, or `undefined` while they have not touched the dates. */
  private readonly userRange = signal<{ from: string | null; to: string | null } | undefined>(undefined);

  // A zone that lands late moves an untouched default; a picked range is never overwritten.
  protected readonly checkIn = computed(() => {
    const range = this.userRange();
    return range ? range.from : this.defaultIn();
  });
  protected readonly checkOut = computed(() => {
    const range = this.userRange();
    return range ? range.to : this.defaultOut();
  });

  /**
   * Both ends move together, because a stay is one thing.
   *
   * Two separate pickers let a host set a check-out before the check-in and then told
   * them off for it; a range picker cannot express that state in the first place, which
   * is the better way to prevent it.
   */
  protected onRangePicked(range: DateRange): void {
    this.userRange.set({ from: range.from, to: range.to });
  }

  /** How many units of each room, keyed by room id. Absent means none. */
  private readonly picked = signal<Record<string, number>>({});

  protected readonly saving = signal(false);
  /** A translation key, or `''` while there is nothing to report. */
  protected readonly saveError = signal('');
  /**
   * The hostel's subscription has lapsed: the server refuses new bookings (400) while the ones
   * already made still work (Trello #81). Said as a renewal, with the way to renew, not as the
   * raw refusal.
   */
  protected readonly needsSubscription = signal(false);
  protected readonly subscriptionLink = computed(() => `/host/${this.hostelId()}/subscription`);

  /**
   * The hostel's room types, from its detail.
   *
   * Loaded once per hostel rather than per date change: nothing here depends on the dates.
   * The server keeps no availability for a booking before check-in either, so none is shown;
   * capacity is checked when the guests are placed.
   */
  protected readonly state = toSignal(
    toObservable(this.hostelId).pipe(
      switchMap((hostelId) => {
        if (!hostelId) return of<RoomsState>({ loading: false, error: '', rooms: [] });
        return this.hostels.getById(hostelId).pipe(
          map(
            (h): RoomsState => ({
              loading: false,
              error: '',
              // A type the host switched off is refused by the server ("… is not available
              // for booking"), so it is not offered — the same rule the guest picker follows.
              rooms: (h.room_types ?? [])
                .filter((rt) => (rt as RoomType & { is_bookable?: boolean | null }).is_bookable !== false)
                .map((rt) => this.toPickable(rt)),
            }),
          ),
          startWith<RoomsState>({ loading: true, error: '', rooms: [] }),
          catchError((err: unknown) =>
            of<RoomsState>({ loading: false, error: roomsFailureKey(err), rooms: [] }),
          ),
        );
      }),
    ),
    { initialValue: { loading: true, error: '', rooms: [] } as RoomsState },
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
    return calendarDaysBetween(from, to) || 0;
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
      !this.datesPending() &&
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
    const guests = this.lineGuests();
    this.saving.set(true);
    this.saveError.set('');
    this.needsSubscription.set(false);
    this.bookings
      .create(this.hostelId(), {
        // Plain days: the server reads them in the hostel's zone (Trello #81).
        checkIn: this.checkIn() as string,
        checkOut: this.checkOut() as string,
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
        error: (err: unknown) => {
          this.saving.set(false);
          if (isSubscriptionError(err)) {
            this.needsSubscription.set(true);
            return;
          }
          this.saveError.set(bookingSaveFailureKey(err));
        },
      });
  }
}
