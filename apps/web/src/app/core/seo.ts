import { DOCUMENT } from '@angular/common';
import { LocaleStore } from './i18n/locale-store';
import { localeAlternates, withLocale } from './i18n/locales';
import { Injectable, inject } from '@angular/core';
import { Meta, Title } from '@angular/platform-browser';

/**
 * Canonical origin for this deployment. Canonical and og:url must be absolute and must
 * point at the public site — never at `location.origin`, which would emit
 * `http://localhost:4200/…` in dev and, worse, bake a preview host into any page
 * rendered from a staging deploy. Change this if the domain changes.
 */
export const SITE_ORIGIN = 'https://hostelhive.com';

/** Fallbacks used when a page supplies nothing of its own. */
const DEFAULT_TITLE = 'HostelHive — Find verified hostels in Pakistan';
const DEFAULT_DESCRIPTION =
  'Search verified hostels, PGs and co-living across Pakistan. Filter by city, budget, gender and room sharing — no brokers, no surprises.';
const DEFAULT_IMAGE = `${SITE_ORIGIN}/hostelhive-logo.png`;

export interface SeoConfig {
  title: string;
  /**
   * Overrides `title` for Open Graph and Twitter only.
   *
   * The two want different things. `<title>` leads with the hostel's name, because that
   * is what a branded or returning search looks for. A shared card has no such context —
   * nobody in a WhatsApp group recognises "Al-Madina Hostel" — so it leads with what the
   * place *is*: type, area, price. Airbnb does the same, dropping the property name from
   * `og:title` entirely.
   */
  socialTitle?: string;
  description?: string;
  /**
   * Path only, e.g. `/hostel/al-madina`. Query strings are dropped from the canonical.
   *
   * Write it without a language prefix — the active one is added when the canonical is
   * built, so each language canonicalises to itself rather than all of them pointing at
   * English, which would ask Google to drop every translated page from the index.
   */
  path?: string;
  image?: string;
  /** `noindex` for anything private or thin — auth screens, the consoles, tokened links. */
  noindex?: boolean;
  /** og:type — `website` for listings pages, `article` for editorial. */
  type?: 'website' | 'article';
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
 * attached to the next one.
 */
@Injectable({ providedIn: 'root' })
export class Seo {
  private readonly meta = inject(Meta);
  private readonly titleService = inject(Title);
  private readonly doc = inject(DOCUMENT);
  private readonly locale = inject(LocaleStore);

  /** Applies the full head for a page: title, description, canonical, Open Graph, Twitter. */
  apply(config: SeoConfig): void {
    const title = config.title || DEFAULT_TITLE;
    const description = config.description?.trim() || DEFAULT_DESCRIPTION;
    const image = config.image || DEFAULT_IMAGE;
    // The language-free path is what the alternates are built from; the active language
    // is what this page canonicalises to.
    const basePath = config.path ?? '/';
    const url = `${SITE_ORIGIN}${withLocale(this.locale.active(), basePath)}`;

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

    this.setCanonical(url);
    this.setAlternates(basePath, !!config.noindex);

    const social = config.socialTitle?.trim() || title;
    this.meta.updateTag({ property: 'og:title', content: social });
    this.meta.updateTag({ property: 'og:description', content: description });
    this.meta.updateTag({ property: 'og:url', content: url });
    this.meta.updateTag({ property: 'og:image', content: image });
    this.meta.updateTag({ property: 'og:type', content: config.type ?? 'website' });
    this.meta.updateTag({ property: 'og:site_name', content: 'HostelHive' });

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
   * A `noindex` page emits none. Alternates advertise a page for indexing, which directly
   * contradicts asking for it to be left out.
   */
  private setAlternates(basePath: string, noindex: boolean): void {
    this.doc.head
      .querySelectorAll('link[rel="alternate"][data-seo="hreflang"]')
      .forEach((el) => el.remove());
    if (noindex) return;

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
   * Rewrites `<link rel="canonical">`, creating it on first use.
   *
   * Matters most on `/search`, where every filter permutation is a distinct URL serving
   * near-identical content; without a canonical those compete with each other and split
   * whatever authority the page earns.
   */
  private setCanonical(url: string): void {
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
}
