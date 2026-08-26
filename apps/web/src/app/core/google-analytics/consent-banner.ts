import {
  ChangeDetectionStrategy,
  Component,
  PLATFORM_ID,
  computed,
  inject,
} from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { isPlatformBrowser } from '@angular/common';
import { RouterLink } from '@angular/router';
import { Capacitor } from '@capacitor/core';
import { Button } from '@hostelhive/ui';
import { googleAnalyticsEnv } from '@app/google-analytics.env';
import { GoogleAnalyticsService } from './google-analytics.service';
import { googleAnalyticsConsent, setGoogleAnalyticsConsent } from './google-analytics-consent';
import { LocaleLink } from '@core/i18n/locale-link';

/**
 * The analytics consent gate.
 *
 * Shown once, on the public marketplace, until the visitor answers either way. Nothing is
 * loaded or sent before "Allow" — this is a gate, not a notice, so declining is a real
 * choice and not a dismissal.
 *
 * `ngSkipHydration` because the server renders nothing here: whether to show the banner
 * depends on localStorage, which only exists in the browser, and rendering a guess would
 * either flash it at someone who already answered or hide it from someone who has not.
 */
@Component({
  selector: 'hh-consent-banner',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Button, RouterLink, LocaleLink, TranslocoPipe],
  host: { ngSkipHydration: 'true' },
  template: `
    @if (open()) {
      <div
        class="fixed inset-x-0 bottom-0 z-[80] p-3 sm:p-4"
        role="dialog"
        aria-live="polite"
        [attr.aria-label]="'a11y.analyticsConsent' | transloco"
      >
        <div
          class="mx-auto flex max-w-3xl flex-col gap-3 rounded-2xl border border-ink-100 bg-white p-4 shadow-pill sm:flex-row sm:items-center sm:gap-4 sm:p-5"
        >
          <p class="flex-1 text-sm text-ink-600">
            We'd like to count page views to see which hostels and cities people look for,
            so we can improve search. No personal details are sent, and this has nothing to
            do with staying signed in.
            <a routerLink="/privacy-policy" class="font-medium text-brand-600 underline">
              Privacy Policy
            </a>
          </p>
          <div class="flex shrink-0 items-center gap-2">
            <button hh-button variant="text" size="sm" (click)="decline()">
              No thanks
            </button>
            <button hh-button color="primary" size="sm" (click)="allow()">
              Allow
            </button>
          </div>
        </div>
      </div>
    }
  `,
})
export class ConsentBanner {
  private readonly analytics = inject(GoogleAnalyticsService);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  /**
   * Asking for consent we would never act on is worse than not asking: it implies tracking
   * that is not happening. So the banner stays away when there is no measurement id
   * configured, and in the native app, which does not load GA at all.
   */
  private readonly configured =
    this.isBrowser && !!googleAnalyticsEnv.measurementId && !Capacitor.isNativePlatform();

  protected readonly open = computed(
    () => this.configured && googleAnalyticsConsent() === 'unset',
  );

  protected allow(): void {
    setGoogleAnalyticsConsent('granted');
    this.analytics.start();
  }

  protected decline(): void {
    setGoogleAnalyticsConsent('denied');
  }
}
