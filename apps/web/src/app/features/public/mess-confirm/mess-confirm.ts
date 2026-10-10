import {
  ChangeDetectionStrategy,
  Component,
  PLATFORM_ID,
  inject,
  signal,
} from '@angular/core';
import { DatePipe, isPlatformBrowser } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { catchError, of } from 'rxjs';
import { Button } from '@hostelhive/ui';
import { HostelsApi, MealInfoRaw } from '@services';
import { MEAL_META, MealType } from '@features/host/mess/mess-notifications.service';
import { TranslocoPipe } from '@jsverse/transloco';

type ConfirmState = 'loading' | 'valid' | 'confirmed' | 'already' | 'expired' | 'invalid';

/** The meal a token points at, as this page shows it. */
export interface MealView {
  meal: MealType;
  /** Menu text, when the server sends one. */
  menu: string;
  /** Confirmation window close, epoch ms. */
  exp: number;
  /** yyyy-MM-dd */
  date: string;
}

function toMealView(info: MealInfoRaw): MealView {
  return {
    meal: info.meal_type as MealType,
    menu: '',
    exp: new Date(info.expired_time).getTime(),
    date: info.meal_date,
  };
}

function statusOf(e: unknown): number | undefined {
  const status = typeof e === 'object' && e !== null ? (e as { status?: unknown }).status : undefined;
  return typeof status === 'number' ? status : undefined;
}

/**
 * Public opt-in landing — the page a student reaches from the WhatsApp/SMS/email link. The
 * one-time token in the URL is the credential: the server resolves it to a meal and records
 * the opt-in, and every outcome shown here (confirmed, already confirmed, expired, invalid) is
 * the server's answer. Rendered chrome-free (see app.ts).
 */
@Component({
  selector: 'hh-mess-confirm',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, Button, TranslocoPipe],
  templateUrl: './mess-confirm.html',
})
export class MessConfirm {
  private readonly route = inject(ActivatedRoute);
  private readonly api = inject(HostelsApi);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly token = this.route.snapshot.queryParamMap.get('token');

  protected readonly mealMeta = MEAL_META;
  protected readonly state = signal<ConfirmState>('loading');
  protected readonly view = signal<MealView | null>(null);
  protected readonly confirming = signal(false);
  /** The last confirm attempt failed in a way a retry might fix (offline, 5xx). */
  protected readonly confirmFailed = signal(false);

  constructor() {
    if (!this.isBrowser) return;
    if (!this.token) { this.state.set('invalid'); return; }

    this.api.getMealInfo(this.token)
      .pipe(catchError(() => of(null)))
      .subscribe((info) => {
        // An unknown meal type has no label or icon to render, so it is as unusable as no meal.
        if (!info || !(info.meal_type in MEAL_META)) { this.state.set('invalid'); return; }
        const view = toMealView(info);
        this.view.set(view);
        if (info.is_confirmed) { this.state.set('already'); return; }
        if (Date.now() > view.exp) { this.state.set('expired'); return; }
        this.state.set('valid');
      });
  }

  protected confirm(): void {
    if (!this.token || this.state() !== 'valid' || this.confirming()) return;
    this.confirming.set(true);
    this.confirmFailed.set(false);

    this.api.confirmMeal(this.token).subscribe({
      next: (result) => {
        this.confirming.set(false);
        if (result.mealInfo && result.mealInfo.meal_type in MEAL_META) {
          this.view.set(toMealView(result.mealInfo));
        }
        this.state.set(result.alreadyConfirmed ? 'already' : 'confirmed');
      },
      error: (e: unknown) => {
        this.confirming.set(false);
        const status = statusOf(e);
        if (status === 410) this.state.set('expired');
        else if (status === 404) this.state.set('invalid');
        else this.confirmFailed.set(true);
      },
    });
  }

  protected mealLabel(): string {
    const v = this.view();
    return v ? this.mealMeta[v.meal].label : '';
  }
}
