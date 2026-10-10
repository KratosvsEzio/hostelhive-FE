# Authenticated areas render client-only, in every locale shape

**Status:** Accepted
**Area:** [ssr-seo-and-prerender](../../area/ssr-seo-and-prerender.md)

## Context

The server has no session: the session is restored in the browser by an app initializer that returns
early on the server, and the guards return `true` there. A server-rendered console or account page
therefore runs its constructors with no `window` and no token, and bakes a signed-out or 401 view into
the HTML. The render-mode entries were written bare (`host`, `account/**`). Once English moved to
`/en/...`, no real URL matched them. `/en/host/<id>/tenants` fell through to `**` and was rendered on
the server, which showed up as `ReferenceError: window is not defined`.

## Decision

`CLIENT_ONLY` in `app.routes.server.ts` lists `host`, `admin`, `moderator`, `forbidden`,
`notifications` and `account` once. `clientOnly()` expands each into four `RenderMode.Client` entries:
`path`, `path/**`, `*/path`, `*/path/**`. The leading `*` is `@angular/ssr`'s single-segment wildcard,
so one entry covers every locale without naming all eighteen.

## Alternatives rejected

- **Make the consoles server-safe and render them.** No benefit: they are per-user, have no SEO value,
  and would still render the token-less state. It would also put admin code in the public render path.
- **One entry per locale (`en/host`, `ur/host`, ...).** It has to be kept in step with `LOCALES`, and
  forgetting one brings the bug back for that language.
- **Bare entries only.** The original state, which broke when English got a prefix. The bare forms
  stay because an unprefixed URL is real until its redirect lands.

## Consequences

- A new authenticated area goes into `CLIENT_ONLY`, not into a hand-written entry.
- These pages ship an empty shell to crawlers. robots.txt keeps crawlers out: every `CLIENT_ONLY` path
  is in `DISALLOWED_PATHS` (`apps/web/src/app/core/robots.ts`), bare and under every language prefix,
  and `robots.spec.ts` fails if one is missing.
- Seeker pages that are public but call an authenticated endpoint are still server-rendered and must
  skip that fetch on the server themselves (see the area file).

## Evidence

- `apps/web/src/app/app.routes.server.ts` (doc comment on `clientOnly`)
- `apps/web/src/app/core/auth/guards.ts` (SSR returns `true`)
- Commit `2b679d6` feat(forms): one hostel form for both consoles, and stop lying to the user (the
  `clientOnly` change is in this commit, though its message does not mention it)
- `docs/DEPLOY.md` "Rendering modes"
