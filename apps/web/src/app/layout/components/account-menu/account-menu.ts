import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, NavigationStart, Router, RouterLink } from '@angular/router';
import { filter, map } from 'rxjs';
import {
  AuthService,
  HOST_ROLES,
  STAFF_ROLES,
  SessionStore,
} from '@core/auth';
import { Button } from '@hostelhive/ui';
import { TranslocoPipe } from '@jsverse/transloco';
import { LocaleLink } from '@core/i18n/locale-link';
import { routePath } from '@core/i18n/locales';
import { areaOf, isConsoleArea } from '@layout/area';

/** Account avatar + dropdown menu (seeker chrome). Reads the live session: shows the
 *  signed-in user + account links, or a Log in / Sign up prompt for guests.
 *
 *  Dismissal is handled by guarded `document` listeners rather than a backdrop element, so
 *  clicks outside pass through to whatever was clicked (the logo still navigates) and the
 *  page keeps scrolling while the panel is open. */
@Component({
  selector: 'app-account-menu',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslocoPipe, RouterLink, LocaleLink, Button],
  templateUrl: './account-menu.html',
  host: {
    '(document:click)': 'onDocumentClick($event)',
    '(document:keydown.escape)': 'onEscape()',
  },
})
export class AccountMenu {
  private readonly router = inject(Router);
  private readonly session = inject(SessionStore);
  private readonly auth = inject(AuthService);
  private readonly host = inject(ElementRef<HTMLElement>);
  private readonly trigger =
    viewChild<ElementRef<HTMLButtonElement>>('trigger');

  protected readonly open = signal(false);
  protected readonly user = this.session.user;

  constructor() {
    // Back/forward and programmatic navigation would otherwise leave the panel open.
    this.router.events
      .pipe(
        filter((e) => e instanceof NavigationStart),
        takeUntilDestroyed(),
      )
      .subscribe(() => this.close());
  }

  // Host CTA — shown only to signed-in users (the menu's authed branch). Existing hosts jump
  // to their dashboard; everyone else starts the become-a-host onboarding. Mirrors the header
  // CTA in site-nav, which is hidden on mobile, so the menu keeps the action reachable there.
  // Staff (super-admin/admin/support/moderator) get an Admin dashboard link instead of the
  // host CTA — roles are mutually exclusive (primaryRole resolves a single highest-priv role).
  protected readonly isStaff = computed(() =>
    this.session.hasRole(...STAFF_ROLES),
  );
  protected readonly isAdmin = computed(() =>
    this.session.allRoles().some((r) => r === 'super-admin' || r === 'admin' || r === 'support'),
  );
  protected readonly isModerator = computed(() =>
    this.session.allRoles().includes('moderator'),
  );
  protected readonly isHost = computed(() => this.session.hasRole(...HOST_ROLES));
  protected readonly hostLink = computed(() =>
    this.isHost() ? '/host' : '/host/listings/new',
  );
  /**
   * The translation *key*, piped through transloco in the template.
   *
   * Same defect the header's copy of this had: it returned English directly, so the one
   * menu row that changes with your role stayed English in all seventeen other languages
   * while every row around it translated. Both keys already existed.
   */
  protected readonly hostCtaKey = computed(() =>
    this.isHost() ? 'account.hostDashboard' : 'nav.becomeAHost',
  );

  /**
   * Whether the user is currently inside a console rather than on the site.
   *
   * Read off the router rather than passed in, because this menu is mounted once by the
   * one shared header and has no owner to tell it where it is.
   */
  private readonly path = toSignal(
    this.router.events.pipe(
      filter((e) => e instanceof NavigationEnd),
      map(() => routePath(this.router.url)),
    ),
    {
      initialValue:
        typeof window !== 'undefined'
          ? routePath(window.location.pathname)
          : routePath(this.router.url),
    },
  );

  protected readonly inConsole = computed(() => isConsoleArea(areaOf(this.path())));

  protected readonly items = [
    { label: 'Favorites', icon: 'ti-heart', link: '/account/favorites' },
    {
      label: 'Account settings',
      icon: 'ti-settings',
      link: '/account/settings',
    },
    {
      label: 'Password & security',
      icon: 'ti-lock',
      link: '/account/security',
    },
    { label: 'FAQs', icon: 'ti-help-circle', link: '/faqs' },
  ];

  protected readonly initials = computed(() => {
    const name = this.user()?.name?.trim();
    if (!name) return '';
    return name
      .split(/\s+/)
      .map((p) => p[0])
      .slice(0, 2)
      .join('')
      .toUpperCase();
  });

  protected toggle(): void {
    this.open.update((o) => !o);
  }

  protected close(): void {
    this.open.set(false);
  }

  // The trigger lives inside the host, so its own (click) runs first: closing by trigger hits the
  // `!open()` return, opening hits the `contains()` return — neither reopens nor re-closes.
  protected onDocumentClick(event: MouseEvent): void {
    if (!this.open()) return;
    if (this.host.nativeElement.contains(event.target as Node)) return;
    this.close();
  }

  // Keyboard dismissal returns focus to the trigger; an outside click leaves focus
  // where the user put it.
  protected onEscape(): void {
    if (!this.open()) return;
    this.close();
    this.trigger()?.nativeElement.focus();
  }

  protected logout(): void {
    this.close();
    // Revokes the JWT server-side (DELETE /api/user/sign_out) and clears the local
    // session — clears regardless of the network outcome — then returns home.
    this.auth.signOut().subscribe(() => void this.router.navigate(['/']));
  }
}
