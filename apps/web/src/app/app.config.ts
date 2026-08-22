import {
  ApplicationConfig,
  inject,
  provideAppInitializer,
  provideBrowserGlobalErrorListeners,
} from '@angular/core';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { provideRouter, RouteReuseStrategy } from '@angular/router';
import { AppRouteReuseStrategy } from './route-reuse-strategy';
import {
  provideClientHydration,
  withEventReplay,
} from '@angular/platform-browser';
import { ApiError } from '@hostelhive/data-access';
import { API_ERROR_NOTIFIER } from '@core/tokens';
import { toToastCopy } from '@core/errors/api-error-message';
import { provideDataAccess } from '@core/provide-data-access';
import { AuthService, Role, SessionStore, provideAuth } from '@core/auth';
import { pushTokenInterceptor } from '@core/interceptors/push-token-interceptor';
import { authInterceptor } from '@core/interceptors/auth-interceptor';
import { errorInterceptor } from '@core/interceptors/error-interceptor';
import { refetchDelayInterceptor } from '@core/refetch-delay';
import { Capacitor } from '@capacitor/core';
import { GoogleAuthService } from '@services';
import { googleOAuthEnv } from './google-oauth.env';
import { apiEnv } from './api.env';
import { readDevApiBaseUrl } from '@core/dev-api-base-url';
import { provideCapacitorNative } from '@app/capacitor/native';
import { appRoutes } from './app.routes';
import { NotificationService } from '@core/notification.service';
import { provideI18n } from '@core/i18n/provide-i18n';
import { LocaleSync } from '@core/i18n/locale-sync';
import { AnalyticsService } from '@core/analytics/analytics.service';
import { restoreAnalyticsConsent } from '@core/analytics/analytics-consent';

const STAFF: Role[] = ['super-admin', 'admin', 'support', 'moderator'];

export const appConfig: ApplicationConfig = {
  providers: [
    provideAnimationsAsync(),
    provideClientHydration(withEventReplay()),
    provideBrowserGlobalErrorListeners(),
    provideRouter(appRoutes),
    { provide: RouteReuseStrategy, useClass: AppRouteReuseStrategy },
    // Base URL = API origin (paths carry their own /api or /public prefix).
    // Driven from .env → api.env.ts at build time by tools/generate-api-env.mjs.
    // TEMPORARY (testing): a tester-entered base URL from the dev-setup gate wins when set,
    // so the whole app targets their backend. Remove this override before go-live.
    provideDataAccess({ baseUrl: readDevApiBaseUrl() ?? apiEnv.apiUrl }, [
      authInterceptor,
      pushTokenInterceptor,
      errorInterceptor,
      refetchDelayInterceptor,
    ]),
    provideAuth(),
    // Runtime i18n. Transloco rather than @angular/localize, which is compile-time and
    // cannot switch language without a reload — see provide-i18n.ts.
    provideI18n(),
    // Binds the active language to the URL, and sends a returning visitor to their
    // remembered one. Runs on the server too, so the server-rendered HTML already carries
    // the right lang and dir.
    provideAppInitializer(() => inject(LocaleSync).start()),
    // Surface failed API calls as a non-blocking toast, app-wide. The data-access error
    // interceptor calls this; the page keeps working regardless of the failure. 4xx carry a
    // server-supplied message worth reading, so they are pinned; transient 5xx/network auto-dismiss.
    {
      provide: API_ERROR_NOTIFIER,
      useFactory: (notify: NotificationService) => (e: ApiError) => {
        // A muted window means the app is already handling this failure visibly (the subscription
        // gate redirecting, say), so the toast would only add noise.
        if (notify.errorsMuted) return;
        const { title, message } = toToastCopy(e);
        const pinned = e.status >= 400 && e.status < 500;
        notify.show({ kind: 'error', title, message }, pinned ? 0 : 6000);
      },
      deps: [NotificationService],
    },
    // ── Google Auth ────────────────────────────────────────────────────────────
    // Two libraries, split by platform (see GoogleAuthService for why).
    //
    // Native keeps the Capacitor plugin. Web must NOT call its initialize(), because that
    // is what pulls in the legacy gapi/platform.js library Google has turned down; web
    // preloads Google Identity Services instead. The preload matters for more than speed:
    // the token popup has to open inside the user's click, so the script cannot be fetched
    // at click time or the popup gets blocked on first use.
    provideAppInitializer(async () => {
      if (typeof window === 'undefined') return; // SSR guard
      if (!googleOAuthEnv.clientId) return; // skip if key not configured
      const google = inject(GoogleAuthService);
      if (Capacitor.isNativePlatform()) {
        const { GoogleAuth } = await import('@codetrix-studio/capacitor-google-auth');
        await GoogleAuth.initialize({
          clientId: googleOAuthEnv.clientId,
          scopes: ['email', 'profile'],
        });
        return;
      }
      await google.preload();
    }),
    // Maps + location search are fully OpenStreetMap now (Leaflet + Nominatim), so
    // there is no Google Maps provider to wire — see lib/src/maps.
    // ── Native shell (Capacitor) — styles status bar, hides splash, wires the
    // Android back button. No-op on web/SSR builds. ─────────────────────────
    provideCapacitorNative(),
    // Restore a persisted session on load: validate the saved JWT (GET /api/users/current) and
    // log the user back in if it is still valid. Blocks bootstrap briefly (time-capped) so route
    // guards on /host and /admin see the restored session after a reload. A `?role=` dev override
    // (below) takes precedence and skips this.
    provideAppInitializer(() => {
      if (typeof window === 'undefined') return; // SSR: nothing persisted to restore
      if (new URLSearchParams(window.location.search).has('role')) return; // dev seed wins
      return inject(AuthService).restoreSession();
    }),
    // GA4 (public marketplace only). Reads the stored consent choice and, if it was
    // "granted", loads gtag. A visitor who has not answered — or who declined — gets no
    // script, no cookie and no request: the banner is a gate, not a notice.
    provideAppInitializer(() => {
      if (typeof window === 'undefined') return; // SSR
      restoreAnalyticsConsent();
      inject(AnalyticsService).start();
    }),
    // DEV ONLY — seed a console session so guarded /host + /admin routes render
    // before the Lead Wall login ships. Public seeker pages stay session-less.
    // Test a role via `?role=super-admin|moderator|manager|host`. Remove once login lands.
    provideAppInitializer(() => {
      if (typeof window === 'undefined') return;
      const role = new URLSearchParams(window.location.search).get(
        'role',
      ) as Role | null;
      if (!role) return;
      const isStaff = STAFF.includes(role);
      inject(SessionStore).setSession(
        {
          id: 'dev',
          name: isStaff ? 'Aashir Azeem' : 'Imran Khan',
          email: isStaff ? 'admin@hostelhive.pk' : 'host@hostelhive.pk',
          role,
          allRoles: [role],
          permissions: [],
          propertyId: null,
        },
        'dev-token',
      );
    }),
  ],
};
