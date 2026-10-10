# Public content

The marketing and editorial pages around the marketplace — About, Blog, Careers, Contact, FAQs, Image credits, the three legal pages — plus the become-a-host wizard (`/host/listings/new`) and the image-credit pipeline behind the home and city photographs. All are public and server-rendered except the wizard, which is `authGuard`ed and client-only. The home page itself is [landing-page](./landing-page.md).

## Where it lives
- `apps/web/src/app/app.routes.ts` — `/about`, `/faqs`, `/blog`, `/careers`, `/contact`, `/credits`, `/privacy-policy`, `/terms-of-service`, `/service-policy`, `/host/listings/new[/payment]`.
- `apps/web/src/app/features/public/{about,careers,contact}/` — static templates keyed through Transloco.
- `apps/web/src/app/features/public/faqs/faqs.ts` — Q&A content as an English array in TS (the old `/account/help` redirects here).
- `apps/web/src/app/features/public/legal/` — privacy, terms, service policy: English HTML, no Transloco.
- `apps/web/src/app/features/public/blog/` — `blog.routes.ts`, `blog.ts` (index), `blog-article/blog-article.ts` + `blog-rich-text.ts` (renderer), `blog-post.model.ts` (block types), `blog-posts.ts` (`BLOG_POSTS`, the archive), `blog-figures.ts` (photographs per section).
- `apps/web/src/app/features/public/credits/credits.ts` — `/credits`, imports both CREDITS files at build time.
- `apps/web/public/hero/CREDITS.json`, `apps/web/public/cities/CREDITS.json`, `apps/web/public/blog/CREDITS.json` — licence, source and author per image.
- `tools/fetch-hero-images.mjs`, `tools/fetch-city-images.mjs` — download/crop (sharp) the tiles and social cards and **rewrite** the CREDITS file wholesale from the list in the script.
- `apps/web/src/app/features/public/onboarding/onboarding-wizard/onboarding-wizard.ts`, `apps/web/src/app/features/public/onboarding/onboarding-payment/onboarding-payment.ts`.

## How it works
- **Blog**: posts are typed blocks in `blog-posts.ts`; figures are attached by heading (`at`) in `blog-figures.ts` and woven in by `withFigures()` before reading time is computed. `BlogArticle` renders spans with `@switch`, never `[innerHTML]`, and sets title, `article` and breadcrumb JSON-LD through `Seo`. Chrome is translated; headlines and prose stay English under `lang="en"`. `sitemapPaths()` lists every post.
- **Credits**: `toCredits` flattens both CREDITS shapes (Commons: author + licence; Pexels: no attribution required); `shareAlikeCount` drives the CC BY-SA declaration so the page cannot claim a different number than the data.
- **Image pipeline**: edit the `items` / `cities` list in the tool (licence lives next to the URL), run `node tools/fetch-city-images.mjs` or `tools/fetch-hero-images.mjs`, commit the tiles, `social/` cards and regenerated CREDITS.json.
- **Become-a-host wizard**: one long form (basic info, location, media, rooms, amenities from `OffersApi`, time zone) with a localStorage draft (`hh:onboarding:draft`). "Save and continue" creates or updates the hostel (`HostelsApi`), refreshes the session (the backend grants the host role on create), then goes to `/host/listings/new/payment`, which reads the draft back and lists products from `ProductsApi`.

## Reuse, don't rebuild
- New article: add a `BlogPost` to `blog-posts.ts` using `BlogBlock`/`BlogSpan`; its photographs go in `blog-figures.ts` **and** `apps/web/public/blog/CREDITS.json` with the photographer's `sourceDescription`.
- New hero or city image: change the tool's list and re-run it; never hand-edit the generated CREDITS.json (the next run overwrites it).
- `Seo.apply` / `setJsonLd` for any new public page head; add indexable paths to `STATIC_PATHS` in `apps/web/src/app/features/public/landing/sitemap-urls.ts`.

## Traps
- **Never name a place an image's metadata does not.** Captions, alt text and file names are claims; `blog-figures.spec.ts` ("never claims a place the photographer did not") enforces it for the blog. The city tiles have no such test, and their six Commons entries carry only `commonsPage`, not a `sourceDescription` (`apps/web/public/cities/CREDITS.json`).
- **Onboarding payment is fake.** `OnboardingPayment.pay()` is a `setTimeout` that sets `paid` with a TODO for the real API (`onboarding-payment.ts`). Subscription billing proper is [host-billing-and-subscription](./host-billing-and-subscription.md).
- **The wizard's step machinery is dead.** The class doc and `stepLabels`/`step` describe a 5-step wizard; the template renders every section at once (`onboarding-wizard.html`; RISKS R17).
- `OnboardingPayment` loads products in `afterNextRender` from its constructor; `lib/src/ui/lib/dialog-focus/dialog-focus.ts` documents that hook silently not firing in idle zoneless renders.
- `OnboardingPayment.genderLabel()` and its draft reader know only boys/girls/co-living — a backpacker draft shows as "Boys".
- **Legal pages are English on purpose** (commit `a9e254e`: "needs a professional translator") and link home with a bare `routerLink="/"`.
- `faqs.ts` copy is untranslated TS and makes product claims (verification, booking, contact reveal) — check them against the current flows when those change.

## Decisions
- [Blog posts are typed blocks shipped in code, never HTML](../decisions/public-content/blog-posts-are-typed-blocks-in-code.md)
- [An image may name a place only if its source metadata does](../decisions/public-content/image-place-claims-from-source-metadata.md)
- [Six city tiles stay CC BY-SA, with the share-alike declaration on /credits](../decisions/public-content/keep-cc-by-sa-city-tiles-with-declaration.md)

## See also
- [landing-page](./landing-page.md) — where the hero and city tiles are shown
- [ssr-seo-and-prerender](./ssr-seo-and-prerender.md) — `Seo`, sitemap, robots
- [i18n](./i18n.md) — what is and is not translated
- [host-console](./host-console.md) — the hostel form the wizard parallels
- `docs/RISKS.md` (R17), `docs/HostelHive-Frontend-Build-Plan.md`
