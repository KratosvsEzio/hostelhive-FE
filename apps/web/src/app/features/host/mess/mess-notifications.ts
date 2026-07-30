import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { Button, Dropdown, DropdownOption, Input, TimePicker, Toggle } from '@hostelhive/ui';
import { DashboardLayout } from '@layout/dashboard-layout/dashboard-layout';
import { HostelsApi, HostPropertyStore, MealTypePayload } from '@services';
import {
  CHANNEL_META,
  CHANNEL_ORDER,
  MEAL_META,
  MEAL_ORDER,
  MealType,
  MessNotificationsService,
  NotifChannel,
} from './mess-notifications.service';

function to12h(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number);
  if (Number.isNaN(h)) return hhmm;
  const period = h < 12 ? 'AM' : 'PM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${period}`;
}

function addMinutes(hhmm: string, mins: number): string {
  const [h, m] = hhmm.split(':').map(Number);
  const total = (((h * 60 + m + mins) % 1440) + 1440) % 1440;
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

function deriveSendTime(mealTime: string, notifyBefore: number): string {
  return addMinutes(mealTime, -notifyBefore * 60);
}

function sendsNightBefore(mealTime: string, notifyBefore: number): boolean {
  const [h, m] = mealTime.split(':').map(Number);
  return h * 60 + m < notifyBefore * 60;
}

const NOTIFY_BEFORE_OPTIONS: DropdownOption[] = Array.from({ length: 12 }, (_, i) => ({
  value: String(i + 1),
  label: i === 0 ? '1 hour before' : `${i + 1} hours before`,
}));

const ALL_WINDOW_OPTIONS: DropdownOption[] = [
  { value: '60', label: '1 hour' },
  { value: '90', label: '1.5 hours' },
  { value: '120', label: '2 hours' },
  { value: '180', label: '3 hours' },
  { value: '240', label: '4 hours' },
  { value: '300', label: '5 hours' },
  { value: '360', label: '6 hours' },
  { value: '420', label: '7 hours' },
  { value: '480', label: '8 hours' },
  { value: '540', label: '9 hours' },
];

const DAYS = [
  { short: 'Mon', full: 'Monday' },
  { short: 'Tue', full: 'Tuesday' },
  { short: 'Wed', full: 'Wednesday' },
  { short: 'Thu', full: 'Thursday' },
  { short: 'Fri', full: 'Friday' },
  { short: 'Sat', full: 'Saturday' },
  { short: 'Sun', full: 'Sunday' },
];

const MEAL_PLACEHOLDERS: Record<MealType, string> = {
  breakfast: 'e.g. Halwa Puri & Chai',
  lunch: 'e.g. Chicken Biryani',
  dinner: 'e.g. Daal Chawal',
};

@Component({
  selector: 'hh-mess-notifications',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DashboardLayout, Button, Dropdown, Input, TimePicker, Toggle],
  templateUrl: './mess-notifications.html',
})
export class MessNotifications {
  protected readonly svc = inject(MessNotificationsService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly hostelApi = inject(HostelsApi);
  private readonly store = inject(HostPropertyStore);

  constructor() {
    effect(() => {
      const hostelId = this.store.selected();
      if (!hostelId) return;
      this.hostelApi.getWeeklyMenus(hostelId)
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe((menus) => this.svc.loadWeeklyMenus(menus));
      this.hostelApi.getMealTypes(hostelId)
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe((types) => this.svc.loadMealTypes(types));
    });
  }

  protected readonly mealOrder = MEAL_ORDER;
  protected readonly mealMeta = MEAL_META;
  protected readonly channelOrder = CHANNEL_ORDER;
  protected readonly channelMeta = CHANNEL_META;
  protected readonly notifyBeforeOptions = NOTIFY_BEFORE_OPTIONS;
  protected readonly days = DAYS;
  protected readonly mealPlaceholders = MEAL_PLACEHOLDERS;

  protected readonly todayIndex = (new Date().getDay() + 6) % 7;
  protected readonly selectedDay = signal(this.todayIndex);

  protected readonly deadlines = computed<Record<MealType, string>>(() => {
    const meals = this.svc.settings().meals;
    const get = (m: MealType): string => {
      const cfg = meals[m];
      return to12h(addMinutes(deriveSendTime(cfg.mealTime, cfg.notifyBefore), cfg.windowMinutes));
    };
    return { breakfast: get('breakfast'), lunch: get('lunch'), dinner: get('dinner') };
  });

  protected sendTimeLabel(meal: MealType): string {
    const cfg = this.svc.settings().meals[meal];
    const t = to12h(deriveSendTime(cfg.mealTime, cfg.notifyBefore));
    return sendsNightBefore(cfg.mealTime, cfg.notifyBefore) ? `${t} (night before)` : t;
  }

  protected nightBefore(meal: MealType): boolean {
    const cfg = this.svc.settings().meals[meal];
    return sendsNightBefore(cfg.mealTime, cfg.notifyBefore);
  }

  protected windowOptionsFor(meal: MealType): DropdownOption[] {
    const notifyBefore = this.svc.settings().meals[meal].notifyBefore;
    const maxMins = Math.min(540, notifyBefore * 60);
    return ALL_WINDOW_OPTIONS.filter((o) => +o.value <= maxMins);
  }

  protected leadTimeInvalid(meal: MealType): boolean {
    return this.svc.settings().meals[meal].notifyBefore < 4;
  }

  protected isChannelOn(ch: NotifChannel): boolean {
    return this.svc.settings().channels.includes(ch);
  }

  protected toggleChannel(ch: NotifChannel): void {
    this.svc.toggleChannel(ch);
  }

  protected setEnabled(meal: MealType, enabled: boolean): void {
    this.svc.updateMeal(meal, { enabled });
  }

  protected setMealTime(meal: MealType, mealTime: string | null): void {
    if (mealTime) this.svc.updateMeal(meal, { mealTime });
  }

  protected setNotifyBefore(meal: MealType, v: string | string[] | null): void {
    if (typeof v !== 'string') return;
    const hours = parseInt(v, 10);
    if (Number.isNaN(hours)) return;
    const cfg = this.svc.settings().meals[meal];
    const maxWindow = Math.min(540, hours * 60);
    const windowMinutes = Math.max(60, Math.min(cfg.windowMinutes, maxWindow));
    this.svc.updateMeal(meal, { notifyBefore: hours, windowMinutes });
  }

  protected setWindow(meal: MealType, v: string | string[] | null): void {
    if (typeof v === 'string') this.svc.updateMeal(meal, { windowMinutes: parseInt(v, 10) });
  }

  protected getWeeklyMenu(dayIndex: number, meal: MealType): string {
    return this.svc.settings().meals[meal].weeklyMenu[dayIndex] ?? '';
  }

  protected setWeeklyMenu(dayIndex: number, meal: MealType, menu: string): void {
    this.svc.updateWeeklyMenu(meal, dayIndex, menu);
  }

  protected todayMenu(meal: MealType): string {
    return this.svc.settings().meals[meal].weeklyMenu[this.todayIndex] ?? '';
  }

  protected openTest(meal: MealType): void {
    void this.router.navigate(['/mess/confirm'], {
      queryParams: { token: this.svc.makeTestToken(meal) },
    });
  }

  protected readonly menuSaveState = signal<'idle' | 'saving' | 'saved' | 'error'>('idle');
  protected readonly settingsSaveState = signal<'idle' | 'saving' | 'saved' | 'error'>('idle');
  private menuSaveTimer?: ReturnType<typeof setTimeout>;
  private settingsSaveTimer?: ReturnType<typeof setTimeout>;

  protected saveMenu(): void {
    const hostelId = this.store.selected();
    if (!hostelId) return;
    clearTimeout(this.menuSaveTimer);
    this.menuSaveState.set('saving');

    this.hostelApi.saveWeeklyMenus(hostelId, this.svc.buildWeeklyMenuPayload())
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.menuSaveState.set('saved');
          this.menuSaveTimer = setTimeout(() => this.menuSaveState.set('idle'), 2000);
        },
        error: () => {
          this.menuSaveState.set('error');
          this.menuSaveTimer = setTimeout(() => this.menuSaveState.set('idle'), 3000);
        },
      });
  }

  protected saveSettings(): void {
    const hostelId = this.store.selected();
    if (!hostelId) return;
    clearTimeout(this.settingsSaveTimer);
    this.settingsSaveState.set('saving');

    const meals = this.svc.settings().meals;
    const payloads: MealTypePayload[] = MEAL_ORDER.map((meal) => {
      const cfg = meals[meal];
      return {
        meal,
        meal_time: `2000-01-01 ${cfg.mealTime}:00.000000000 PKT +05:00`,
        confirmation_before_meal: Math.round(cfg.windowMinutes / 60),
        notify_before_meal_time: cfg.notifyBefore,
      };
    });

    this.hostelApi.saveMealTypes(hostelId, payloads)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (records) => {
          this.svc.loadMealTypes(records);
          this.settingsSaveState.set('saved');
          this.settingsSaveTimer = setTimeout(() => this.settingsSaveState.set('idle'), 2000);
        },
        error: () => {
          this.settingsSaveState.set('error');
          this.settingsSaveTimer = setTimeout(() => this.settingsSaveState.set('idle'), 3000);
        },
      });
    this.destroyRef.onDestroy(() => clearTimeout(this.settingsSaveTimer));
  }
}
