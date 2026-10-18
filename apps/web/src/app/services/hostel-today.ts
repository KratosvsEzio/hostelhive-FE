import { Signal, computed, effect, inject, untracked } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { distinctUntilChanged, of, startWith, switchMap } from 'rxjs';
import { todayIn } from '@util/zoned-time';
import { HostPropertyStore } from './host-property-store';

/**
 * A console screen's "today" is the hostel's date, not the device's (decision "the console's
 * today is the hostel's date"). These read it in a field initialiser, so each screen doesn't
 * rebuild the zone lookup. All of them need an injection context.
 */

/**
 * A hostel's IANA time zone: `undefined` while it is being read, `null` when there is no
 * hostel, it has no zone, or the read failed (the caller then uses the device's date — see
 * `todayIn`). One cached request per hostel per session, through
 * {@link HostPropertyStore.timeZoneOf}.
 */
export function hostelZone(hostelId: Signal<string | null | undefined>): Signal<string | null | undefined> {
  const store = inject(HostPropertyStore);
  return toSignal(
    toObservable(hostelId).pipe(
      distinctUntilChanged(),
      switchMap((id) =>
        id
          ? store.timeZoneOf(id).pipe(startWith<string | null | undefined>(undefined))
          : of(null),
      ),
    ),
    { initialValue: undefined },
  );
}

/** {@link hostelZone} for the hostel selected in the console. */
export function selectedHostelZone(): Signal<string | null | undefined> {
  return hostelZone(inject(HostPropertyStore).selected);
}

/**
 * The hostel's date as `yyyy-MM-dd`, with the clock read once at `openedAt`.
 *
 * The device's date until the zone has been read, then the hostel's. A screen left open past
 * hostel midnight keeps the day it opened on; a reload moves it. Pass the zone signal when the
 * screen already holds one; the default is the selected hostel's.
 */
export function selectedHostelToday(
  openedAt: Date = new Date(),
  zone: Signal<string | null | undefined> = selectedHostelZone(),
): Signal<string> {
  return computed(() => todayIn(zone(), openedAt));
}

/**
 * Calls `onMove(from, to)` each time `today` changes — in practice once, when the hostel's
 * zone lands after the form was seeded from the device's date.
 *
 * For a form default the host may already have edited: the callback moves the field only when
 * it still holds the default counted from `from`, so a date the host picked is never
 * overwritten.
 */
export function followToday(today: Signal<string>, onMove: (from: string, to: string) => void): void {
  let last = untracked(today);
  effect(() => {
    const next = today();
    if (next === last) return;
    const from = last;
    last = next;
    untracked(() => onMove(from, next));
  });
}
