import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { API_CONFIG } from '@core/api-config';
import { ACCESS_TOKEN } from '@core/tokens';
import {
  REGISTRATION_ID_HEADER,
  FCM_TOKEN_HEADER,
  PushNotificationsService,
} from '@core/push-notifications';

/**
 * The session-establishing calls. They carry no bearer token yet — the JWT is what
 * they return — so they are matched by path rather than by the authenticated check
 * below.
 *
 * `google_login` and `confirm_invitation` sit alongside `sign_in`/`sign_up` because
 * all four mint a JWT; omitting them would leave anyone who signs in with Google, or
 * activates from an invitation link, unregistered.
 */
const SESSION_PATHS = [
  '/api/user/sign_in',
  '/api/user/sign_up',
  '/api/user/google_login',
  '/api/user/confirm_invitation',
];

/**
 * Attaches the FCM token + registration id to authenticated requests and to the four
 * session calls.
 *
 * Authenticated requests are included because the permission prompt only appears
 * *after* sign-in succeeds, by which point that sign-in request has already gone out.
 * Restricted to the session calls alone, a new user's first token would not reach the
 * backend until their next sign-in — riding on the authenticated traffic that follows
 * delivers it seconds later instead, with no extra requests and no new endpoint. It
 * also means a token that rotates mid-session is reported rather than going stale
 * silently.
 *
 * Public endpoints are skipped: with no user to attribute the device to, sending it
 * there is noise.
 *
 * Both headers are omitted entirely when there is no token — on the web build, before
 * Firebase has answered, or when the user declined the notification permission. The
 * backend must therefore treat them as optional rather than required.
 */
export const pushTokenInterceptor: HttpInterceptorFn = (req, next) => {
  const base = inject(API_CONFIG).baseUrl;
  if (!req.url.startsWith(base)) return next(req);

  const authed = !!inject(ACCESS_TOKEN, { optional: true })?.();
  if (!authed && !SESSION_PATHS.some((p) => req.url.includes(p))) return next(req);

  const push = inject(PushNotificationsService);
  const token = push.token();
  if (!token) return next(req);

  const registrationId = push.registrationId();
  return next(
    req.clone({
      setHeaders: {
        [FCM_TOKEN_HEADER]: token,
        ...(registrationId ? { [REGISTRATION_ID_HEADER]: registrationId } : {}),
      },
    }),
  );
};
