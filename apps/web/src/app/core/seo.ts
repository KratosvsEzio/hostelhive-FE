import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import { LocaleStore } from './i18n/locale-store';
import { isLocaleCode, localeAlternates, localeFor, withLocale } from './i18n/locales';
import { DestroyRef, Injectable, PLATFORM_ID, computed, inject, signal } from '@angular/core';
import { Meta, Title } from '@angular/platform-browser';
import { TranslocoService } from '@jsverse/transloco';

/**
 * Canonical origin for this deployment. Canonical and og:url must be absolute and must
 * point at the public site — never at `location.origin`, which would emit
 * `http://localhost:4200/…` in dev and, worse, bake a preview host into any page
 * rendered from a staging deploy. Change this if the domain changes.
 */
export const SITE_ORIGIN = 'https://hostelhive.com';

const DEFAULT_IMAGE = `${SITE_ORIGIN}/hostelhive-logo.png`;

export interface SeoConfig {
  title: string;
  /**
   * Overrides `title` for Open Graph and Twitter only.
   *
   * Both carry the property name — a card that cannot be attributed to a place is worth
   * little when WhatsApp is the main sharing channel. They still differ in shape: `<title>`
   * can afford the trailing "| HostelHive" brand suffix, while a shared card is truncated
   * around 60–90 characters, so this drops the brand and keeps only the facts that decide a
   * tap — price, and whether meals are included.
   */
  socialTitle?: string;
  description?: string;
  /**
   * Path only, e.g. `/hostel/al-madina`. Query strings are dropped from the canonical.
   *
   * Write it without a language prefix — the active one is added when the canonical is
   * built, so each language canonicalises to itself rather than all of them pointing at
   * English, which would ask Google to drop every translated page from the index.
   *
   * Leave it out and the page gets **no** canonical and **no** `og:url` — any left by the
   * previous page are removed. There is no default:
   * one used to be `/`, which made every page without a path declare itself a duplicate of
   * the home page, and made a shared link to it preview as the home page. A scraper with no
   * `og:url` falls back to the URL it fetched, which is the honest answer for a page that
   * has no address of its own (a filtered search, a not-found slug).
   *
   * A `noindex` page never gets a canonical, even with a path. A canonical names the URL to
   * index in place of this one, which contradicts asking for it to be left out — the same
   * reason it gets no alternates. Its `og:url` is still written from the path, since a share
   * card has nothing to do with the index.
   */
  path?: string;
  image?: string;
  /**
   * `noindex` for anything private or thin — auth screens, the consoles, tokened links,
   * filtered searches, not-found pages. Also suppresses the canonical and alternates.
   */
  noindex?: boolean;
  /** og:type — `website` for listings pages, `article` for editorial. */
  type?: 'website' | 'article';
  /**
   * A head the page will replace once its data arrives — a listing still loading, say.
   *
   * It is written like any other, so crawlers and the tab still get a sensible title in
   * the meantime, but `Seo.settled` stays false until an `apply` without the flag
   * replaces it: analytics waits for the settled head rather than recording a placeholder.
   */
  provisional?: boolean;
  /**
   * The language the page's content is written in, for a page that exists in one only —
   * see `SINGLE_LANGUAGE_PAGES` (core/i18n/content-locale.ts).
   *
   * The canonical and `og:url` then name that language's address from every prefix, so
   * `/ur/privacy-policy` points at `/en/privacy-policy` rather than at itself; no `hreflang`
   * is written, since there is no other language to name; and `og:locale` follows the
   * content rather than the URL. The title and description stay in the active language —
   * they label the reader's tab, and a search engine takes its own from the canonical.
   *
   * `noindex` still wins: no canonical and no alternates. A code that is not a language the
   * site serves is ignored and the page canonicalises to the active one — this runs during
   * a server render, where a thrown error costs the whole page.
   */
  contentLocale?: string;
}

/**
 * Owns everything in `<head>` that search engines and social crawlers read.
 *
 * Written so it works during SSR: the tags have to exist in the server-rendered HTML,
 * because crawlers that do not execute JavaScript never see anything a client-side
 * effect adds afterwards. Angular's Meta/Title services and DOCUMENT are both
 * server-safe, so the same code path serves both renders.
 *
 * Every setter overwrites rather than appends — Angular reuses components across
 * navigations, so appending would leave the previous page's description and JSON-LD
 * attached to the next one. A tag a page has no value for is removed rather than left
 * alone, for the same reason: "not written" would mean "still the previous page's".
 *
 * Overwriting covers the single slots — title, description, robots, canonical, Open
 * Graph — because every navigation ends in exactly one `apply` that rewrites them all.
 * A page that owns its head (route data `head: 'page'`) calls it from its own effect;
 * every other route gets it from `RouteHeadStrategy` (core/route-head.ts), which applies
 * an indexable default for `head: 'index'` and a `noindex` one for everything else. It
 * does not cover JSON-LD, whose ids are per page type: no other page ever writes
 * `listing`, so a page that sets one also has to remove it when it goes, which is what
 * `clearOnDestroy` is for.
 *
 * The title is part of the head, and only `apply` writes `<title>` — nothing else sets
 * it, so it is always in the same language as the rest of the head. Routes without a
 * page of their own get theirs from `RouteHeadStrategy`, which composes the default
 * title and passes it through `apply` like any page would.
 */
