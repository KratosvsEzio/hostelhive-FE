import { DOCUMENT } from '@angular/common';
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
  /** Path only, e.g. `/hostel/al-madina`. Query strings are dropped from the canonical. */
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

  /** Applies the full head for a page: title, description, canonical, Open Graph, Twitter. */
  apply(config: SeoConfig): void {
    const title = config.title || DEFAULT_TITLE;
    const description = config.description?.trim() || DEFAULT_DESCRIPTION;
    const image = config.image || DEFAULT_IMAGE;
    const url = config.path ? `${SITE_ORIGIN}${config.path}` : SITE_ORIGIN;

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
