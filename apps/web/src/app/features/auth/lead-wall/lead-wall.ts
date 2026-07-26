import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  linkedSignal,
  signal,
} from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { map, switchMap } from 'rxjs';
import { FormsModule } from '@angular/forms';
import { Button, Input, PhoneInput, Tabs, TabItem } from '@hostelhive/ui';
import {
  AuthService,
  HOST_ROLES,
  SessionStore,
} from '@core/auth';
import { ApiError } from '@hostelhive/data-access';
import { GoogleAuthService } from '@services';

type AuthTab = 'register' | 'login';
type Phase = 'form' | 'verify';

/**
 * Maps the `?mode` query param onto the tab to open.
 *
 * Register is the default: the highest-traffic entry point is the phone-reveal gate,
 * which converts visitors who do not have an account yet. Only an exact `login` opts
 * out — anything else (wrong case, unknown value, empty) falls back to Register so
 * `hh-tabs` is never handed a value that matches no tab.
 */
function tabForMode(mode: string | null): AuthTab {
  return mode === 'login' ? 'login' : 'register';
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PASSWORD_RE = /^(?=.*[A-Z])(?=.*\d).{8,}$/;

/**
 * Lead Wall (mockup 04) — modal-style auth surface gating verified contact details.
 *
 * Register / Login tabs, inline-validated fields, then a stubbed flow:
 * register → "check your email" → (stub) verify mints a seeker session → success.
 * `returnUrl` is read from the query string and echoed as where the user lands.
 */
@Component({
  selector: 'hh-lead-wall',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, FormsModule, Button, Input, PhoneInput, Tabs],
  templateUrl: './lead-wall.html',
})
export class LeadWall {
  private readonly auth = inject(AuthService);
  private readonly googleAuth = inject(GoogleAuthService);
  private readonly session = inject(SessionStore);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  protected readonly tabs: TabItem[] = [
    { label: 'Register', value: 'register' },
    { label: 'Log in', value: 'login' },
  ];

  constructor() {
    // If the session is already restored (returning user with a valid cookie), redirect
    // them to their destination immediately rather than showing the login form.
    effect(() => {
      if (this.session.isAuthenticated()) {
        void this.router.navigateByUrl(this.destination(), { replaceUrl: true });
      }
    });
  }

  /**
   * Seeded from `?mode`, which the login entry points set so they land on Log in.
   *
   * The snapshot is the `initialValue` so the tab is resolved synchronously at
   * construction and ships in the SSR payload rather than flipping after hydration.
   */
  private readonly modeParam = toSignal(
    this.route.queryParamMap.pipe(map((p) => p.get('mode'))),
    { initialValue: this.route.snapshot.queryParamMap.get('mode') },
  );

  /**
   * A `linkedSignal` rather than a plain signal because the route reuse strategy reuses
   * this component across `/auth` → `/auth?mode=login`, so the constructor does not
   * re-run. Switching tabs by hand still overrides it until `mode` itself changes.
   */
  protected readonly tab = linkedSignal<string | null, AuthTab>({
    source: this.modeParam,
    computation: (mode) => tabForMode(mode),
  });

  protected readonly phase = signal<Phase>('form');
  protected readonly busy = signal(false);
  protected readonly showErrors = signal(false);
  protected readonly error = signal('');

  protected readonly name = signal('');
  protected readonly email = signal('');
  protected readonly password = signal('');
  protected readonly confirmPassword = signal('');
  protected readonly phone = signal('');

  protected readonly isRegister = computed(() => this.tab() === 'register');

  /** Optional ?returnUrl=… echoed as where the seeker lands after sign-in. */
  protected readonly returnUrl = toSignal(
    this.route.queryParamMap.pipe(map((p) => p.get('returnUrl') || '/')),
    { initialValue: '/' },
  );

