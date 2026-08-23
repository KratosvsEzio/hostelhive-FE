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
import {
  MEAL_META,
  MealType,
  MessNotificationsService,
  TokenPayload,
} from '@features/host/mess/mess-notifications.service';
import { TranslocoPipe } from '@jsverse/transloco';

type ConfirmState = 'loading' | 'valid' | 'confirmed' | 'already' | 'expired' | 'invalid';

/**
 * Public opt-in landing — the page a student reaches from the WhatsApp/SMS/email link. Reads the
 * one-time token from the URL, validates it, and records the opt-in on confirm. Token resolve +
 * confirm are in-memory stubs today (see MessNotificationsService); the real backend validates
 * the signed token and persists the opt-in. Rendered chrome-free (see app.ts).
 */
@Component({
  selector: 'hh-mess-confirm',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, Button, TranslocoPipe],
  templateUrl: './mess-confirm.html',
})
export class MessConfirm {
  private readonly route = inject(ActivatedRoute);
  private readonly svc = inject(MessNotificationsService);
  private readonly api = inject(HostelsApi);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  protected readonly mealMeta = MEAL_META;
  protected readonly state = signal<ConfirmState>('loading');
  protected readonly payload = signal<TokenPayload | null>(null);

  constructor() {
    if (!this.isBrowser) return;
    const token = this.route.snapshot.queryParamMap.get('token');
    if (!token) { this.state.set('invalid'); return; }

    this.api.getMealInfo(token)
      .pipe(catchError(() => of(null)))
      .subscribe((info: MealInfoRaw | null) => {
        if (!info) { this.state.set('invalid'); return; }
        const payload: TokenPayload = {
          m: info.meal_type as MealType,
          menu: '',
          exp: new Date(info.expired_time).getTime(),
          n: '',
          d: info.meal_date,
        };
        this.payload.set(payload);
        if (Date.now() > payload.exp) { this.state.set('expired'); return; }
        this.state.set('valid');
      });
  }

  protected confirm(): void {
    const p = this.payload();
    if (!p || this.state() !== 'valid') return;
    this.state.set(this.svc.confirm(p) === 'already' ? 'already' : 'confirmed');
  }

  protected get meal(): TokenPayload['m'] | null {
    return this.payload()?.m ?? null;
  }

  protected mealLabel(): string {
    const p = this.payload();
    return p ? this.mealMeta[p.m].label : '';
  }
}
