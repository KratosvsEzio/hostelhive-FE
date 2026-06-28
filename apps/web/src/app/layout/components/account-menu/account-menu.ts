import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import {
  AuthService,
  HOST_ROLES,
  STAFF_ROLES,
  SessionStore,
} from '@core/auth';

/** Account avatar + dropdown menu (seeker chrome). Reads the live session: shows the
 *  signed-in user + account links, or a Log in / Sign up prompt for guests. */
@Component({
  selector: 'app-account-menu',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  templateUrl: './account-menu.html',
})
export class AccountMenu {
  private readonly router = inject(Router);
  private readonly session = inject(SessionStore);
  private readonly auth = inject(AuthService);

  protected readonly open = signal(false);
  protected readonly user = this.session.user;

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
  protected readonly hostCta = computed(() =>
    this.isHost() ? 'Host dashboard' : 'Become a host',
  );

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
{ label: 'Help Centre', icon: 'ti-help-circle', link: '/account/help' },
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

  protected logout(): void {
    this.open.set(false);
    // Revokes the JWT server-side (DELETE /api/user/sign_out) and clears the local
    // session — clears regardless of the network outcome — then returns home.
    this.auth.signOut().subscribe(() => void this.router.navigate(['/']));
  }
}
