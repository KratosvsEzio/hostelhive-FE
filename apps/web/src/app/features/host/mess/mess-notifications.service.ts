import { Injectable, signal } from '@angular/core';
import { MealTypeRecord, WeeklyMenuPayload, WeeklyMenuRecord } from '@services';

export type MealType = 'breakfast' | 'lunch' | 'dinner';
export type NotifChannel = 'whatsapp' | 'sms' | 'email';

export const MEAL_ORDER: MealType[] = ['breakfast', 'lunch', 'dinner'];

const DAY_INDEX: Readonly<Record<string, number>> = {
  monday: 0, tuesday: 1, wednesday: 2, thursday: 3,
  friday: 4, saturday: 5, sunday: 6,
};

const DAYS_API = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

/** Extract HH:mm from an ISO datetime string using the embedded offset (no JS timezone math). */
function isoToHHmm(iso: string): string {
  const match = iso.match(/T(\d{2}):(\d{2})/);
  return match ? `${match[1]}:${match[2]}` : '07:00';
}

export const MEAL_META: Record<MealType, { label: string; icon: string; tint: string }> = {
  breakfast: { label: 'Breakfast', icon: 'ti-coffee', tint: 'bg-tint-cream' },
  lunch: { label: 'Lunch', icon: 'ti-salad', tint: 'bg-tint-mint' },
  dinner: { label: 'Dinner', icon: 'ti-moon', tint: 'bg-tint-sky' },
};

export const CHANNEL_META: Record<NotifChannel, { label: string; icon: string }> = {
  whatsapp: { label: 'WhatsApp', icon: 'ti-brand-whatsapp' },
  sms: { label: 'SMS', icon: 'ti-message-2' },
  email: { label: 'Email', icon: 'ti-mail' },
};

export const CHANNEL_ORDER: NotifChannel[] = ['whatsapp', 'sms', 'email'];

/** Per-meal notification config. */
export interface MealNotifConfig {
  enabled: boolean;
  /** Full week of menus, Mon=0 … Sun=6. */
  weeklyMenu: string[];
  /** Actual time the meal is served — 'HH:mm'. */
  mealTime: string;
  /** Hours before mealTime to dispatch the notification (1–12; must be ≥ 4 to pass validation). */
  notifyBefore: number;
  /** How long the opt-in link stays valid after dispatch, in minutes (60–540 / 1–9 h, ≤ notifyBefore * 60). */
  windowMinutes: number;
}

export interface MessNotifSettings {
  channels: NotifChannel[];
  meals: Record<MealType, MealNotifConfig>;
}

const DEFAULT_SETTINGS: MessNotifSettings = {
  channels: ['whatsapp'],
  meals: {
    breakfast: {
      enabled: true,
      weeklyMenu: [
        'Halwa Puri & Chai',
        'Paratha & Egg',
        'Bread & Omelette',
        'Poori & Chanay',
        'Halwa Puri & Chai',
        'Nashta Platter',
        'Paratha & Egg',
      ],
      mealTime: '07:30',
      notifyBefore: 10,   // sends 9:30 PM the night before
      windowMinutes: 540, // closes 6:30 AM
    },
    lunch: {
      enabled: true,
      weeklyMenu: [
        'Chicken Biryani',
        'Daal Gosht',
        'Qorma & Naan',
        'Karahi & Rice',
        'Pulao',
        'Palak Gosht',
        'Chicken Roast',
      ],
      mealTime: '13:00',
      notifyBefore: 4,    // sends 9:00 AM
      windowMinutes: 240, // closes 1:00 PM
    },
    dinner: {
      enabled: true,
      weeklyMenu: [
        'Daal Chawal',
        'Murgh Karahi',
        'Beef Nihari',
        'Vegetable Curry',
        'Shami Kabab',
        'Biryani Special',
        'BBQ Night',
      ],
      mealTime: '20:00',
      notifyBefore: 4,    // sends 4:00 PM
      windowMinutes: 240, // closes 8:00 PM
    },
  },
};

