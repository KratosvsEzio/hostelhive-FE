import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { Dropdown, DropdownOption } from '@hostelhive/ui';

const OPTIONS: DropdownOption[] = [
  'Single room', 'Double sharing', 'Triple sharing', 'Quad sharing', 'Dormitory',
].map((t) => ({ value: t, label: t }));

const FIXED_CAPACITY: Record<string, number | null> = {
  'Single room': 1,
  'Double sharing': 2,
  'Triple sharing': 3,
  'Quad sharing': 4,
  'Dormitory': null,
};

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

  readonly nameChange = output<string>();
  readonly capacityChange = output<number>();
  readonly priceChange = output<number>();

  protected readonly options = OPTIONS;

  protected capacityFixed(): boolean {
    return FIXED_CAPACITY[this.name()] != null;
  }

  protected onNameChange(raw: string): void {
    this.nameChange.emit(raw);
    const fixed = FIXED_CAPACITY[raw];
    if (fixed != null) this.capacityChange.emit(fixed);
  }

  protected onCapacityChange(e: Event): void {
    const n = Math.floor(parseFloat((e.target as HTMLInputElement).value));
    if (Number.isFinite(n) && n >= 1) this.capacityChange.emit(n);
  }

  protected onPriceChange(e: Event): void {
    const n = parseFloat((e.target as HTMLInputElement).value);
    if (Number.isFinite(n) && n >= 0) this.priceChange.emit(n);
  }
}
