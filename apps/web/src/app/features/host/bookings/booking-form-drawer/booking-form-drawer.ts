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
import { BookingApi } from '@features/public/listing/booking/booking-api';
import { ALL_ROOMS_LIMIT, HostOpsApi } from '@services';
import { HostRoom } from '@hostelhive/data-access';

/**
 * A room as this form needs it: what it is called, what it costs, how much is free.
 *
 * Its own shape rather than the booking contract's `ApiRoomOffer`, because that type
 * promises something this data cannot deliver — `available` there means units free
 * across a date range, and the endpoint behind this one reports only what is occupied
 * right now. Borrowing the name would have made the difference invisible.
 */
interface PickableRoom {
  id: string;
  title: string;
  kind: 'private' | 'shared';
  /** Sleeping places in the room. */
  capacity: number;
  /** Per unit, per night. */
  price: number;
  /** Beds nobody is currently in. Not date-aware — see {@link BookingFormDrawer.state}. */
  available: number;
}

interface RoomsState {
  loading: boolean;
  error: string;
  rooms: PickableRoom[];
}

/** Local midnight as `yyyy-mm-dd`, which is what the API takes. */
function isoDay(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * The booking a host writes down for someone standing at the desk.
 *
 * A walk-in has already happened by the time it is recorded, so this form takes no payment
 * and holds nothing — it lands as `unconfirmed`, which is the honest description of a stay
 * agreed in person and not yet paid for.
 *
 * Availability is still shown and still enforced. The temptation with a host-facing form is
 * to trust the person using it, but a host is exactly as capable of double-booking a bed as
 * a guest is, and the guest is the one who finds out about it at check-in.
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

  private readonly api = inject(BookingApi);
  private readonly hostOps = inject(HostOpsApi);
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

  private readonly range = computed(() => ({
    hostelId: this.hostelId(),
    from: this.checkIn(),
    to: this.checkOut(),
  }));

  /**
   * The host's own rooms, from the endpoint the rooms page already lists from.
   *
   * **`available` here is beds nobody is in right now, not beds free for these dates.**
   * The endpoint reports occupancy as a snapshot, and the one that would answer the real
   * question — units free across a check-in/check-out range — does not exist yet; it is
   * described by `ApiRoomOffer` in the booking contract. Until it lands, a bed let go
   * halfway through the stay still counts as free here, so this form narrows the chance
   * of a double booking rather than removing it.
   *
   * Re-asked whenever the dates move regardless, so it is already in the right shape when
   * the answer does start depending on them.
   */
  protected readonly state = toSignal(
    toObservable(this.range).pipe(
      switchMap((r) => {
        if (!r.hostelId || !r.from || !r.to || r.to <= r.from) {
          return of<RoomsState>({ loading: false, error: '', rooms: [] });
        }
        // Every room in one page; the picker searches rather than paginates.
        return this.hostOps.rooms(r.hostelId, 1, ALL_ROOMS_LIMIT).pipe(
          map(
            (res): RoomsState => ({
              loading: false,
              error: '',
              rooms: res.rooms.map((room) => this.toPickable(room)),
            }),
          ),
          startWith<RoomsState>({ loading: true, error: '', rooms: [] }),
          catchError((e: Error) =>
            of<RoomsState>({ loading: false, error: e.message, rooms: [] }),
          ),
        );
      }),
    ),
    { initialValue: { loading: true, error: '', rooms: [] } as RoomsState },
  );

  /**
   * A host room in the terms this form deals in.
   *
   * `kind` is read out of the free-text `type` because that is all the payload carries —
   * anything not saying "private" is treated as shared, which is the safe way round: a
   * shared room is sold by the bed, so a private room mislabelled shared undersells by
   * one, while the reverse would sell a whole room to someone booking a single bed.
   */
  private toPickable(room: HostRoom): PickableRoom {
    return {
      id: room.id,
      title: this.i18n.translate<string>('common.roomNumber', { number: room.number }),
      kind: /private/i.test(room.type) ? 'private' : 'shared',
      capacity: room.capacity,
      price: room.rentPerBed,
      available: Math.max(0, room.capacity - room.occupied),
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
          r.kind === 'private' ? 'whole room' : 'per bed'
        }`,
        suffixBadge: r.available > 0 ? `${r.available} free` : 'Full',
        disabled: r.available === 0,
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
        if (!room || room.available <= 0) continue;
        out[id] = Math.min(all[id] || 1, room.available);
      }
      return out;
    });
  }

  protected qty(roomId: string): number {
    return this.picked()[roomId] ?? 0;
  }

  /** Clamped to what is actually free, so the stepper cannot express an oversell. */
  protected setQty(room: PickableRoom, raw: string | number): void {
    const n = Math.floor(Number(raw));
    const safe = Number.isFinite(n) ? Math.min(Math.max(0, n), room.available) : 0;
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

  private readonly discountRaw = signal(0);

  /**
   * What the host knocks off, capped at the stay itself.
   *
   * Capped rather than rejected: a host typing an extra zero wants the booking free, not
   * an error, and a negative total is not a thing a desk can collect. The cap moves with
   * the rooms, so removing one cannot leave a discount stranded above the new total.
   */
  protected readonly discount = computed(() =>
    Math.min(Math.max(0, this.discountRaw()), this.subtotal()),
  );

  protected setDiscount(raw: string | number): void {
    const n = Math.floor(Number(raw));
    this.discountRaw.set(Number.isFinite(n) && n > 0 ? n : 0);
  }

  /** What the host will charge at the desk. Not a deposit — nothing is taken here. */
  protected readonly total = computed(() => this.subtotal() - this.discount());

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

  protected readonly canSave = computed(
    () =>
      !!this.guestName().trim() &&
      this.datesValid() &&
      this.lines().length > 0 &&
      !this.saving(),
  );

  protected save(): void {
    if (!this.canSave()) return;
    this.saving.set(true);
    this.saveError.set('');
    this.api
      .hostCreateBooking(this.hostelId(), {
        check_in: this.checkIn() as string,
        check_out: this.checkOut() as string,
        guests: Math.max(1, this.guests()),
        discount: this.discount() || undefined,
        lines: this.lines().map((l) => ({ room_id: l.room.id, quantity: l.quantity })),
        guest: {
          name: this.guestName().trim(),
          phone: this.guestPhone().trim() || null,
          email: this.guestEmail().trim() || null,
        },
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
