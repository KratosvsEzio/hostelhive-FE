import { Injectable, signal } from '@angular/core';
import { UtilityBill } from '@hostelhive/data-access';

@Injectable({ providedIn: 'root' })
export class UtilityBatchState {
  readonly local = signal<UtilityBill[] | null>(null);

  add(bill: UtilityBill): void {
    this.local.update((b) => [...(b ?? []), bill]);
  }

  remove(id: string): void {
    this.local.update((b) => (b ?? []).filter((x) => x.id !== id));
  }

  issue(): void {
    this.local.set([]);
  }

  invalidate(): void {
    this.local.set(null);
  }
}
