import {
  afterNextRender,
  afterRenderEffect,
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Observable } from 'rxjs';
import { Button } from '@hostelhive/ui';
import {
  AccountConfirmedNotSignedIn,
  AuthService,
  SessionStore,
  SessionUser,
} from '@core/auth';
import { jwtDisplayIdentity } from '@core/auth/jwt';
import { LocaleLink } from '@core/i18n/locale-link';
import { TranslocoPipe } from '@jsverse/transloco';
import { Logo } from '@core/brand/logo';

type Phase = 'verifying' | 'asking' | 'confirmed' | 'error';

/** Unicode isolates, so a name in another script cannot reorder the sentence around it. */
const FIRST_STRONG_ISOLATE = '\u2068';
const POP_DIRECTIONAL_ISOLATE = '\u2069';

/**
 * Email-confirmation landing — the target of the "Confirm My Account" link
 * (`/confirm_invitation?token=…`). It POSTs the one-time token to
 * `/api/user/confirm_invitation`; on success the returned JWT signs the user in (persisted to
 * localStorage via the session store) and we redirect to the landing page.
 *
 * When someone is already signed in on this browser, nothing is sent until they choose: log
 * out and continue (the previous account is signed out first, then the token is spent), or
 * stay signed in (the token is not spent, so the link still works later). If that session
 * ends on its own while the question is showing, the confirmation simply goes ahead.
 *
 * Two failures are told apart: the link itself failing (a recoverable error), and the account
 * being confirmed but signing in not finishing — then the link is spent, so the page says the
 * account is confirmed and points to log in, or home if the previous account was put back.
 *
 * The decision runs inside `afterNextRender` (browser only) so the one-time token is not
 * spent during SSR and then re-submitted on hydration.
 */
@Component({
  selector: 'hh-confirm-invitation',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Logo, RouterLink, LocaleLink, Button, TranslocoPipe],
  templateUrl: './confirm-invitation.html',
})
export class ConfirmInvitation {
  private readonly auth = inject(AuthService);
  private readonly session = inject(SessionStore);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  private readonly askingHeading = viewChild<ElementRef<HTMLElement>>('askingHeading');

  protected readonly phase = signal<Phase>('verifying');
  /** Transloco key of the error message shown in the `error` phase. */
  protected readonly messageKey = signal('');
  /** Set when a failed sign-in put the previously signed-in account back. */
  protected readonly signedInUser = this.session.user;
  /** Latches the question: set by the first choice, so a second click or event does nothing. */
  protected readonly answered = signal(false);
  /** Who is signed in, as "Name (email)" or whichever is known, isolated; `null` if unknown. */
  protected readonly signedInAccount = computed(() => {
    const identity = this.signedInIdentity();
    if (!identity) return null;
    const { name, email } = identity;
    const label = name && email ? `${name} (${email})` : (name ?? email);
    return label ? FIRST_STRONG_ISOLATE + label + POP_DIRECTIONAL_ISOLATE : null;
  });

  constructor() {
    // Browser-only: don't spend the one-time token during SSR and then again on hydration.
    afterNextRender(() => this.decide());
    // The signed-in session ended by itself while asking: nothing is left to protect, so go on.
    effect(() => {
      if (this.phase() !== 'asking' || this.answered()) return;
      if (this.session.accessToken() !== null) return;
      untracked(() => this.answer(() => this.auth.confirmInvitation(this.token() ?? '')));
    });
    // Moves focus to the question when it appears; after-render effects never run on the server.
    afterRenderEffect(() => this.askingHeading()?.nativeElement.focus());
  }

  /** Signs out of the current account, then confirms the link. */
  protected logOutAndContinue(): void {
    this.answer(() => this.auth.signOutThenConfirmInvitation(this.token() ?? ''));
  }

  /** Leaves the link unspent and returns home as the current account. */
  protected staySignedIn(): void {
    if (this.phase() !== 'asking' || this.answered()) return;
    this.answered.set(true);
    void this.router.navigateByUrl('/');
  }

  private decide(): void {
    const token = this.token();
    if (!token) {
      this.fail('authConfirmInvitation.linkIsMissingItsToken');
      return;
    }
    if (this.session.accessToken() === null) {
      this.confirm(this.auth.confirmInvitation(token));
      return;
    }
    this.phase.set('asking');
  }

  private answer(run: () => Observable<SessionUser>): void {
    if (this.phase() !== 'asking' || this.answered()) return;
    this.answered.set(true);
    this.phase.set('verifying');
    this.confirm(run());
  }

  private confirm(request: Observable<SessionUser>): void {
    request.subscribe({
      // Signed in → landing page; replaced so Back does not return to the spent link.
      next: () => void this.router.navigateByUrl('/', { replaceUrl: true }),
      error: (err: unknown) => this.handleError(err),
    });
  }

  private signedInIdentity(): { name?: string; email?: string } | null {
    const user = this.session.user() ?? this.session.readPersistedUser();
    if (user) return { name: user.name || undefined, email: user.email || undefined };
    const token = this.session.accessToken();
    return token ? jwtDisplayIdentity(token) : null;
  }

  private token(): string | null {
    return this.route.snapshot.queryParamMap.get('token');
  }

  private handleError(err: unknown): void {
    if (err instanceof AccountConfirmedNotSignedIn) {
      this.phase.set('confirmed');
      return;
    }
    // Never show the raw message: it can carry the API URL or a developer string.
    const status = (err as { status?: unknown } | null)?.status;
    this.fail(
      status === 0
        ? 'authConfirmInvitation.cannotReachTheServer'
        : 'authConfirmInvitation.linkIsInvalidOrExpired',
    );
  }

  private fail(messageKey: string): void {
    this.messageKey.set(messageKey);
    this.phase.set('error');
  }
}
