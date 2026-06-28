import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Button, Dropdown, DropdownOption, Input } from '@hostelhive/ui';
import { DashboardLayout } from '@layout/dashboard-layout/dashboard-layout';
import { format } from 'date-fns';
import { MessService } from './mess.service';

export type MealType = 'breakfast' | 'lunch' | 'dinner';

export interface GroceryItem {
  id: string;
  name: string;
  quantity: number;
  unit: string;
  price: number;
}

export interface MealState {
  menuName: string;
  groceries: GroceryItem[];
}

export const MEAL_META: Record<MealType, { label: string; icon: string; tint: string; time: string }> = {
  breakfast: { label: 'Breakfast', icon: 'ti-coffee', tint: 'bg-tint-cream', time: '8:00 AM' },
  lunch:     { label: 'Lunch',     icon: 'ti-salad',  tint: 'bg-tint-mint',  time: '1:00 PM' },
  dinner:    { label: 'Dinner',    icon: 'ti-moon',   tint: 'bg-tint-sky',   time: '8:00 PM' },
};

export const MEAL_ORDER: MealType[] = ['breakfast', 'lunch', 'dinner'];

const UNIT_OPTIONS: DropdownOption[] = [
  { value: 'kg',     label: 'kg' },
  { value: 'g',      label: 'g' },
  { value: 'L',      label: 'L' },
  { value: 'mL',     label: 'mL' },
  { value: 'pcs',    label: 'pcs' },
  { value: 'dozen',  label: 'dozen' },
  { value: 'pack',   label: 'pack' },
  { value: 'bag',    label: 'bag' },
  { value: 'box',    label: 'box' },
  { value: 'bundle', label: 'bundle' },
];

@Component({
  selector: 'hh-create-menu',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DecimalPipe, RouterLink, DashboardLayout, Button, Dropdown, Input],
  templateUrl: './grocery-list.html',
})
export class CreateMenu {
  private readonly svc    = inject(MessService);
  private readonly router = inject(Router);
  private readonly route  = inject(ActivatedRoute);

  protected readonly mealOrder   = MEAL_ORDER;
  protected readonly mealMeta    = MEAL_META;
  protected readonly unitOptions = UNIT_OPTIONS;
  protected readonly today = format(new Date(), 'EEEE, MMM d yyyy');

  protected readonly meals = signal<Record<MealType, MealState>>({
    breakfast: { menuName: '', groceries: [] },
    lunch:     { menuName: '', groceries: [] },
    dinner:    { menuName: '', groceries: [] },
  });

  protected readonly expandedMeal = signal<MealType | null>(null);

  protected readonly addName    = signal('');
  protected readonly addQty     = signal('');
  protected readonly addUnit    = signal('kg');
  protected readonly addPrice   = signal('');
  protected readonly addTouched = signal(false);

  protected readonly mealTotals = computed<Record<MealType, number>>(() => {
    const m = this.meals();
    return {
      breakfast: m.breakfast.groceries.reduce((s, g) => s + g.price, 0),
      lunch:     m.lunch.groceries.reduce((s, g) => s + g.price, 0),
      dinner:    m.dinner.groceries.reduce((s, g) => s + g.price, 0),
    };
  });

  protected readonly dailyTotal = computed(() =>
    Object.values(this.mealTotals()).reduce((s, t) => s + t, 0),
  );

  protected readonly hasAnyContent = computed(() => {
    const m = this.meals();
    return MEAL_ORDER.some(
      (t) => m[t].menuName.trim() || m[t].groceries.length > 0,
    );
  });

  protected updateMenuName(meal: MealType, name: string): void {
    this.meals.update((s) => ({ ...s, [meal]: { ...s[meal], menuName: name } }));
  }

  protected openAddForm(meal: MealType): void {
    this.expandedMeal.set(meal);
    this.addName.set('');
    this.addQty.set('');
    this.addUnit.set('kg');
    this.addPrice.set('');
    this.addTouched.set(false);
  }

  protected cancelAdd(): void {
    this.expandedMeal.set(null);
    this.addTouched.set(false);
  }

  protected addItem(meal: MealType): void {
    this.addTouched.set(true);
    const name  = this.addName().trim();
    const qty   = parseFloat(this.addQty());
    const price = parseFloat(this.addPrice());
    if (!name || !(qty > 0) || !(price >= 0)) return;

    this.meals.update((s) => ({
      ...s,
      [meal]: {
        ...s[meal],
        groceries: [
          ...s[meal].groceries,
          { id: `${Date.now()}-${Math.random()}`, name, quantity: qty, unit: this.addUnit(), price },
        ],
      },
    }));

    this.addName.set('');
    this.addQty.set('');
    this.addPrice.set('');
    this.addTouched.set(false);
  }

  protected removeItem(meal: MealType, itemId: string): void {
    this.meals.update((s) => ({
      ...s,
      [meal]: { ...s[meal], groceries: s[meal].groceries.filter((g) => g.id !== itemId) },
    }));
  }

  protected onUnitChange(v: string | string[] | null): void {
    if (typeof v === 'string') this.addUnit.set(v);
  }

  protected saveMenu(): void {
    this.svc.addEntry(this.meals());
    void this.router.navigate(['..'], { relativeTo: this.route });
  }

  protected addNameError = computed(() =>
    this.addTouched() && !this.addName().trim() ? 'Required' : '',
  );
  protected addQtyError = computed(() =>
    this.addTouched() && !(parseFloat(this.addQty()) > 0) ? 'Required' : '',
  );
  protected addPriceError = computed(() =>
    this.addTouched() && !(parseFloat(this.addPrice()) >= 0) ? 'Required' : '',
  );
}
