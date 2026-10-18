# Public content

The marketing and editorial pages around the marketplace — About, Blog, Careers, Contact, FAQs, Image credits, the three legal pages — plus the become-a-host wizard (`/host/listings/new`) and the image-credit pipeline behind the home and city photographs. All are public and server-rendered except the wizard, which is `authGuard`ed and client-only. The home page itself is [landing-page](./landing-page.md).

## Where it lives
- `apps/web/src/app/app.routes.ts` — `/about`, `/faqs`, `/blog`, `/careers`, `/contact`, `/credits`, `/privacy-policy`, `/terms-of-service`, `/service-policy`, `/host/listings/new`.
- `apps/web/src/app/features/public/about/`, `careers/`, `contact/` — static templates keyed through Transloco.
- `apps/web/src/app/features/public/faqs/faqs.ts` — Q&A content as an English array in TS (the old `/account/help` redirects here).
- `apps/web/src/app/features/public/legal/` — privacy, terms, service policy: English HTML, no Transloco.
- `apps/web/src/app/features/public/blog/` — `blog.routes.ts`, `blog.ts` (index), `blog-article/blog-article.ts` + `blog-rich-text.ts` (renderer), `blog-post.model.ts` (block types), `blog-posts.ts` (`BLOG_POSTS`, the archive), `blog-figures.ts` (photographs per section).
- `apps/web/src/app/features/public/credits/credits.ts` — `/credits`, imports both CREDITS files at build time.
- `apps/web/public/hero/CREDITS.json`, `apps/web/public/cities/CREDITS.json`, `apps/web/public/blog/CREDITS.json` — licence, source and author per image.
- `tools/fetch-hero-images.mjs`, `tools/fetch-city-images.mjs` — download/crop (sharp) the tiles and social cards and **rewrite** the CREDITS file wholesale from the list in the script.
- `apps/web/src/app/features/public/onboarding/onboarding-wizard/onboarding-wizard.ts` — the become-a-host wizard.
- `apps/web/src/app/services/onboarding-draft-store.ts` — `OnboardingDraftStore`, the only code that touches the wizard's localStorage draft, and `provideOnboardingDraftCleanup()` (registered in `apps/web/src/app/app.config.ts`).

## How it works
- **Head tags**: About, FAQs, Careers, Contact, Credits and the legal pages never call `Seo`. Their routes carry `data: { head: 'index' }` (plus a `descriptionKey` on the first four), and `RouteHeadStrategy` gives them their own canonical, `hreflang` and translated description. The blog index and articles own their head (`head: 'page'`); the index applies it from a `ready()`-gated effect so a language switch rebuilds it. See [ssr-seo-and-prerender](./ssr-seo-and-prerender.md).
- **Blog**: posts are typed blocks in `blog-posts.ts`; figures are attached by heading (`at`) in `blog-figures.ts` and woven in by `withFigures()` before reading time is computed. `BlogArticle` renders spans with `@switch`, never `[innerHTML]`, and sets title, `article` and breadcrumb JSON-LD through `Seo`. Chrome is translated; headlines and prose stay English under `lang="en"`. The archive's language is `BLOG_CONTENT_LOCALE` (`blog-post.model.ts`): every article canonicalises to `/en/blog/<slug>` from every prefix, with no `hreflang`, and `sitemapPaths()` lists each post once, in English. Its JSON-LD URLs come from `Seo.pageUrl`. The blog index stays per-language.
- **Credits**: `toCredits` flattens both CREDITS shapes (Commons: author + licence; Pexels: no attribution required); `shareAlikeCount` drives the CC BY-SA declaration so the page cannot claim a different number than the data.
- **Image pipeline**: edit the `items` / `cities` list in the tool (licence lives next to the URL), run `node tools/fetch-city-images.mjs` or `tools/fetch-hero-images.mjs`, commit the tiles, `social/` cards and regenerated CREDITS.json.
- **Become-a-host wizard**: one long form (basic info, location, media, rooms, amenities from `OffersApi`, time zone). "Save and continue" creates or updates the hostel (`HostelsApi`), refreshes the session on create (the backend grants the host role), reloads `HostPropertyStore` and opens the hostel's billing page, `/host/:id/subscription` (`landOnBilling`).
- **Wizard photos and the lead photo.** Each photo uploads on its own and gets an `attachmentId`. A hostel save links new ids through `attachment_ids`, which appends, so ids already sent are tracked in `linkedAttachmentIds` and never sent twice. The starred photo is saved by a separate `PUT /api/attachments/:id/mark_as_primary` (`markPrimary()`), sent after the save that links it and before leaving the page. It is best effort: a failure doesn't stop the host, and the next save retries it.
- **The wizard's draft belongs to the signed-in user.** `OnboardingDraftStore` keeps it in localStorage (`hh:onboarding:draft`) as `{ owner, ...fields }` under `SessionStore.user()?.id`: `read()` hands it back only to its owner and removes anyone else's, an ownerless (pre-owner) one or an unreadable one; `write()` does nothing when signed out. An effect deletes it when the session fully ends (user and token gone — sign-out, 401) or the user changes; a token-only restore leaves it alone. The wizard ends the draft once "Save and continue" succeeds (`endDraft()` — a `draftEnded` flag stops the persist effect writing it back); "Save and exit" keeps it so the host can come back.

