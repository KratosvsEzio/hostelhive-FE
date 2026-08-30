import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
} from '@angular/core';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { filter, map, startWith } from 'rxjs';
import { SiteHeader } from '@app/layout/components/site-header/site-header';
import { SiteFooter } from '@app/layout/components/site-footer/site-footer';
import { ToastHost } from '@app/layout/components/toast-host/toast-host';
import { SeekerTabBar } from '@app/layout/components/mobile-tab-bar/seeker-tab-bar';
import { MobileApp } from '@core/mobile-app';
// TEMPORARY (testing): startup gate to pick the BE base URL. Remove before go-live.
import { DevSetupGate } from '@app/features/dev-setup/dev-setup-gate';
import { devSetupPending } from '@core/dev-api-base-url';
import { routePath } from '@core/i18n/locales';
import { ConsentBanner } from '@core/google-analytics/consent-banner';
import { StartupGate } from '@core/startup-gate';
import { TranslocoPipe } from '@jsverse/transloco';
import { Logo } from '@core/brand/logo';

@Component({
  selector: 'app-root',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Logo, 
    RouterOutlet,
    SiteHeader,
    SiteFooter,
    ToastHost,
    SeekerTabBar,
    DevSetupGate,
    ConsentBanner,
    TranslocoPipe,
  ],
  templateUrl: './app.html',
})
export class App {
  private readonly router = inject(Router);
  private readonly mobile = inject(MobileApp);

  /** True while startup is still resolving the session and the country. */
  protected readonly startingUp = inject(StartupGate).busy;

  /** TEMPORARY (testing): true while the base-URL gate is still waiting for an answer. */
  protected readonly pending = devSetupPending;

  private readonly path = toSignal(
    this.router.events.pipe(
      filter((e) => e instanceof NavigationEnd),
      map(() => routePath(this.router.url)),
      startWith(routePath(this.router.url)),
    ),
    { initialValue: routePath(this.router.url) },
  );

  // The one shared SiteHeader renders on every route (its action buttons vary by area) — except
  // the full-screen onboarding wizard and the public mess opt-in landing, which carry their own
  // chrome.
  protected readonly showHeader = computed(() => {
    const u = this.path();
    return !u.startsWith('/host/listings/new') && !u.startsWith('/mess/confirm');
  });

  // Seeker area = everything outside the consoles, the Lead Wall and the utility landings.
  private readonly inSeekerArea = computed(() => {
    const u = this.path();
    return (
      // Exact `/host` or `/host/...` — not the public `/hostel/:id` listing pages.
      u !== '/host' &&
      !u.startsWith('/host/') &&
      !u.startsWith('/admin') &&
      !u.startsWith('/moderator') &&
      !u.startsWith('/auth') &&
      !u.startsWith('/confirm_invitation') &&
      // Registered top-level (app.routes.ts), a sibling of /auth rather than a child, so
      // it was falling into the seeker area — putting the bottom tab bar and the
      // marketing footer on a password-reset screen. Its card is an `absolute inset-0`
      // scroller, so the tab bar overlapped the submit button and no amount of padding
      // on <main> could reach inside to fix it.
      !u.startsWith('/reset_password') &&
      !u.startsWith('/forbidden') &&
      // Public mess opt-in landing carries its own chrome (no site header/footer/tabs).
      !u.startsWith('/mess/confirm')
    );
  });

  /**
   * The analytics consent banner, seeker area only — the consoles send nothing, so asking
   * there would be asking for a permission we do not use. Held back until the base-URL gate
   * clears so two overlays never stack.
   */
  protected readonly showConsentBanner = computed(
    () => this.inSeekerArea() && !this.pending(),
  );

  // Footer is seeker-only, and the mobile app replaces it with the bottom tab bar.
  protected readonly showFooter = computed(
    () => this.inSeekerArea() && !this.mobile.isMobile(),
  );

  // Bottom tab bar (Explore · Search · Favorites · Account) — mobile app, seeker area only.
  protected readonly showSeekerTabs = computed(
    () => this.inSeekerArea() && this.mobile.isMobile(),
  );

  /**
   * Routes that size themselves to the viewport and already account for the tab bar.
   * Search measures the bar into its sheet height (see SearchMap.measureTabBar), so its
   * document is exactly one screen tall — adding <main>'s clearance on top would only
   * hang a strip of empty scroll beneath a full-height map.
   */
  private readonly ownsBottomSpacing = computed(() =>
    this.path().startsWith('/search'),
  );

  /** Scroll clearance for the tab bar, minus the routes that handle it themselves. */
  protected readonly showTabBarClearance = computed(
    () => this.showSeekerTabs() && !this.ownsBottomSpacing(),
  );
}
