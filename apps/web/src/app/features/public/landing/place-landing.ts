import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { map } from 'rxjs';
import { SITE_ORIGIN, Seo } from '@core/seo';
import { Faq, faqJsonLd, placeFaqs } from './place-faqs';
import { SearchMap } from '@features/public/search/search-map/search-map';
import { GENDER_SEGMENTS, PLACES, findPlace } from './places';

/**
 * SEO landing page for a place, optionally narrowed by gender:
 * `/hostels/lahore`, `/hostels/lahore/girls`.
 *
 * Renders the real search experience with the place's filters pre-applied, rather than
 * reimplementing it — the map, cards, filters and pagination all come as they are. The
 * point of the route is that the filters live in the *path*: `?city=Lahore` is treated
 * as a variant of `/search` and crawled shallowly, while `/hostels/lahore` is a page in
 * its own right that can rank for "hostels in Lahore".
 *
 * Everything above the search is what stops these being ten copies of one template: a
 * unique H1, a sentence specific to the place, and links to the sibling pages.
 */
@Component({
  selector: 'hh-place-landing',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [SearchMap, RouterLink],
  templateUrl: './place-landing.html',
})
export class PlaceLanding {
  private readonly route = inject(ActivatedRoute);
  private readonly seo = inject(Seo);

  /** Rendered in the page as well as marked up — see the note in place-faqs.ts. */
  protected readonly faqs = signal<Faq[]>([]);

  private readonly params = toSignal(this.route.paramMap, { initialValue: null });

  protected readonly place = computed(() => findPlace(this.params()?.get('place') ?? null));

  /** The `/girls`, `/boys` or `/co-living` segment, when the URL carries one. */
  protected readonly genderSegment = computed(() => {
    const raw = this.params()?.get('gender');
    return raw ? (GENDER_SEGMENTS[raw] ?? null) : null;
  });

  protected readonly heading = computed(() => {
    const p = this.place();
    if (!p) return 'Hostels';
    const g = this.genderSegment();
    return g ? `${g.label} in ${p.name}` : `Hostels in ${p.name}`;
  });

  /**
   * Filters handed to the search component. Coordinates rather than a city string: search
   * resolves a picked place to a `near` radius, which is the same path the place-search
   * field uses, so these pages behave exactly like a manual search for that place.
   */
  protected readonly seed = computed<Record<string, string> | null>(() => {
    const p = this.place();
    if (!p) return null;
    const g = this.genderSegment();
    return {
      place: p.name,
      lat: String(p.lat),
      lng: String(p.lng),
      zoom: '11',
      ...(g ? { gender: g.gender } : {}),
    };
  });

  /** Sibling pages, for internal linking — the other genders for this place. */
  protected readonly genderLinks = computed(() => {
    const p = this.place();
    if (!p) return [];
    const current = this.params()?.get('gender') ?? null;
    return Object.entries(GENDER_SEGMENTS)
      .filter(([slug]) => slug !== current)
      .map(([slug, g]) => ({ path: `/hostels/${p.slug}/${slug}`, label: `${g.label} in ${p.name}` }));
  });

  /** Other cities, so every landing page links onward to its siblings rather than dead-ending. */
  protected readonly otherPlaces = computed(() => {
    const p = this.place();
    return PLACES.filter((x) => x.slug !== p?.slug).slice(0, 9);
  });

  constructor() {
    effect(() => {
      const p = this.place();
      const g = this.genderSegment();

      if (!p) {
        // An unknown slug is not a real page — never let it into the index.
        this.seo.apply({
          title: 'Place not found — HostelHive',
          description: 'We do not have a hostel guide for that place yet.',
          noindex: true,
        });
        this.seo.clearJsonLd('place-breadcrumb');
        this.seo.clearJsonLd('place-faq');
        this.faqs.set([]);
        return;
      }

      const path = g
        ? `/hostels/${p.slug}/${this.params()?.get('gender')}`
        : `/hostels/${p.slug}`;
      const what = g ? `${g.adjective} hostels` : 'hostels, PGs and co-living';
      // Rendered on the page as well as in the markup — Google requires the answer text
      // to be visible, and marking up content a visitor cannot see is a violation.
      this.faqs.set(placeFaqs(p.name, what));

      this.seo.apply({
        title: `${this.heading()} — verified ${what} | HostelHive`,
        description: `Find verified ${what} in ${p.name}. Compare prices, room sharing and amenities, and contact hosts directly — no brokers, no commission.`,
        path,
      });

      // A breadcrumb trail is what turns the URL shown under a result into
      // "hostelhive.com › Hostels › Lahore" instead of a raw path.
      this.seo.setJsonLd('place-breadcrumb', {
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Home', item: SITE_ORIGIN },
          {
            '@type': 'ListItem',
            position: 2,
            name: `Hostels in ${p.name}`,
            item: `${SITE_ORIGIN}/hostels/${p.slug}`,
          },
          ...(g
            ? [{ '@type': 'ListItem', position: 3, name: g.label, item: `${SITE_ORIGIN}${path}` }]
            : []),
        ],
      });

      // The rich result no international travel site competes for, because none of them
      // models a mess, a warden or a deposit quoted in months of rent.
      this.seo.setJsonLd('place-faq', faqJsonLd(this.faqs()));
    });
  }
}
