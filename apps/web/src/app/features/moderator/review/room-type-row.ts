import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { Dropdown, DropdownOption } from '@hostelhive/ui';
import {
  DORMITORY_DEFAULT_CAPACITY,
  MIN_ROOM_CAPACITY,
  ROOM_TYPES,
  displayLabelFor,
  fixedCapacityFor,
} from '@util/room-types';
import { DEFAULT_CURRENCY_CODE } from '@util/currencies';
import { MoneyInput } from '@app/shared/money-input/money-input';

// Sourced from @util/room-types rather than redeclared. The local copies had already
// drifted — this file capped a dormitory at 200 while the shared table caps every room
// at 9 — and a third copy lives in the hostel form. One table, one place.
const BASE_OPTIONS: DropdownOption[] = ROOM_TYPES.map((t) => ({
  value: t,
  label: displayLabelFor(t),
}));

/** A dormitory starts at the floor of the “5+” bucket and stays editable above it. */

@Component({
  selector: 'hh-room-type-row',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Dropdown, MoneyInput],
  templateUrl: './room-type-row.html',
})
export class RoomTypeRow {
  readonly name = input('');
  readonly capacity = input(1);
  readonly price = input(0);
  readonly excludeNames = input<string[]>([]);
  /** ISO-4217 code shown as the price prefix. Defaults to PKR for callers (moderator
   *  review) that don't yet thread a per-hostel currency through. */
  readonly currency = input(DEFAULT_CURRENCY_CODE);

  readonly nameChange = output<string>();
  readonly capacityChange = output<number>();
  readonly priceChange = output<number>();

  protected readonly options = computed<DropdownOption[]>(() => {
    const exclude = new Set(this.excludeNames());
    return BASE_OPTIONS.map((o) =>
      exclude.has(o.value) ? { ...o, disabled: true } : o,
    );
  });

  protected capacityFixed(): boolean {
    return fixedCapacityFor(this.name()) != null;
  }

  protected isDormitory(): boolean {
    return this.name() === 'Dormitory';
  }

  protected minCapacity(): number {
    return MIN_ROOM_CAPACITY;
  }

  protected onNameChange(raw: string): void {
    this.nameChange.emit(raw);
    const fixed = fixedCapacityFor(raw);
    if (fixed != null) this.capacityChange.emit(fixed);
    else if (raw === 'Dormitory') this.capacityChange.emit(DORMITORY_DEFAULT_CAPACITY);
  }

  protected onCapacityChange(e: Event): void {
    const n = Math.floor(parseFloat((e.target as HTMLInputElement).value));
    if (Number.isFinite(n) && n >= MIN_ROOM_CAPACITY) this.capacityChange.emit(n);
  }

  protected onPriceChange(n: number): void {
    // Matches the hostel form’s rule (“Enter a price greater than 0”). This row accepted
    // 0, so the same edit was valid here and rejected there.
    if (Number.isFinite(n) && n > 0) this.priceChange.emit(n);
  }
}
