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

@Component({
  selector: 'app-root',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet, SiteHeader, SiteFooter, ToastHost],
  templateUrl: './app.html',
})
export class App {
  private readonly router = inject(Router);

  private readonly path = toSignal(
    this.router.events.pipe(
      filter((e) => e instanceof NavigationEnd),
      map(() => this.router.url.split('?')[0]),
      startWith(this.router.url.split('?')[0]),
    ),
    { initialValue: this.router.url.split('?')[0] },
  );

  // The one shared SiteHeader renders on every route (its action buttons vary by area) — except
  // the full-screen onboarding wizard, which carries its own step chrome (progress + save/exit).
  protected readonly showHeader = computed(
    () => !this.path().startsWith('/host/listings/new'),
  );

  // Footer is seeker-only: the console areas (/host, /admin, /moderator), the Lead Wall (/auth),
  // the email-confirm landing and /forbidden don't show it.
  protected readonly showFooter = computed(() => {
    const u = this.path();
    return (
      !u.startsWith('/host') &&
      !u.startsWith('/admin') &&
      !u.startsWith('/moderator') &&
      !u.startsWith('/auth') &&
      !u.startsWith('/confirm_invitation') &&
      !u.startsWith('/forbidden')
    );
  });
}