## Reuse, don't rebuild
- New article: add a `BlogPost` to `blog-posts.ts` using `BlogBlock`/`BlogSpan`; its photographs go in `blog-figures.ts` **and** `apps/web/public/blog/CREDITS.json` with the photographer's `sourceDescription`.
- New hero or city image: change the tool's list and re-run it; never hand-edit the generated CREDITS.json (the next run overwrites it).
- `Seo.apply` / `setJsonLd` for any new public page head; add indexable paths to `STATIC_PATHS` in `apps/web/src/app/features/public/landing/sitemap-urls.ts`.

## Traps
- **Never name a place an image's metadata does not.** Captions, alt text and file names are claims; `blog-figures.spec.ts` ("never claims a place the photographer did not") enforces it for the blog. The city tiles have no such test, and their six Commons entries carry only `commonsPage`, not a `sourceDescription` (`apps/web/public/cities/CREDITS.json`).
- **Never touch `hh:onboarding:draft` directly.** Go through `OnboardingDraftStore`; a raw `localStorage` read or write skips the owner check and brings back the shared-browser leak. Anything new that keeps per-user data in localStorage should follow the same shape (or `FavoritesStore`'s) and key on the session user id.
- **The draft store must be created at startup.** `provideOnboardingDraftCleanup()` in `app.config.ts` is what deletes the draft at a sign-out on a page with no wizard; `onboarding-draft-store.spec.ts` checks the wiring by source text, so a move or rename has to update that test too.
- **The hostel payload has no lead-photo field.** `banner_id` was dropped by the backend and is gone (PR #79). A spec asserts it stays out of the wizard's payload. `mark_as_primary` returns 403 for a photo not yet attached to a hostel, so star a photo only after the save that links it.
- **The wizard's step machinery is dead.** The class doc and `stepLabels`/`step` describe a 5-step wizard; the template renders every section at once (`onboarding-wizard.html`; RISKS R17). Subscription billing is [host-billing-and-subscription](./host-billing-and-subscription.md).
- **Legal pages are English on purpose** (commit `a9e254e`: "needs a professional translator") and link home with a bare `routerLink="/"`.
- `faqs.ts` copy is untranslated TS and makes product claims (verification, booking, contact reveal) — check them against the current flows when those change.

## Decisions
- [Blog posts are typed blocks shipped in code, never HTML](../decisions/public-content/blog-posts-are-typed-blocks-in-code.md)
- [An image may name a place only if its source metadata does](../decisions/public-content/image-place-claims-from-source-metadata.md)
- [Six city tiles stay CC BY-SA, with the share-alike declaration on /credits](../decisions/public-content/keep-cc-by-sa-city-tiles-with-declaration.md)
- [The become-a-host draft belongs to the signed-in user and ends at sign-out or on "Save and continue"](../decisions/public-content/onboarding-draft-belongs-to-the-session-user.md)
- [The wizard saves the lead photo through mark_as_primary, after the save that links it](../decisions/public-content/wizard-lead-photo-via-mark-as-primary.md)

## See also
- [landing-page](./landing-page.md) — where the hero and city tiles are shown
- [ssr-seo-and-prerender](./ssr-seo-and-prerender.md) — `Seo`, sitemap, robots
- [i18n](./i18n.md) — what is and is not translated
- [host-console](./host-console.md) — the hostel form the wizard parallels
- `docs/RISKS.md` (R17), `docs/HostelHive-Frontend-Build-Plan.md`
