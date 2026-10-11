# Every route declares who owns its head; undeclared means noindex

**Status:** Accepted
**Area:** [ssr-seo-and-prerender](../../area/ssr-seo-and-prerender.md)

## Context

Only seven pages called `Seo.apply`. Every other route kept whatever head was already there:
- on a server render, `index.html`'s home-page head, so about, FAQs, contact and the legal pages
  declared `canonical https://hostelhive.com/` in all 18 languages while the sitemap listed them;
- after a client navigation, the previous page's canonical, robots, description and `hreflang`.

The route `title:` kept each tab looking right, which hid that nothing else was written.

## Decision

- Route data `head` in `app.routes.ts` names the owner, read deepest-wins down the matched tree:
  - `'page'`: the component calls `Seo.apply`;
  - `'index'`: a static page, which gets its own canonical, `hreflang` and a translated description
    from `descriptionKey`;
  - nothing: `noindex`, with no canonical.
- `RouteHeadStrategy`, the app's `TitleStrategy`, applies the default:
  - ~~the title is set synchronously, because GA reads it~~ **Superseded by PR #113:** the premise
    was false, because GA reads after the first change-detection tick. The title is now part of the
    head and written only by `Seo.apply`; see
    [the title is part of the head](./title-is-part-of-the-head.md);
  - the rest is set from a root effect gated on `LocaleStore.ready()`, which re-runs on a language
    switch;
  - the canonical is built from the matched segments, never the URL string.
- `index.html` ships no canonical, `og:url` or `og:locale`.
- `app.routes.spec.ts` walks every route, lazy ones included. A page must declare a head or sit under
  `DISALLOWED_PATHS`, a private area must not declare one, and the `'index'` routes must equal the
  sitemap's static paths.

## Alternatives rejected

- **A per-navigation "claimed" flag** (reset on `NavigationStart`, set by `apply`, default when
  unclaimed). A query-only navigation on a reused page (listing, search, article) re-runs no page
  effect, so the default would overwrite a correct indexable head. `LocaleStore.switchTo` also sets
  the language before `NavigationStart`, so a cached-language effect could claim before the reset.
- **Every component calls `apply`.** That is about 45 components and 70 route entries, and it cannot
  express "noindex unless said otherwise". Every future console page would have to remember.
- **An `ActivationEnd` or `ResolveEnd` hook.** Components already exist by `ActivationEnd`.
  `ResolveEnd` is skipped on navigations with nothing to resolve.
- **Applying the whole default synchronously in `updateTitle`.** On a language switch the new
  language's strings may not have loaded, so the served head would carry English text or raw keys.
- **A static `noindex` in `index.html`.** Any page whose `apply` failed would be de-indexed. A missing
  canonical is the safer failure.
- **Matching `/en/about;utm=x` from `snapshot.url`.** Matrix parameters survive `routePath` and would
  mint indexable self-canonical duplicates (found in QA review).

## Consequences

- A forgotten flag fails the build rather than silently shipping `noindex`. A private area must be
  added to `DISALLOWED_PATHS`, which also blocks it in robots.txt.
- ~~A route `title:` on a `'page'` route is re-set on every navigation and only a re-running page effect
  overwrites it (Trello #143).~~ Fixed by PR #113: `'page'` routes declare no title, and the strategy
  writes none.
- Default routes clear every JSON-LD block and the preload image, which partly covers the case of a
  click made before boot (Trello #138) when it lands on a default route.

## Evidence

- `apps/web/src/app/core/route-head.ts`, `apps/web/src/app/core/route-head.spec.ts`
- `apps/web/src/app/app.routes.ts` (`data.head`), `apps/web/src/app/app.routes.spec.ts` (the
  route-tree walk)
- `apps/web/src/app/core/seo.ts`, `apps/web/src/index.html`,
  `apps/web-e2e/src/head-route-defaults.spec.ts`
- Router order: `@angular/router` `_router-chunk.mjs` activate → `NavigationEnd` → `updateTitle`
- PR #104; run notes `docs/implement/Bugs/132.md` (decisions D1–D13, review finding F1)
