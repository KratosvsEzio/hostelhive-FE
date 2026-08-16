import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { API_CONFIG } from '@core/api-config';
import {
  DEVICE_ID_HEADER,
  FCM_TOKEN_HEADER,
  PushNotificationsService,
} from '@core/push-notifications';

/**
 * Endpoints that establish a session. The backend reads the push headers off these
 * and binds the device to the account being signed in.
 *
 * `google_login` and `confirm_invitation` are included deliberately: both mint a JWT
 * exactly like `sign_in` does, so omitting them would leave anyone who signs in with
 * Google, or activates from an invitation link, with no device registered.
 */
const SESSION_PATHS = [
  '/api/user/sign_in',
  '/api/user/sign_up',
  '/api/user/google_login',
  '/api/user/confirm_invitation',
];

/**
 * Attaches the FCM token + device id to the session-establishing calls.
 *
 * Both headers are omitted entirely when there is no token — on the web build, before
 * Firebase has answered, or when the user declined the notification permission. The
 * backend must therefore treat them as optional rather than required.
 *
 * KNOWN GAP: an FCM token can rotate at any time, including midway through a session
 * that lasts weeks. Because this only fires on sign-in, a rotation is not reported
 * until the user next signs in, and pushes to the stale token fail silently in the
 * meantime. Widening SESSION_PATHS to every authenticated request — or exposing a
 * small endpoint to POST a refreshed token — closes it.
 */
export const pushTokenInterceptor: HttpInterceptorFn = (req, next) => {
  const base = inject(API_CONFIG).baseUrl;
  if (!req.url.startsWith(base)) return next(req);
  if (!SESSION_PATHS.some((p) => req.url.includes(p))) return next(req);

  const push = inject(PushNotificationsService);
  const token = push.token();
  if (!token) return next(req);

  const deviceId = push.deviceId();
  return next(
    req.clone({
      setHeaders: {
        [FCM_TOKEN_HEADER]: token,
        ...(deviceId ? { [DEVICE_ID_HEADER]: deviceId } : {}),
      },
    }),
  );
};