@Injectable({ providedIn: 'root' })
export class MessNotificationsService {
  readonly settings = signal<MessNotifSettings>(DEFAULT_SETTINGS);
  private readonly weeklyMenuIds = signal<Record<string, string>>({});
  private readonly mealTypeIds = signal<Record<string, string>>({});

  setChannels(channels: NotifChannel[]): void {
    this.settings.update((s) => ({ ...s, channels }));
  }

  toggleChannel(ch: NotifChannel): void {
    this.settings.update((s) => ({
      ...s,
      channels: s.channels.includes(ch)
        ? s.channels.filter((c) => c !== ch)
        : [...s.channels, ch],
    }));
  }

  updateMeal(meal: MealType, patch: Partial<Omit<MealNotifConfig, 'weeklyMenu'>>): void {
    this.settings.update((s) => ({
      ...s,
      meals: { ...s.meals, [meal]: { ...s.meals[meal], ...patch } },
    }));
  }

  updateWeeklyMenu(meal: MealType, dayIndex: number, menu: string): void {
    this.settings.update((s) => {
      const updated = [...s.meals[meal].weeklyMenu];
      updated[dayIndex] = menu;
      return { ...s, meals: { ...s.meals, [meal]: { ...s.meals[meal], weeklyMenu: updated } } };
    });
  }

  loadWeeklyMenus(records: WeeklyMenuRecord[]): void {
    const ids: Record<string, string> = {};
    for (const r of records) ids[r.day] = r.id;
    this.weeklyMenuIds.set(ids);

    this.settings.update((s) => {
      // Start with all days blank so API data (not seed defaults) is the source of truth
      let meals = { ...s.meals };
      for (const meal of MEAL_ORDER) {
        meals = { ...meals, [meal]: { ...meals[meal], weeklyMenu: Array(7).fill('') } };
      }
      for (const r of records) {
        const i = DAY_INDEX[r.day];
        if (i === undefined) continue;
        const set = (meal: MealType, text: string) => {
          const weeklyMenu = [...meals[meal].weeklyMenu];
          weeklyMenu[i] = text;
          meals = { ...meals, [meal]: { ...meals[meal], weeklyMenu } };
        };
        set('breakfast', r.breakfast_menu_text);
        set('lunch', r.lunch_menu_text);
        set('dinner', r.dinner_menu_text);
      }
      return { ...s, meals };
    });
  }

  buildWeeklyMenuPayload(): WeeklyMenuPayload[] {
    const ids = this.weeklyMenuIds();
    const meals = this.settings().meals;
    return DAYS_API.map((day, i) => ({
      ...(ids[day] ? { id: ids[day] } : {}),
      day,
      breakfast_menu_text: meals.breakfast.weeklyMenu[i] ?? '',
      lunch_menu_text: meals.lunch.weeklyMenu[i] ?? '',
      dinner_menu_text: meals.dinner.weeklyMenu[i] ?? '',
    }));
  }

  registerMealTypeId(meal: string, id: string): void {
    this.mealTypeIds.update((ids) => ({ ...ids, [meal]: id }));
  }

  loadMealTypes(records: MealTypeRecord[]): void {
    const ids: Record<string, string> = {};
    for (const r of records) ids[r.meal] = r.id;
    this.mealTypeIds.set(ids);

    this.settings.update((s) => {
      let meals = { ...s.meals };
      for (const r of records) {
        const meal = r.meal as MealType;
        if (!MEAL_ORDER.includes(meal)) continue;
        meals = {
          ...meals,
          [meal]: {
            ...meals[meal],
            enabled: true,
            mealTime: isoToHHmm(r.meal_time),
            notifyBefore: r.notify_before_meal_time,
            windowMinutes: Math.min(540, r.confirmation_before_meal * 60),
          },
        };
      }
      return { ...s, meals };
    });
  }
}
