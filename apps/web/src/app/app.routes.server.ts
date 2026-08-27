import { RenderMode, ServerRoute } from '@angular/ssr';

/**
 * Authenticated areas, which must never be server-rendered.
 *
 * Listed once and expanded below into both shapes a URL can arrive in.
 */
const CLIENT_ONLY = [
  // Console: guards and session must not run on the server, and the admin code stays out
  // of the public render path.
  'host',
  'admin',
  'moderator',
  'forbidden',
  // The seeker account area is per-user with zero SEO value: server rendering it bakes the
  // token-less 401 state into the HTML for signed-in users too.
  'notifications',
  'account',
];

/**
 * One entry per path, in both the bare and the language-prefixed form.
 *
 * **This is the whole fix.** Every entry here used to be written bare — `host`, `account/**`
 * — from before English moved to `/en/…`. Since then no real URL has matched any of them:
 * `/en/host/nHelLt/tenants` splits to `['en', 'host', …]`, the table has no `en` branch, and
 * the request fell through to the `**` catch-all and was **server-rendered**.
 *
 * So the console has been rendering on the server for a while, which is exactly what these
 * entries exist to prevent. It surfaced as `ReferenceError: window is not defined` from a
 * constructor that has read `window` since the first commit — nothing changed there; what
 * changed is that it started running somewhere without one.
 *
 * A leading `*` is the matcher's single-segment wildcard (see `traverseBySegments` in
 * `@angular/ssr`), so one wildcard segment ahead of each path catches every language without
 * naming eighteen of them. The bare forms stay because an unprefixed URL is real until the
 * redirect to its prefixed twin lands.
 */
function clientOnly(paths: readonly string[]): ServerRoute[] {
  return paths.flatMap((path) => [
    { path, renderMode: RenderMode.Client } as ServerRoute,
    { path: `${path}/**`, renderMode: RenderMode.Client } as ServerRoute,
    { path: `*/${path}`, renderMode: RenderMode.Client } as ServerRoute,
    { path: `*/${path}/**`, renderMode: RenderMode.Client } as ServerRoute,
  ]);
}

export const serverRoutes: ServerRoute[] = [
  // Public seeker: home prerendered for SEO; search / listing / auth render on
  // demand on the server (dynamic :slug params, query state).
  { path: '', renderMode: RenderMode.Prerender },

  ...clientOnly(CLIENT_ONLY),

  { path: '**', renderMode: RenderMode.Server },
];
