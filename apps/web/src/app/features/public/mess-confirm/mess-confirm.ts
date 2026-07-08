import {
  ChangeDetectionStrategy,
  Component,
  PLATFORM_ID,
  inject,
  signal,
} from '@angular/core';
import { DatePipe, isPlatformBrowser } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { Button } from '@hostelhive/ui';
import {
  MEAL_META,
  MessNotificationsService,
  TokenPayload,
} from '@features/host/mess/mess-notifications.service';

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
  imports: [DatePipe, Button],
  templateUrl: './mess-confirm.html',
})
export class MessConfirm {
  private readonly route = inject(ActivatedRoute);
  private readonly svc = inject(MessNotificationsService);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  protected readonly mealMeta = MEAL_META;
  protected readonly state = signal<ConfirmState>('loading');
  protected readonly payload = signal<TokenPayload | null>(null);

  constructor() {
    // Browser-only: the in-memory token store doesn't exist on the server, and resolving here
    // avoids baking a transient state into the SSR HTML.
    if (this.isBrowser) {
      const res = this.svc.resolve(this.route.snapshot.queryParamMap.get('token'));
      if (res.status === 'invalid') {
        this.state.set('invalid');
      } else {
        this.payload.set(res.payload);
        this.state.set(res.status === 'expired' ? 'expired' : 'valid');
      }
    }
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
