import { Injectable, signal } from '@angular/core';
import { format } from 'date-fns';
import { GroceryItem, MEAL_ORDER, MealState, MealType } from './grocery-list';

export interface DailyMenuEntry {
  id: string;
  date: Date;
  displayDate: string;
  meals: Record<MealType, MealState>;
  mealTotals: Record<MealType, number>;
  totalCost: number;
}

function mealTotal(m: MealState): number {
  return m.groceries.reduce((s, g) => s + g.price, 0);
}

@Injectable({ providedIn: 'root' })
export class MessService {
  readonly entries = signal<DailyMenuEntry[]>([]);

  addEntry(meals: Record<MealType, MealState>): void {
    const now = new Date();
    const mealTotals: Record<MealType, number> = {
      breakfast: mealTotal(meals.breakfast),
      lunch:     mealTotal(meals.lunch),
      dinner:    mealTotal(meals.dinner),
    };
    this.entries.update((list) => [
      {
        id: String(Date.now()),
        date: now,
        displayDate: format(now, 'EEEE, MMM d yyyy'),
        meals,
        mealTotals,
        totalCost: MEAL_ORDER.reduce((s, m) => s + mealTotals[m], 0),
      },
      ...list,
    ]);
  }

  removeEntry(id: string): void {
    this.entries.update((list) => list.filter((e) => e.id !== id));
  }
}
