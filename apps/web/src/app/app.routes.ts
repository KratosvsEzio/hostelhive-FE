import { Route } from '@angular/router';
import { HOST_ROLES, STAFF_ROLES, authGuard, roleGuard } from '@core/auth';
import { Home } from '@features/public/home/home';
import { Forbidden } from '@core/forbidden/forbidden';

export const appRoutes: Route[] = [
  // â”€â”€â”€ Public seeker (SSR) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  {
    path: '',
    component: Home,
    title: 'HostelHive — Find verified hostels in Pakistan',
  },
  {
    path: 'search',
    loadChildren: () =>
      import('@features/public/search/search.routes').then((m) => m.SEARCH_ROUTES),
  },
  // ─── SEO landing pages ────────────────────────────────────────────────────
  // `/hostels/lahore`, `/hostels/lahore/girls`. These render the search experience with
  // the place's filters pre-applied, but express them in the path: `?city=Lahore` is
  // crawled as a variant of /search, whereas these are pages that can rank for
  // "hostels in Lahore" on their own. Server-rendered — the content has to be in the
  // HTML for a crawler that never runs JavaScript.
  //
  // The set of places is curated (see landing/places.ts) rather than open-ended, to keep
  // this from becoming thousands of near-empty faceted URLs.
  {
    path: 'hostels/:place',
    loadComponent: () =>
      import('@features/public/landing/place-landing').then((m) => m.PlaceLanding),
  },
  {
    path: 'hostels/:place/:gender',
    loadComponent: () =>
      import('@features/public/landing/place-landing').then((m) => m.PlaceLanding),
  },
  {
    path: 'hostel',
    loadChildren: () =>
      import('@features/public/listing/listing.routes').then(
        (m) => m.LISTING_ROUTES,
      ),
  },
  {
    // Public mess opt-in landing — students reach this from the WhatsApp/SMS/email link.
    // Token in the query (?token=…); no auth (the token is the credential). Chrome-free.
    path: 'mess/confirm',
    loadComponent: () =>
      import('@features/public/mess-confirm/mess-confirm').then((m) => m.MessConfirm),
    title: 'Confirm your meal — HostelHive',
  },
  {
    path: 'privacy-policy',
    loadComponent: () =>
      import('@features/public/legal/privacy-policy').then((m) => m.PrivacyPolicy),
    title: 'Privacy Policy — HostelHive',
  },
  {
    path: 'terms-of-service',
    loadComponent: () =>
      import('@features/public/legal/terms-of-service').then((m) => m.TermsOfService),
    title: 'Terms of Service — HostelHive',
  },
  {
    path: 'service-policy',
    loadComponent: () =>
      import('@features/public/legal/service-policy').then((m) => m.ServicePolicy),
    title: 'Service Policy — HostelHive',
  },
  {
    path: 'about',
    loadComponent: () =>
      import('@features/public/about/about').then((m) => m.About),
    title: 'About Us — HostelHive',
  },
  {
    path: 'faqs',
    loadComponent: () =>
      import('@features/public/faqs/faqs').then((m) => m.Faqs),
    title: 'FAQs — HostelHive',
  },
  {
    path: 'blog',
    loadComponent: () =>
      import('@features/public/blog/blog').then((m) => m.Blog),
    title: 'Blog — HostelHive',
  },
  {
    path: 'careers',
    loadComponent: () =>
      import('@features/public/careers/careers').then((m) => m.Careers),
    title: 'Careers — HostelHive',
  },
  {
    path: 'contact',
    loadComponent: () =>
      import('@features/public/contact/contact').then((m) => m.Contact),
    title: 'Contact Us — HostelHive',
  },
  {
    path: 'auth',
    loadChildren: () =>
      import('@features/auth/auth.routes').then((m) => m.AUTH_ROUTES),
  },
  {
    // Email-confirmation landing (target of the "Confirm My Account" link). Verifies the
    // one-time token, signs the user in, then redirects to the landing page.
    path: 'confirm_invitation',
    loadComponent: () =>
      import('@features/auth/confirm-invitation/confirm-invitation').then(
        (m) => m.ConfirmInvitation,
      ),
    title: 'Confirm your account — HostelHive',
  },
  {
    path: 'reset_password',
    loadComponent: () =>
      import('@features/auth/reset-password/reset-password').then(
        (m) => m.ResetPassword,
      ),
    title: 'Reset password — HostelHive',
  },
  {
    path: 'account',
    // Guarding the parent covers every child and runs before the shell chunk is fetched.
    canActivate: [authGuard],
    loadComponent: () =>
      import('@features/user/account-shell/account-shell').then((m) => m.AccountShell),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'favorites' },
      {
        path: 'favorites',
        loadComponent: () =>
          import('@features/user/favorites/favorites').then(
            (m) => m.AccountFavorites,
          ),
        title: 'Favorites — HostelHive',
      },
      {
        path: 'settings',
        loadComponent: () =>
          import('@features/user/settings/settings').then((m) => m.AccountSettings),
        title: 'Account settings — HostelHive',
      },
      {
        path: 'security',
        loadComponent: () =>
          import('@features/user/security/security').then((m) => m.AccountSecurity),
        title: 'Password & security — HostelHive',
      },
      // Retired in favour of the public /faqs page. Kept as a redirect so old links
      // and bookmarks land somewhere useful instead of 404ing.
      { path: 'help', redirectTo: '/faqs', pathMatch: 'full' },
    ],
  },

  // â”€â”€â”€ Notifications (client-rendered, auth-guarded) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  {
    path: 'notifications',
    canActivate: [authGuard],
    loadComponent: () =>
      import('@features/notifications/notifications').then(
        (m) => m.NotificationsPage,
      ),
    title: 'Notifications — HostelHive',
  },

  // â”€â”€â”€ Console (client-rendered, role-guarded) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // Payment confirmation page — must precede 'host/listings/new' so the router
  // doesn't match the shorter prefix first.
  {
    path: 'host/listings/new/payment',
    canActivate: [authGuard],
    loadComponent: () =>
      import(
        '@features/public/onboarding/onboarding-payment/onboarding-payment'
      ).then((m) => m.OnboardingPayment),
    title: 'Payment — HostelHive',
  },
  // Full-screen onboarding wizard — own chrome, no host sidebar — must precede 'host'.
  {
    path: 'host/listings/new',
    // Become-a-host onboarding: any signed-in user may start it — a seeker becomes a
    // host by creating their first listing, so gating it behind HOST_ROLES would lock
    // out the very people it exists for. The backend grants the host role on submit.
    canActivate: [authGuard],
    loadChildren: () =>
      import('@features/public/onboarding/onboarding.routes').then(
        (m) => m.ONBOARDING_ROUTES,
      ),
  },
  {
    path: 'host',
    canActivate: [roleGuard(...HOST_ROLES)],
    loadChildren: () =>
      import('@features/host/host.routes').then((m) => m.HOST_ROUTES),
  },
  {
    path: 'admin',
    canActivate: [roleGuard(...STAFF_ROLES)],
    loadChildren: () =>
      import('@features/admin/admin.routes').then((m) => m.ADMIN_ROUTES),
  },
  {
    path: 'moderator',
    canActivate: [roleGuard(...STAFF_ROLES)],
    loadChildren: () =>
      import('@features/moderator/moderator.routes').then((m) => m.MODERATOR_ROUTES),
  },
  { path: 'forbidden', component: Forbidden, title: 'Access blocked' },

  { path: '**', redirectTo: '' },
];
