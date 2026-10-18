# Single-language pages canonicalise to their language, with no hreflang

**Status:** Accepted
**Area:** [ssr-seo-and-prerender](../../area/ssr-seo-and-prerender.md)

## Context

The privacy policy, terms of service, service policy and `/credits` are written only in English, but
every URL carries a language, so each one answers at 18 addresses (`/ur/privacy-policy`, …). Since
#129, each copy declared itself canonical with a full `hreflang` set, and the sitemap listed all 18 —
telling search engines a translation existed in every language. `core/i18n/locales.ts` already
calls that misleading for languages; nothing modelled it per page.

## Decision

- Route data `contentLocale: 'en'` on those four routes, read deepest-wins by `RouteHeadStrategy`
  and passed to `Seo.apply` as `SeoConfig.contentLocale`.
- On every language URL: canonical and `og:url` = `/en/<page>`, `og:locale` = `en_PK`, no
  `hreflang`. The title and description stay translated (they are the reader's tab label; Google
  takes the indexed title from the canonical). No `noindex` and no robots rule: `noindex` suppresses
  the canonical, and a `Disallow` would hide the canonical from crawlers.
- `SINGLE_LANGUAGE_PAGES` / `pageLocales` / `pageAlternates` (`core/i18n/content-locale.ts`) drive
  the sitemap: one `/en/<page>` entry with no `xhtml:link`. `app.routes.spec.ts` fails if the flagged
  routes and `SINGLE_LANGUAGE_PAGES` drift apart.
- The page still answers 200 at its own address, `<html lang dir>` follows the URL, and links keep the
  visitor's prefix. The English body is wrapped in `lang="en" dir="ltr"`; the back link is translated
  and sits outside the wrapper.

## Alternatives rejected

- **Translate the pages.** The user's call (2026-10-18): not for now; legal text needs review per
  language.
- **`noindex` the non-English copies, or `Disallow` them.** Either one loses the canonical signal.
- **Redirect `/xx/<page>` to `/en/<page>`.** That switches the whole app to English for a visitor who
  only clicked a footer link.
- **Per-component `Seo.apply` calls.** Three copies of what `RouteHeadStrategy` already owns.
- **A boolean `englishOnly`.** The value names the language, so a future single-language page in
  another language needs no new flag.
- **An "English only" note on the page.** New strings in 18 locales for no clear gain.

## Consequences

- Search engines see 4 indexable pages instead of 72. Already indexed `/xx/` copies consolidate over
  weeks and appear in Search Console as "Alternate page with proper canonical tag".
- A new English-only page needs both the route flag and a `SINGLE_LANGUAGE_PAGES` entry.
- **Extended to blog articles (Trello #197, 2026-10-19).** An article is a `head: 'page'` route, so it
  passes `contentLocale: BLOG_CONTENT_LOCALE` (`blog-post.model.ts`) to `Seo.apply` itself instead of
  route data (the same route serves the translated, noindex not-found page, and `app.routes.spec.ts`
  keeps route flags equal to `SINGLE_LANGUAGE_PAGES`). The sitemap passes the same constant to
  `pageLocales`/`pageAlternates`, so `core` does not import the blog. Article titles were already
  English, so the "titles stay translated" rule changes nothing there. Google sets a page's language
  from its visible content, and only the chrome of `/xx/blog/<slug>` differed, so the 18 copies were
  near-duplicates. 288 sitemap entries became 16. The blog index stays per-language: its heading,
  lede and controls are translated.
- JSON-LD URLs are built by `Seo.pageUrl`, which gives the same string as the canonical; the blog
  article and index were the first to use it (Trello #197).

## Evidence

- `apps/web/src/app/core/i18n/content-locale.ts`, `apps/web/src/app/core/seo.ts`,
  `apps/web/src/app/core/route-head.ts`, `apps/web/src/app/app.routes.ts`,
  `apps/web/src/app/features/public/landing/sitemap-urls.ts`, `features/public/legal/*.html`,
  `features/public/credits/credits.html`
- Specs: `core/seo.spec.ts`, `core/route-head.spec.ts`, `core/i18n/content-locale.spec.ts`,
  `app.routes.spec.ts`, `landing/sitemap-urls.spec.ts`, `legal/legal-pages.spec.ts`,
  `credits/credits.spec.ts`, e2e `apps/web-e2e/src/head-route-defaults.spec.ts`
- Run notes `docs/implement/Bugs/139.md` (decisions D1–D10, test matrix TC-01–37) and
  `docs/implement/Bugs/197.md` (blog articles; decisions D1–D12)
