import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Button, DatePicker, Dropdown, DropdownOption, Input } from '@hostelhive/ui';
import { format } from 'date-fns';
import { DashboardLayout } from '@layout/dashboard-layout/dashboard-layout';
import { MessService } from './mess.service';

interface DraftItem {
  id: string;
  name: string;
  unit: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
}

interface DraftImage {
  id: string;
  dataUrl: string;
  name: string;
}

const UNIT_OPTIONS: DropdownOption[] = [
  { value: 'kg', label: 'kg' },
  { value: 'g', label: 'g' },
  { value: 'L', label: 'L' },
  { value: 'mL', label: 'mL' },
  { value: 'pcs', label: 'pcs' },
  { value: 'dozen', label: 'dozen' },
  { value: 'pack', label: 'pack' },
  { value: 'bag', label: 'bag' },
  { value: 'box', label: 'box' },
  { value: 'bundle', label: 'bundle' },
];

const todayIso = (): string => format(new Date(), 'yyyy-MM-dd');

@Component({
  selector: 'hh-add-grocery',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DecimalPipe, RouterLink, DashboardLayout, Button, Dropdown, Input, DatePicker],
  templateUrl: './add-grocery.html',
})
export class AddGrocery {
  private readonly svc = inject(MessService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  protected readonly unitOptions = UNIT_OPTIONS;
  protected readonly todayIso = todayIso();

  protected readonly mode = signal<'items' | 'bill'>(
    this.route.snapshot.queryParamMap.get('mode') === 'items' ? 'items' : 'bill',
  );
  protected readonly date = signal<string | null>(this.todayIso);
  protected readonly items = signal<DraftItem[]>([]);
  protected readonly images = signal<DraftImage[]>([]);

  // ── inline add-item form ─────────────────────────────────────────────
  protected readonly addName = signal('');
  protected readonly addUnit = signal('kg');
  protected readonly addQty = signal('');
  protected readonly addPrice = signal('');
  protected readonly addTouched = signal(false);

  // ── bill mode ────────────────────────────────────────────────────────
  protected readonly billTotal = signal('');
  protected readonly billTotalTouched = signal(false);

  protected readonly billTotalValue = computed(() => {
    const v = parseFloat(this.billTotal());
    return v > 0 ? v : 0;
  });

  protected readonly billTotalError = computed(() =>
    this.billTotalTouched() && !(parseFloat(this.billTotal()) > 0)
      ? 'Enter the total amount from the bill'
      : '',
  );

  protected readonly addTotal = computed(() => {
    const qty = parseFloat(this.addQty());
    const price = parseFloat(this.addPrice());
    return qty > 0 && price >= 0 ? qty * price : 0;
  });

  protected readonly itemCount = computed(() => this.items().length);
  protected readonly totalSum = computed(() =>
    this.items().reduce((s, it) => s + it.totalPrice, 0),
  );

  protected readonly totalForDisplay = computed(() =>
    this.mode() === 'items' ? this.totalSum() : this.billTotalValue(),
  );

  protected readonly canSave = computed(() => {
    if (!this.date()) return false;
    if (this.mode() === 'bill') return this.billTotalValue() > 0;
    return this.items().length > 0;
  });

  protected readonly addNameError = computed(() =>
    this.addTouched() && !this.addName().trim() ? 'Required' : '',
  );
  protected readonly addQtyError = computed(() =>
    this.addTouched() && !(parseFloat(this.addQty()) > 0) ? 'Required' : '',
  );
  protected readonly addPriceError = computed(() =>
    this.addTouched() && !(parseFloat(this.addPrice()) >= 0) ? 'Required' : '',
  );

  protected setMode(m: 'items' | 'bill'): void {
    this.mode.set(m);
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { mode: m },
      replaceUrl: true,
    });
  }

  protected onUnitChange(v: string | string[] | null): void {
    if (typeof v === 'string') this.addUnit.set(v);
  }

  protected addItem(): void {
    this.addTouched.set(true);
    const name = this.addName().trim();
    const qty = parseFloat(this.addQty());
    const price = parseFloat(this.addPrice());
    if (!name || !(qty > 0) || !(price >= 0)) return;

    this.items.update((list) => [
      ...list,
      {
        id: `${Date.now()}-${Math.random()}`,
        name,
        unit: this.addUnit(),
        quantity: qty,
        unitPrice: price,
        totalPrice: qty * price,
      },
    ]);

    this.addName.set('');
    this.addQty.set('');
    this.addPrice.set('');
    this.addTouched.set(false);
  }

  protected removeItem(id: string): void {
    this.items.update((list) => list.filter((it) => it.id !== id));
  }

  protected onFilesSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (!input.files?.length) return;
    Array.from(input.files).forEach((file) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const dataUrl = e.target?.result as string;
        this.images.update((list) => [
          ...list,
          { id: `${Date.now()}-${Math.random()}`, dataUrl, name: file.name },
        ]);
      };
      reader.readAsDataURL(file);
    });
    input.value = '';
  }

  protected removeImage(id: string): void {
    this.images.update((list) => list.filter((img) => img.id !== id));
  }

  protected save(): void {
    const iso = this.date();
    if (!iso) return;
    if (this.mode() === 'bill') {
      this.billTotalTouched.set(true);
      if (!(this.billTotalValue() > 0)) return;
    }
    if (!this.canSave()) return;

    const [y, mo, d] = iso.split('-').map(Number);
    const date = new Date(y, mo - 1, d);
    const imgs = this.images().map((img) => img.dataUrl);

    if (this.mode() === 'items') {
      this.svc.addEntry({
        date,
        items: this.items().map(({ name, unit, quantity, unitPrice }) => ({
          name, unit, quantity, unitPrice,
        })),
        images: imgs.length ? imgs : undefined,
      });
    } else {
      this.svc.addEntry({
        date,
        items: [],
        totalOverride: this.billTotalValue(),
        images: imgs.length ? imgs : undefined,
      });
    }
    void this.router.navigate(['..'], { relativeTo: this.route });
  }
}