@Injectable({ providedIn: 'root' })
export class Seo {
  private readonly meta = inject(Meta);
  private readonly titleService = inject(Title);
  private readonly doc = inject(DOCUMENT);
  private readonly locale = inject(LocaleStore);
  private readonly i18n = inject(TranslocoService);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  /**
   * The JSON-LD ids, and the preload, that a live page has claimed through `clearOnDestroy`,
   * counted per registration. Read by `clearUnclaimed`.
   */
  private readonly claimedIds = new Map<string, number>();
  private claimedPreloads = 0;

  /** Whether the last `apply` was a placeholder — see `SeoConfig.provisional`. */
  private readonly _provisional = signal(false);

  /**
   * The head describes the page in the active language — analytics reads the title once
   * this holds.
   *
   * False while the active language's strings are still loading, and while the last
   * `apply` was provisional. Any later `apply` without the flag settles it.
   */
  readonly settled = computed(() => this.locale.ready() && !this._provisional());

  /**
   * Applies the full head for a page: title, description, robots, canonical, hreflang,
   * Open Graph (including `og:locale`) and Twitter.
   *
   * The only writer of `<title>`. Called once per navigation, by whoever owns the head of
   * the route — the page itself or the route-level default; see the class comment — and
   * again by a page that replaces a provisional head once its data arrives.
   */
  apply(config: SeoConfig): void {
    // Set from every call, so the flag describes the head currently written.
    this._provisional.set(config.provisional ?? false);

    // Fallbacks for a page that supplies nothing of its own. Translated like everything
    // else here: a French visitor landing on a page with no copy of its own should still
    // get a French title, not the English one by default.
    const title = config.title || this.i18n.translate<string>('seo.defaultTitle');
    const description =
      config.description?.trim() || this.i18n.translate<string>('seo.defaultDescription');
    const image = config.image || DEFAULT_IMAGE;
    // The language-free path is what the alternates are built from; the active language
    // is what this page canonicalises to. No path, no address — see `SeoConfig.path`.
    const basePath = config.path || null;
    // A single-language page canonicalises to its content language instead, and declares
    // no other — see `SeoConfig.contentLocale`. An unknown code is ignored, never thrown.
    const contentLocale = isLocaleCode(config.contentLocale) ? config.contentLocale : null;
    const urlLocale = contentLocale ?? this.locale.active();
    const url = basePath ? `${SITE_ORIGIN}${withLocale(urlLocale, basePath)}` : null;

    this.titleService.setTitle(title);
    this.meta.updateTag({ name: 'description', content: description });

    // Thin, private or per-user pages must stay out of the index. Omitting the tag is
    // not the same as setting it: without this a page that was previously indexable
    // keeps its old directive when the component is reused across a navigation.
    if (config.noindex) {
      this.meta.updateTag({ name: 'robots', content: 'noindex, nofollow' });
    } else {
      this.meta.updateTag({
        name: 'robots',
        content: 'index, follow, max-image-preview:large',
      });
    }

    // `noindex` wins over a path: a canonical asks for some URL to be indexed in this
    // page's place, which is exactly what `noindex` declines.
    this.setCanonical(config.noindex ? null : url);
    this.setAlternates(config.noindex || contentLocale ? null : basePath);

    const social = config.socialTitle?.trim() || title;
    this.meta.updateTag({ property: 'og:title', content: social });
    this.meta.updateTag({ property: 'og:description', content: description });
    if (url) {
      this.meta.updateTag({ property: 'og:url', content: url });
    } else {
      // Removed rather than skipped: the previous page's URL would otherwise stay — and a
      // shared link would preview as that page.
      this.meta.removeTag('property="og:url"');
    }
    this.meta.updateTag({ property: 'og:image', content: image });
    this.meta.updateTag({ property: 'og:type', content: config.type ?? 'website' });
    this.meta.updateTag({ property: 'og:site_name', content: 'HostelHive' });
    // Exactly one, from the language this page is rendered in — see `Locale.ogLocale`. For a
    // single-language page that is its content's, matching the `og:url` beside it.
    this.meta.updateTag({
      property: 'og:locale',
      content: localeFor(urlLocale).ogLocale,
    });

    this.meta.updateTag({ name: 'twitter:card', content: 'summary_large_image' });
    this.meta.updateTag({ name: 'twitter:title', content: social });
    this.meta.updateTag({ name: 'twitter:description', content: description });
    this.meta.updateTag({ name: 'twitter:image', content: image });
  }

