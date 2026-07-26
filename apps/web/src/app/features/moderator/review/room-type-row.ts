import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { Dropdown, DropdownOption } from '@hostelhive/ui';
import { displayLabelFor } from '@util/room-types';

const BASE_OPTIONS: DropdownOption[] = [
  'Single room', 'Double sharing', 'Triple sharing', 'Quad sharing', 'Dormitory',
].map((t) => ({ value: t, label: displayLabelFor(t) }));

const FIXED_CAPACITY: Record<string, number | null> = {
  'Single room': 1,
  'Double sharing': 2,
  'Triple sharing': 3,
  'Quad sharing': 4,
  'Dormitory': null,
};

const DORMITORY_DEFAULT = 5;
const DORMITORY_MIN = 5;
const DORMITORY_MAX = 200;

@Component({
  selector: 'hh-room-type-row',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Dropdown],
  templateUrl: './room-type-row.html',
})
export class RoomTypeRow {
  readonly name = input('');
  readonly capacity = input(1);
  readonly price = input(0);
  readonly excludeNames = input<string[]>([]);

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
    return FIXED_CAPACITY[this.name()] != null;
  }

  protected isDormitory(): boolean {
    return this.name() === 'Dormitory';
  }

  protected minCapacity(): number {
    return this.isDormitory() ? DORMITORY_MIN : 1;
  }

  protected onNameChange(raw: string): void {
    this.nameChange.emit(raw);
    const fixed = FIXED_CAPACITY[raw];
    if (fixed != null) this.capacityChange.emit(fixed);
    else if (raw === 'Dormitory') this.capacityChange.emit(DORMITORY_DEFAULT);
  }

  protected onCapacityChange(e: Event): void {
    const n = Math.floor(parseFloat((e.target as HTMLInputElement).value));
    const min = this.isDormitory() ? DORMITORY_MIN : 1;
    const max = this.isDormitory() ? DORMITORY_MAX : 9;
    if (Number.isFinite(n)) this.capacityChange.emit(Math.max(min, Math.min(max, n)));
  }

  protected onPriceChange(e: Event): void {
    const n = parseFloat((e.target as HTMLInputElement).value);
    if (Number.isFinite(n) && n >= 0) this.priceChange.emit(n);
  }
}
