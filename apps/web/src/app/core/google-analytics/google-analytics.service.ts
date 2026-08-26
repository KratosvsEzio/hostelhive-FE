import { DestroyRef, Injectable, PLATFORM_ID, inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { NavigationEnd, Router } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { filter } from 'rxjs';
import { Capacitor } from '@capacitor/core';
import { googleAnalyticsEnv } from '@app/google-analytics.env';
import { googleAnalyticsConsent } from './google-analytics-consent';
import { GoogleAnalyticsEventName, GoogleAnalyticsEvents } from './google-analytics.events';

type GtagArgs = [command: string, ...rest: unknown[]];

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: GtagArgs) => void;
  }
}

const SCRIPT_ID = 'ga4-gtag';

/**
 * Routes that are *not* the public marketplace. Analytics is deliberately confined to the
 * seeker side: the consoles are authenticated product surfaces full of tenant names, CNICs
 * and salaries, and GA4 is both a poor tool for that job and the wrong place for that data.
 * Console usage should be measured server-side, where it can be tied to a real hostel id.
 */
const NON_MARKETPLACE = [
  '/host/',
  '/admin',
  '/moderator',
  '/auth',
  '/account',
  '/notifications',
  '/confirm_invitation',
  '/reset_password',
  '/forbidden',
];

/** Exported for tests — the boundary is the whole point of this file. */
export function isMarketplacePath(url: string): boolean {
  const path = url.split('?')[0];
  if (path === '/host') return false; // exact, so /hostel/:id still counts
  return !NON_MARKETPLACE.some((p) => path.startsWith(p));
}

/**
 * GA4 for the public marketplace.
 *
 * Four things keep it from misbehaving:
 *
 * 1. **Browser only.** gtag touches `document` and `window`; on the server this whole
 *    service is inert, so SSR renders identically with and without analytics.
 * 2. **Consent first.** The script is not fetched at all until the visitor accepts. A
 *    Consent Mode v2 default of "denied everything" is queued ahead of it regardless, so
 *    even a mis-ordered load cannot write a cookie.
 * 3. **Marketplace only.** Console routes send nothing — see {@link NON_MARKETPLACE}.
 * 4. **Web only.** The Capacitor build opts out: a webview reports a `capacitor://`
 *    origin and no referrer, which pollutes acquisition reports with junk. Native app
 *    analytics belongs to Firebase Analytics, which is a separate integration.
 *
 * Page views are sent by hand. GA4's automatic `page_view` fires once on script load and
 * never again in a single-page app, so `send_page_view: false` turns it off and the router
 * drives it instead.
 */
@Injectable({ providedIn: 'root' })
export class GoogleAnalyticsService {
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  private started = false;
  private routerBound = false;

  /** False when there is no measurement id, on the server, or in the native app. */
  private get enabled(): boolean {
    return (
      this.isBrowser &&
      !!googleAnalyticsEnv.measurementId &&
      !Capacitor.isNativePlatform()
    );
  }

  /**
   * Loads gtag.js and begins tracking. Called once consent is granted — and again on every
   * later boot, since the stored `'granted'` is restored before this runs. Repeat calls are
   * ignored.
   */
  start(): void {
    if (!this.enabled || this.started) return;
    if (googleAnalyticsConsent() !== 'granted') return;
    this.started = true;

    const id = googleAnalyticsEnv.measurementId;
    window.dataLayer = window.dataLayer ?? [];
    // Must be `arguments`, not a rest array: gtag.js reads the raw arguments object off
    // dataLayer and an array lands as a single nested entry it cannot parse.
    // eslint-disable-next-line prefer-rest-params
    window.gtag = function gtag() { window.dataLayer?.push(arguments); };

    // Consent Mode v2. Advertising signals stay denied even after acceptance — we do not
    // run ads, and granting them would be claiming a permission we never asked for.
    window.gtag('consent', 'default', {
      ad_storage: 'denied',
      ad_user_data: 'denied',
      ad_personalization: 'denied',
      analytics_storage: 'denied',
    });
    window.gtag('consent', 'update', { analytics_storage: 'granted' });

    window.gtag('js', new Date());
    window.gtag('config', id, {
      send_page_view: false,
      // The seeker area is public, but the app also serves consoles behind the same origin;
      // never let GA infer a title from one of those.
      anonymize_ip: true,
    });

    if (!document.getElementById(SCRIPT_ID)) {
      const s = document.createElement('script');
      s.id = SCRIPT_ID;
      s.async = true;
      s.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(id)}`;
      document.head.appendChild(s);
    }

    this.bindRouter();
    // Only when a navigation has already finished — i.e. consent was granted mid-session.
    // On boot the router has not navigated yet, and the NavigationEnd that follows would
    // send a second page_view for the same page.
    if (this.router.navigated) this.sendPageView(this.router.url);
  }

  /**
   * Stops sending. The already-loaded script cannot be unloaded, so consent is withdrawn
   * through Consent Mode, which is what actually governs whether GA may store anything.
   */
  stop(): void {
    if (!this.enabled) return;
    window.gtag?.('consent', 'update', { analytics_storage: 'denied' });
    this.started = false;
  }

  /**
   * Sends a typed marketplace event.
   *
   * `params` is checked against {@link GoogleAnalyticsEvents}, so a typo in a name or a parameter
   * is a compile error rather than a column of nulls discovered in GA four weeks later.
   */
  track<K extends GoogleAnalyticsEventName>(name: K, params: GoogleAnalyticsEvents[K]): void {
    if (!this.started || googleAnalyticsConsent() !== 'granted') return;
    if (!isMarketplacePath(this.router.url)) return;
    window.gtag?.('event', name, params);
  }

  private bindRouter(): void {
    if (this.routerBound) return;
    this.routerBound = true;
    this.router.events
      .pipe(
        filter((e): e is NavigationEnd => e instanceof NavigationEnd),
        takeUntilDestroyed(this.destroyRef),
      )
      // Deferred a tick: Angular's TitleStrategy also runs off NavigationEnd, and reading
      // document.title in the same task gets the *previous* route's title — every page
      // would be attributed to whatever the visitor landed on first.
      .subscribe((e) => setTimeout(() => this.sendPageView(e.urlAfterRedirects)));
  }

  private sendPageView(url: string): void {
    if (!isMarketplacePath(url)) return;
    window.gtag?.('event', 'page_view', {
      page_path: url.split('?')[0],
      page_location: window.location.href,
      page_title: document.title,
    });
  }
}
