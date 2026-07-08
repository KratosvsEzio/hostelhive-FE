import { Injectable, computed, signal } from '@angular/core';
import { format } from 'date-fns';

/** A single grocery line item within a purchase entry. */
export interface GroceryItem {
  id: string;
  name: string;
  /** Unit of measure — kg, L, pcs, dozen, … */
  unit: string;
  quantity: number;
  /** Price for one unit ("each item price"). */
  unitPrice: number;
  /** Line total = unitPrice × quantity. */
  totalPrice: number;
}

/** One bulk grocery purchase, logged against a date. */
export interface GroceryEntry {
  id: string;
  date: Date;
  displayDate: string;
  shortDate: string;
  items: GroceryItem[];
  /** Number of line items in the purchase. */
  itemCount: number;
  /** Grand total = Σ item.totalPrice, or the manually entered lump sum in bill mode. */
  totalSum: number;
  /** 'items' = full breakdown entered; 'bill' = photo upload + lump total. */
  mode: 'items' | 'bill';
  /** Data-URL strings for attached receipt / bill photos. */
  images?: string[];
}

/** Payload for a new entry — the add-grocery page passes the picked date + raw items. */
export interface NewGroceryEntry {
  date: Date;
  items: Omit<GroceryItem, 'id' | 'totalPrice'>[];
  /** Attached image data-URLs (receipts, bill photos). */
  images?: string[];
  /** Bill mode only — lump-sum total entered by the user (items will be empty). */
  totalOverride?: number;
}

/** Parse a `YYYY-MM-DD` string to a local Date (no timezone shift). */
function isoToDate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function buildEntry(
  id: string,
  date: Date,
  raw: Omit<GroceryItem, 'id' | 'totalPrice'>[],
  opts?: { totalOverride?: number; images?: string[] },
): GroceryEntry {
  const items: GroceryItem[] = raw.map((it, i) => ({
    ...it,
    id: `${id}-${i}`,
    totalPrice: it.quantity * it.unitPrice,
  }));
  const isBill = opts?.totalOverride !== undefined;
  return {
    id,
    date,
    displayDate: format(date, 'EEEE, MMM d yyyy'),
    shortDate: format(date, 'd MMM yyyy'),
    items,
    itemCount: items.length,
    totalSum: isBill ? opts!.totalOverride! : items.reduce((s, it) => s + it.totalPrice, 0),
    mode: isBill ? 'bill' : 'items',
    images: opts?.images,
  };
}

/** Demo data so the list is populated before the mess API lands. [name, unit, qty, unitPrice] */
const SEED: { id: string; date: string; items: [string, string, number, number][] }[] = [
  {
    id: 'seed-1',
    date: '2026-07-05',
    items: [
      ['Flour (Atta)', 'kg', 20, 150],
      ['Basmati Rice', 'kg', 10, 350],
      ['Cooking Oil', 'L', 10, 550],
      ['Chicken', 'kg', 8, 620],
      ['Onions', 'kg', 15, 80],
      ['Tomatoes', 'kg', 10, 120],
      ['Potatoes', 'kg', 15, 70],
      ['Lentils (Masoor Daal)', 'kg', 6, 280],
      ['Sugar', 'kg', 8, 160],
      ['Tea (Chai Patti)', 'kg', 2, 1200],
      ['Milk', 'L', 12, 200],
      ['Eggs', 'dozen', 6, 320],
      ['Spices Mix (Masala)', 'pack', 5, 240],
    ],
  },
  {
    id: 'seed-2',
    date: '2026-06-28',
    items: [
      ['Flour (Atta)', 'kg', 15, 150],
      ['Cooking Oil', 'L', 5, 550],
      ['Chicken', 'kg', 6, 600],
      ['Onions', 'kg', 10, 85],
      ['Potatoes', 'kg', 10, 75],
      ['Salt', 'kg', 3, 45],
    ],
  },
];

@Injectable({ providedIn: 'root' })
export class MessService {
  readonly entries = signal<GroceryEntry[]>(
    SEED.map((s) =>
      buildEntry(
        s.id,
        isoToDate(s.date),
        s.items.map(([name, unit, quantity, unitPrice]) => ({ name, unit, quantity, unitPrice })),
      ),
    ),
  );

  readonly lastEntry = computed(() => this.entries()[0] ?? null);

  readonly thisMonthSpend = computed(() => {
    const now = new Date();
    return this.entries()
      .filter((e) => e.date.getFullYear() === now.getFullYear() && e.date.getMonth() === now.getMonth())
      .reduce((sum, e) => sum + e.totalSum, 0);
  });

  addEntry(input: NewGroceryEntry): void {
    const entry = buildEntry(String(Date.now()), input.date, input.items, {
      totalOverride: input.totalOverride,
      images: input.images,
    });
    this.entries.update((list) =>
      [entry, ...list].sort((a, b) => b.date.getTime() - a.date.getTime()),
    );
  }

  removeEntry(id: string): void {
    this.entries.update((list) => list.filter((e) => e.id !== id));
  }
}