  protected readonly nameError = computed(() =>
    !this.isRegister()
      ? ''
      : this.name().trim().length < 2
        ? 'Enter your full name.'
        : '',
  );
  protected readonly emailError = computed(() =>
    EMAIL_RE.test(this.email().trim()) ? '' : 'Enter a valid email address.',
  );
  protected readonly passwordError = computed(() => {
    const v = this.password();
    if (this.isRegister())
      return PASSWORD_RE.test(v) ? '' : 'Min 8 chars, 1 uppercase & 1 number.';
    return v.length === 0 ? 'Enter your password.' : '';
  });
  protected readonly confirmPasswordError = computed(() => {
    if (!this.isRegister()) return '';
    if (!this.confirmPassword()) return 'Please confirm your password.';
    return this.confirmPassword() === this.password() ? '' : 'Passwords do not match.';
  });
  protected readonly phoneError = computed(() => {
    if (!this.isRegister()) return '';
    // phone() is E.164 when valid, empty when invalid/incomplete
    return this.phone().trim().length > 0 ? '' : 'Enter a valid phone number.';
  });

  protected readonly isValid = computed(
    () =>
      !this.nameError() &&
      !this.emailError() &&
      !this.passwordError() &&
      !this.confirmPasswordError() &&
      !this.phoneError(),
  );

  protected onTabChange(value: string): void {
    this.tab.set(value as AuthTab);
    this.showErrors.set(false);
    this.confirmPassword.set('');
  }

  /** Register → POST /api/user/sign_up; Login → POST /api/user/sign_in (real API). */
  protected submit(event: Event): void {
    event.preventDefault();
    this.showErrors.set(true);
    this.error.set('');
    if (!this.isValid()) return;

    const email = this.email().trim();
    const password = this.password();
    this.busy.set(true);

    if (this.isRegister()) {
      this.auth
        .signUp({
          name: this.name().trim(),
          email,
          password,
          phone: this.phone(), // already E.164 from hh-phone-input
        })
        .subscribe({
          next: () => {
            this.busy.set(false);
            // Sign-up never returns a token — the account is activated via the emailed
            // confirmation link, so route to the "check your email" step.
            this.phase.set('verify');
          },
          error: (err: ApiError) => this.fail(err),
        });
    } else {
      this.auth.signIn(email, password).subscribe({
        next: () => {
          this.busy.set(false);
          this.afterLogin();
        },
        error: (err: ApiError) => this.fail(err),
      });
    }
  }

  /** Google OAuth: open consent popup → exchange access_token → establish session. */
  protected googleSignIn(): void {
    this.busy.set(true);
    this.error.set('');
    this.googleAuth.getAccessToken().pipe(
      switchMap((token) => this.auth.googleLogin(token)),
    ).subscribe({
      next: () => { this.busy.set(false); this.afterLogin(); },
      error: (err: ApiError) => this.fail(err),
    });
  }

  /** After verifying their email, signing in succeeds and mints the real session. */
  protected verify(): void {
    this.busy.set(true);
    this.error.set('');
    this.auth.signIn(this.email().trim(), this.password()).subscribe({
      next: () => {
        this.busy.set(false);
        this.afterLogin();
      },
      error: (err: ApiError) => this.fail(err),
    });
  }

  private fail(err: ApiError): void {
    this.busy.set(false);
    this.error.set(
      err?.status === 0
        ? 'Cannot reach the server — is the API running?'
        : err?.message ||
            'Something went wrong. Check your details and try again.',
    );
  }

  /**
   * Route by the role resolved at sign-in (GET /api/users/current): staff land in the admin/
   * moderation console, hosts in the host console, and seekers continue straight back to the
   * returnUrl (the listing they came from). No success interstitial on login.
   */
  private afterLogin(): void {
    void this.router.navigateByUrl(this.destination());
  }

  /**
   * Where to send the user after auth. A non-trivial `returnUrl` (set by the guard
   * when redirecting here) always wins — this preserves the exact route the user was
   * on, including `/moderator/queue` for a moderator who refreshed the page.
   * Falls back to the role's default console home, or `/` for seekers.
   */
  private destination(): string {
    const ret = this.returnUrl();
    if (ret && ret !== '/') return ret;
    return this.consoleHome() ?? '/';
  }

  private consoleHome(): string | null {
    if (this.session.hasRole('super-admin', 'admin', 'support')) return '/admin/contracts';
    if (this.session.hasRole('moderator')) return '/moderator/queue';
    if (this.session.hasRole(...HOST_ROLES)) return '/host';
    return null;
  }

}
