import { RenderMode, ServerRoute } from '@angular/ssr';

export const serverRoutes: ServerRoute[] = [
  // Public seeker: home prerendered for SEO; search / listing / auth render on
  // demand on the server (dynamic :slug params, query state).
  { path: '', renderMode: RenderMode.Prerender },

  // Console is authenticated + client-only — skip SSR so guards/session never
  // run on the server and the admin code stays out of the public render path.
  { path: 'host', renderMode: RenderMode.Client },
  { path: 'host/**', renderMode: RenderMode.Client },
  { path: 'admin', renderMode: RenderMode.Client },
  { path: 'admin/**', renderMode: RenderMode.Client },
  { path: 'moderator', renderMode: RenderMode.Client },
  { path: 'moderator/**', renderMode: RenderMode.Client },
  { path: 'forbidden', renderMode: RenderMode.Client },

  // The seeker account area is authenticated and per-user with zero SEO value: server
  // rendering it bakes the token-less 401 state into the HTML for signed-in users too.
  { path: 'notifications', renderMode: RenderMode.Client },
  { path: 'account', renderMode: RenderMode.Client },
  { path: 'account/**', renderMode: RenderMode.Client },

  { path: '**', renderMode: RenderMode.Server },
];