  /**
   * Declares the same page in every language it genuinely exists in.
   *
   * Without these, `/ur/hostels/lahore` and `/en/hostels/lahore` are two pages about the
   * same hostels competing for the same rankings. With them they are one page in two
   * languages, and Google serves whichever matches the searcher.
   *
   * Three rules make a set valid, and all three are easy to get wrong:
   * - **reciprocal** — every version links to every other, so each page emits the whole
   *   set rather than pointing only at its siblings
   * - **self-referencing** — the set includes the page emitting it
   * - **absolute** — relative hrefs are ignored outright
   *
   * `x-default` names what to serve a reader whose language is not in the set, which is
   * most of the world; it points at English.
   *
   * A `noindex` page emits none — `apply` passes `null` for it. Alternates advertise a page
   * for indexing, which directly contradicts asking for it to be left out. Nor does a page
   * without a path: there is no address to declare in other languages. Nor a page with a
   * `contentLocale`, which exists in no other language to declare.
   */
  private setAlternates(basePath: string | null): void {
    this.doc.head
      .querySelectorAll('link[rel="alternate"][data-seo="hreflang"]')
      .forEach((el) => el.remove());
    if (!basePath) return;

    for (const { hreflang, path } of localeAlternates(basePath)) {
      const link = this.doc.createElement('link');
      link.setAttribute('rel', 'alternate');
      link.setAttribute('hreflang', hreflang);
      link.setAttribute('href', `${SITE_ORIGIN}${path}`);
      link.setAttribute('data-seo', 'hreflang');
      this.doc.head.appendChild(link);
    }
  }

  /**
   * Rewrites `<link rel="canonical">`, creating it on first use, or removes it for `null`.
   *
   * Matters most on `/search`: the one unfiltered view of a curated place canonicalises to
   * its landing page, so the two do not compete and split whatever authority they earn.
   * Every other permutation is `noindex` and gets none — pointing thousands of filter URLs
   * at some other page would claim they duplicate it, which they do not.
   *
   * Removal, not skipping, is the point of `null`. A reused component, or the previous
   * page in a client navigation, leaves its canonical behind; keeping it is what made
   * `noindex` pages declare themselves copies of some other page. (`index.html` used to
   * ship one to the home page too, which is why it no longer ships any.)
   */
  private setCanonical(url: string | null): void {
    if (!url) {
      this.doc.head
        .querySelectorAll('link[rel="canonical"]')
        .forEach((el) => el.remove());
      return;
    }
    let link = this.doc.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (!link) {
      link = this.doc.createElement('link');
      link.setAttribute('rel', 'canonical');
      this.doc.head.appendChild(link);
    }
    link.setAttribute('href', url);
  }

  /**
   * Writes a JSON-LD block, replacing any previous one with the same id.
   *
   * Keyed by id so a page can emit several (a listing plus its breadcrumb trail) and so
   * navigating away does not leave the previous page's structured data describing the
   * new one — which is worse than emitting none, since it actively misdescribes.
   */
  setJsonLd(id: string, data: unknown): void {
    this.clearJsonLd(id);
    const script = this.doc.createElement('script');
    script.setAttribute('type', 'application/ld+json');
    script.setAttribute('data-seo', id);
    script.textContent = JSON.stringify(data);
    this.doc.head.appendChild(script);
  }

  clearJsonLd(id: string): void {
    this.doc.head
      .querySelectorAll(`script[data-seo="${id}"]`)
      .forEach((el) => el.remove());
  }

  /**
   * Removes every JSON-LD block, whatever its id.
   *
   * For a route that no page owns — the route-level default in `route-head.ts` — where any
   * block in the head was written by a page that has already gone. A page that writes its
   * own blocks clears them by id instead, through `clearOnDestroy`, because only it knows
   * which are its own.
   */
  clearAllJsonLd(): void {
    this.doc.head
      .querySelectorAll('script[type="application/ld+json"][data-seo]')
      .forEach((el) => el.remove());
  }

