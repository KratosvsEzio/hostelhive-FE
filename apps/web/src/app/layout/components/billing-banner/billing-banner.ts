import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  PLATFORM_ID,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { Button } from '@hostelhive/ui';
import { LocaleLink } from '@core/i18n/locale-link';
import { LocaleStore } from '@core/i18n/locale-store';
import { ApiDate } from '@util/api-date';
import {
  BannerAction,
  BannerInput,
  BannerTone,
  BillingBannerState,
  bannerFor,
  countdownParts,
  formatCountdown,
} from '@app/shared/billing/billing-banner';

export const DISMISSED_KEY = 'hh:billing-banner-dismissed';
const DISMISSED_CAP = 20;
const TICK_MS = 60_000;

const ACTION_KEYS: Record<BannerAction, string> = {
  renew: 'hostBilling.renew',
  choosePlan: 'hostBilling.choosePlan',
  pay: 'hostBilling.pay',
  resume: 'hostBilling.resumePlan',
  goToBilling: 'hostAccess.goToBilling',
};

const TONE_CLASSES: Record<BannerTone, string> = {
  info: 'border-tint-sky bg-tint-sky/60',
  warn: 'border-warn/30 bg-warn/5',
  danger: 'border-danger/30 bg-danger/5',
};

const TONE_ICONS: Record<BannerTone, string> = {
  info: 'ti-info-circle text-ink-500',
  warn: 'ti-alert-triangle text-warn',
  danger: 'ti-alert-circle text-danger',
};

/**
 * The host console's plan-status banner: at most one at a time, picked by `bannerFor`.
 * Re-evaluates every minute and when the tab comes back, so a countdown stays current.
 */
@Component({
  selector: 'hh-billing-banner',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, LocaleLink, Button, TranslocoPipe, ApiDate],
  template: `
    @if (banner(); as b) {
      <section
        role="region"
        class="rounded-xl border px-4 py-3 text-sm text-ink-700"
        [class]="toneClass()"
        [attr.aria-label]="'hostAccess.regionLabel' | transloco"
        [attr.data-kind]="b.kind"
        data-testid="billing-banner"
      >
        <div
          class="flex flex-wrap items-center gap-x-3 gap-y-2"
          aria-live="polite"
        >
          <i
            class="ti shrink-0"
            [class]="toneIcon()"
            aria-hidden="true"
          ></i>
          <p class="min-w-0 flex-1 basis-48 break-words">
            {{
              b.messageKey
                | transloco
                  : {
                      plan: b.params.plan,
                      date: (b.dates.date | apiDate: 'd MMM yyyy'),
                      endDate: (b.dates.endDate | apiDate: 'd MMM yyyy'),
                      graceDate: (b.dates.graceDate | apiDate: 'd MMM yyyy'),
                    }
            }}
            @if (b.boostPaused) {
              {{ 'hostAccess.boostPaused' | transloco }}
            }
            @if (b.countdownMs !== null) {
              <span
                class="font-semibold"
                data-testid="billing-banner-countdown"
              >
                @if (countdownText(); as time) {
                  {{ 'hostAccess.timeLeft' | transloco: { time: time } }}
                } @else {
                  {{ 'hostAccess.lessThanAnHourLeft' | transloco }}
                }
              </span>
            }
          </p>
          @if (actionKey(); as key) {
            <a
              hh-button
              variant="outlined"
              size="xs"
              class="shrink-0 bg-white"
              [routerLink]="billingLink()"
              data-testid="billing-banner-action"
            >
              {{ key | transloco }}
            </a>
          }
          @if (b.dismissible) {
            <button
              hh-button
              variant="icon"
              size="xs"
              type="button"
              class="shrink-0"
              [attr.aria-label]="'hostAccess.dismiss' | transloco"
              data-testid="billing-banner-dismiss"
              (click)="dismiss(b)"
            >
              <i class="ti ti-x text-ink-400" aria-hidden="true"></i>
            </button>
          }
        </div>
      </section>
    }
  `,
})
export class BillingBanner {
  private readonly locale = inject(LocaleStore);
  private readonly doc = inject(DOCUMENT);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  readonly state = input.required<BannerInput>();
  readonly hostelId = input.required<string>();
  readonly owner = input.required<string | null>();
  /** A past-due countdown ran out while shown; fires once per hostel. */
  readonly graceElapsed = output<void>();

  private readonly now = signal(Date.now());
  private readonly dismissed = signal<readonly string[]>(readDismissed());
  private countingFor: string | null = null;
  private readonly elapsedFor = new Set<string>();

  private readonly current = computed(() => bannerFor(this.state(), this.now()));

  protected readonly banner = computed(() => {
    const b = this.current();
    if (!b) return null;
    if (b.dismissible && this.dismissed().includes(this.dismissKey(b))) return null;
    return b;
  });

  protected readonly toneClass = computed(() => {
    const b = this.banner();
    return b ? TONE_CLASSES[b.tone] : '';
  });

  protected readonly toneIcon = computed(() => {
    const b = this.banner();
    return b ? TONE_ICONS[b.tone] : '';
  });

  protected readonly actionKey = computed(() => {
    const action = this.banner()?.action;
    return action ? ACTION_KEYS[action] : null;
  });

  protected readonly billingLink = computed(() => `/host/${this.hostelId()}/subscription`);

  protected readonly countdownText = computed(() => {
    const ms = this.banner()?.countdownMs;
    if (ms == null) return null;
    const parts = countdownParts(ms);
    return parts ? formatCountdown(parts, this.locale.active()) : null;
  });

  constructor() {
    if (this.isBrowser) {
      const tick = () => this.now.set(Date.now());
      const onVisible = () => {
        if (this.doc.visibilityState === 'visible') tick();
      };
      const timer = setInterval(tick, TICK_MS);
      this.doc.addEventListener('visibilitychange', onVisible);
      inject(DestroyRef).onDestroy(() => {
        clearInterval(timer);
        this.doc.removeEventListener('visibilitychange', onVisible);
      });
    }

    effect(() => {
      const b = this.banner();
      const hostelId = this.hostelId();
      if (b?.kind === 'past-due') {
        this.countingFor = hostelId;
        return;
      }
      // Only a countdown seen running for this hostel can elapse; arriving already over does not.
      const elapsed = b?.kind === 'grace-over' && this.countingFor === hostelId;
      if (elapsed && !this.elapsedFor.has(hostelId)) {
        this.elapsedFor.add(hostelId);
        this.graceElapsed.emit();
      }
      this.countingFor = null;
    });
  }

  protected dismiss(b: BillingBannerState): void {
    const key = this.dismissKey(b);
    const next = [...this.dismissed().filter((k) => k !== key), key].slice(-DISMISSED_CAP);
    this.dismissed.set(next);
    if (this.owner() !== null) writeDismissed(next);
  }

  private dismissKey(b: BillingBannerState): string {
    return `${this.owner()}|${this.hostelId()}|${b.kind}|${b.periodEnd}`;
  }
}

function readDismissed(): string[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(DISMISSED_KEY) ?? '[]');
    return Array.isArray(parsed) ? parsed.filter((k): k is string => typeof k === 'string') : [];
  } catch {
    return [];
  }
}

function writeDismissed(keys: readonly string[]): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(DISMISSED_KEY, JSON.stringify(keys));
  } catch {
    // Storage full or blocked: the dismissal still holds for this page's life.
  }
}
