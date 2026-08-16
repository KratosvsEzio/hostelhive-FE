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

@Component({
  selector: 'app-root',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet, SiteHeader, SiteFooter, ToastHost, SeekerTabBar, DevSetupGate],
  templateUrl: './app.html',
})
export class App {
  private readonly router = inject(Router);
  private readonly mobile = inject(MobileApp);

  /** TEMPORARY (testing): true while the base-URL gate is still waiting for an answer. */
  protected readonly pending = devSetupPending;

  private readonly path = toSignal(
    this.router.events.pipe(
      filter((e) => e instanceof NavigationEnd),
      map(() => this.router.url.split('?')[0]),
      startWith(this.router.url.split('?')[0]),
    ),
    { initialValue: this.router.url.split('?')[0] },
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
      !u.startsWith('/forbidden') &&
      // Public mess opt-in landing carries its own chrome (no site header/footer/tabs).
      !u.startsWith('/mess/confirm')
    );
  });

  // Footer is seeker-only, and the mobile app replaces it with the bottom tab bar.
  protected readonly showFooter = computed(
    () => this.inSeekerArea() && !this.mobile.isMobile(),
  );

  // Bottom tab bar (Explore · Search · Favorites · Account) — mobile app, seeker area only.
  protected readonly showSeekerTabs = computed(
    () => this.inSeekerArea() && this.mobile.isMobile(),
  );
}
