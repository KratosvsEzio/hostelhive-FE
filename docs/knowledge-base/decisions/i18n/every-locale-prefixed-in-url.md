# Every locale, English included, is a path prefix, and the URL is the source of truth

**Status:** Accepted
**Area:** [i18n](../../area/i18n.md)

## Context
The first version (b58d3b9) served English unprefixed and other languages under `/<code>/`, with localStorage as a preference. Language switching then worked exactly once. All 117 `routerLink`s and about 40 `router.navigate` calls built bare paths, so the first click after choosing German went to an unprefixed URL, which read as English. An unprefixed URL was also ambiguous: it could mean "English on purpose" or "the visitor's language, prefix missing", so `LocaleSync` carried a one-shot redirect to guess between the two.

## Decision
Every page lives under a language prefix, `/en/…` included. Routes are mounted twice: a `:locale` tree, matched only for known codes by `localePrefixMatcher`, and a bare tree whose only job is the `keepLocale` guard, which redirects to the prefixed form. Links stay plain absolute paths: `LocaleLink` (`a[routerLink]`) rewrites the binding, and `HH_LINK_LOCALISER` does the same for library components. The URL decides the language. localStorage (`hh.locale`, `hh.locale.chosen`) only decides where to send an unprefixed arrival.

## Alternatives rejected
- **English unprefixed.** It needs special-case code everywhere and makes unprefixed URLs ambiguous (fbe7625).
- **Threading a locale helper through every `router.navigate`.** It fixes the 40 call sites once, then rots: the next new navigation silently drops the prefix. A guard on the bare tree catches every navigation, whoever wrote it (fbe7625).
- **Rewriting the rendered `href` instead of the binding.** The href a crawler follows and the click a person makes would come from different values (`apps/web/src/app/core/i18n/locale-link.ts`).
- **Language held only in localStorage.** Search engines never see it, and a shared link would open in the recipient's language instead of the sender's (b58d3b9).

## Consequences
- Every unprefixed URL costs one redirect.
- `hreflang` alternates and self-referencing canonicals per language ship with this (`localeAlternates` in `apps/web/src/app/core/i18n/locales.ts`).
- Route-area checks must compare `routePath(url)`, not `router.url`. A raw `/de/search` does not match '/search'. Code written before this change read fixed segment positions and broke silently: `hostPagePath` in `apps/web/src/app/layout/host-shell/host-route.ts` and the server render-mode table in `apps/web/src/app/app.routes.server.ts` both had to be fixed later.
- The sitemap lists only prefixed URLs. robots.txt has to disallow every prefixed form too. The static file missed them until PR #49 replaced it with one generated per language (`apps/web/src/app/core/robots.ts`, see [ssr-seo-and-prerender](../../area/ssr-seo-and-prerender.md)).
- `LocaleSync` reads the entry URL from `PlatformLocation`, because `router.url` is still `/` during app init. It also records whether the URL itself named a language (`noteUrlNamedLanguage`), so the country guess cannot override a shared link.

## Evidence
- fbe7625 feat(i18n): give every URL a language, and keep navigation inside it (PR #30)
- 1e3fe26 fix(i18n): let a URL's language outrank the country guess
- `apps/web/src/app/core/i18n/keep-locale.ts`, `apps/web/src/app/core/i18n/locale-prefix-matcher.ts`, `apps/web/src/app/core/i18n/locale-sync.ts`, `apps/web/src/app/app.routes.ts`