  /**
   * Removes a page's JSON-LD blocks (and, if asked, its preload) when the page is destroyed.
   *
   * Call it once, from the constructor of every page component that calls `setJsonLd`.
   * Structured data is keyed per page type — `organization`, `blog`, `listing` — and no
   * other page ever writes those ids, so "overwrite by id" only protects a component that
   * is reused. Left alone, a client navigation from the home page to the blog carries the
   * home page's `Organization` and `WebSite` into a document that is not the home page, and
   * the blog's `Blog` back again. The title, description and canonical need none of this:
   * they are single slots, rewritten by the next page's `apply`.
   *
   * On destroy rather than on `NavigationStart`: a navigation that keeps the same component
   * — another article, another listing, a query-only change, a language switch — must not
   * lose its blocks, and only the component knows whether it is going. Its own effect
   * replaces them by id while it lives.
   *
   * Safe on the server: `@angular/ssr` serialises the document before it destroys the
   * platform, so the rendered HTML keeps every block, and no page is destroyed mid-render —
   * a navigation during a server render becomes a redirect rather than a second page.
   *
   * Safe from one page to the next: when the route config changes the router destroys the
   * old component before it creates the new one, so the new page's blocks are written after
   * this has cleared the old — even where both pages use the same id.
   */
  clearOnDestroy(
    destroyRef: DestroyRef,
    jsonLdIds: readonly string[],
    opts: { preloadImage?: boolean } = {},
  ): void {
    for (const id of jsonLdIds) this.claimedIds.set(id, (this.claimedIds.get(id) ?? 0) + 1);
    if (opts.preloadImage) this.claimedPreloads++;
    destroyRef.onDestroy(() => {
      for (const id of jsonLdIds) {
        const left = (this.claimedIds.get(id) ?? 1) - 1;
        if (left > 0) this.claimedIds.set(id, left);
        else this.claimedIds.delete(id);
        this.clearJsonLd(id);
      }
      if (opts.preloadImage) {
        this.claimedPreloads--;
        this.preloadImage(null);
      }
    });
  }

  /**
   * Removes every JSON-LD block, and the preload, that no live page has claimed through
   * `clearOnDestroy`. Browser only; `RouteHeadStrategy` calls it when a navigation lands on a
   * page-owned route.
   *
   * For the server-rendered blocks `clearOnDestroy` never gets to clear. A visitor who clicks
   * a link before the app has booted replaces the first navigation before the server page's
   * component is ever created in the browser, so nothing registered its ids: a blog article's
   * `article` and `breadcrumb` stayed in the head of the home page they clicked through to
   * (Trello #138).
   *
   * Safe at that point because the router has already destroyed the old page and created the
   * new one, so every page still showing has claimed its ids — its blocks stay, even before
   * its effect has written them. A no-op on the server, where nothing is stale and the
   * rendered HTML must keep every block.
   */
  clearUnclaimed(): void {
    if (!this.isBrowser) return;
    this.doc.head
      .querySelectorAll('script[type="application/ld+json"][data-seo]')
      .forEach((el) => {
        if (!this.claimedIds.has(el.getAttribute('data-seo') ?? '')) el.remove();
      });
    if (this.claimedPreloads === 0) this.preloadImage(null);
  }

  /**
   * Asks the browser to start fetching the page's headline image immediately.
   *
   * Written from the server, which is the whole point: the hero is the LCP element on a
   * listing, and without this it is not discovered until the bundle has parsed, the route
   * has resolved and the component has rendered an `<img>` — several seconds of a patchy
   * mobile connection after the HTML arrived. A preload in the SSR head puts the request in
   * flight while the page is still downloading its scripts.
   *
   * `fetchpriority="high"` matches the `<img>` it is preloading; a mismatch makes the
   * browser fetch the image twice. One at a time and replaced on navigation — preloading
   * the previous listing's photograph would cost bandwidth for an image nobody will see,
   * and this audience pays for it.
   *
   * Pass `null` to clear. A page that preloads also clears it when it goes, through
   * `clearOnDestroy(…, { preloadImage: true })` — the next page has no reason to touch it,
   * so otherwise the listing's photograph would stay preloaded on every page after it.
   */
  preloadImage(url: string | null): void {
    this.doc.head
      .querySelectorAll('link[data-seo="preload-image"]')
      .forEach((el) => el.remove());
    if (!url) return;

    const link = this.doc.createElement('link');
    link.setAttribute('rel', 'preload');
    link.setAttribute('as', 'image');
    link.setAttribute('fetchpriority', 'high');
    link.setAttribute('data-seo', 'preload-image');
    link.setAttribute('href', url);
    this.doc.head.appendChild(link);
  }
}
