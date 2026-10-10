# Translate at runtime with Transloco, not with @angular/localize

**Status:** Accepted
**Area:** [i18n](../../area/i18n.md)

## Context
The product needs an in-page language switcher across 18 languages, including two right-to-left ones, in one SSR app that also ships as a Capacitor bundle.

## Decision
Use `@jsverse/transloco` with one JSON file per language in `apps/web/public/i18n/`. The browser loads files over HTTP on first use (`HttpTranslationLoader`, `apps/web/src/app/core/i18n/provide-i18n.ts`). During SSR they are read off disk (`apps/web/src/app/core/i18n/fs-translation-loader.ts`). English is the fallback language.

## Alternatives rejected
- **Angular's built-in `@angular/localize`.** It compiles one bundle per locale and picks it at build or deploy time, so it cannot switch language without a reload, which was the whole requirement (b58d3b9, `apps/web/src/app/core/i18n/provide-i18n.ts`).
- **A single bundle containing every language.** An English reader would download all 18 languages; one file per language means adding a language adds a file rather than payload for everyone (same file).
- **The HTTP loader during SSR.** A relative URL cannot be resolved on the server, so the page would render English under `lang="ur"` and a crawler would index English at an Urdu URL. An HTTP request from the server to itself could also deadlock a single-threaded render (`apps/web/src/app/core/i18n/fs-translation-loader.ts`).

## Consequences
- A missing key does not fail at runtime: the page falls back to English, or shows the raw key if en.json lacks it too. `tools/i18n-check.mjs` exists because of this, and it guards only `apps/web/public/i18n/en.json`.
- Code that reads a string once in TypeScript must wait for `LocaleStore.ready()` (`apps/web/src/app/core/i18n/locale-store.ts`).
- SSR depends on `PendingTasks` wrapping the disk read. Without it the page serialized with blank labels (3efe195).
- The library needs its own testing provider (`lib/src/testing/provide-transloco-testing.ts`), because it took its first Transloco dependency in c54a56b.

## Evidence
- b58d3b9 feat(i18n): runtime language switching across 14 locales
- 3efe195 fix(ssr): wait for translations before serializing the page
- f2c30b0 fix(i18n): resolve translations under ng serve, not just from a built bundle
- `apps/web/src/app/app.config.ts` (comment on `provideI18n()`), `apps/web/src/app/app.config.server.ts`
